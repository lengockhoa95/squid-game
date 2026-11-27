import * as THREE from 'three';
import {
  ELEMENTS, INPUT_BATCH, SLOT_LOOKS, effectStep, isElementId, type MinigameId, type MoveBatch, type QualityPreset, type StepFn,
} from '@sp/shared';
import type { CameraPreset, ClickHit, FrameInput, GameScene, SceneContext } from '../../core/GameScene.ts';
import { ResourceTracker } from '../../core/ResourceTracker.ts';
import { PlayerModel } from '../../player/PlayerModel.ts';
import { AnimationController, type Pose } from '../../player/AnimationController.ts';
import { FIXED_DT, PlayerController } from '../../player/PlayerController.ts';
import { ClickMarker } from '../../player/ClickMarker.ts';
import { LocalPredictor } from '../../player/LocalPredictor.ts';
import { RemoteInterpolator, createSample } from '../../player/RemoteInterpolator.ts';
import type { MatchNetAdapter, NetPlayer } from '../../network/types.ts';
import { VIEW_LOADERS, type MinigameView, type ViewFrame } from '../../minigames/framework/MinigameView.ts';
import { ElementEffectsView } from '../../elements/ElementEffectsView.ts';
import { elementUi } from '../../elements/elementUi.ts';

const MAX_STEPS_PER_FRAME = 6;
/** Other players are drawn this far in the past so there are always two snapshots to blend. */
const RENDER_DELAY_MS = 100;

interface Actor {
  model: PlayerModel;
  anim: AnimationController;
  interp: RemoteInterpolator;
  generation: number;
}

/**
 * The 3D side of a match. Loads the current minigame's view on demand, renders every player
 * (local one predicted when it can move, everyone else interpolated), handles spectating and
 * turns clicks/keys into game actions. All outcomes come from the server.
 */
class MatchScene implements GameScene {
  readonly root = new THREE.Scene();
  private readonly ctx: SceneContext;
  private readonly net: MatchNetAdapter;
  private readonly resources = new ResourceTracker();
  private readonly marker: ClickMarker;
  private readonly predictor = new LocalPredictor();
  private readonly actors = new Map<string, Actor>();
  private readonly cameraTarget = new THREE.Vector3();
  private readonly sample = createSample();
  private readonly batch: MoveBatch = { s: 0, i: [] };
  private readonly unsubscribe: () => void;
  private readonly participants = new Set<string>();
  private view: MinigameView | null = null;
  private viewRoot: THREE.Group | null = null;
  private viewResources: ResourceTracker | null = null;
  private viewGame = '';
  private viewToken = 0;
  private pendingPreset: CameraPreset | null = null;
  private local: PlayerController | null = null;
  /** Step used for the local prediction: the game's step wrapped with element effects. */
  private localStep: StepFn | null = null;
  private readonly effects: ElementEffectsView;
  private seqInitialized = false;
  private generation = 0;
  private accumulator = 0;
  private stepTime = 0;
  private spectateIndex = 0;
  private lastPhase = '';
  private frame: ViewFrame | null = null;

  constructor(ctx: SceneContext, net: MatchNetAdapter) {
    this.ctx = ctx;
    this.net = net;
    this.root.background = new THREE.Color(0x10131f);
    this.marker = new ClickMarker(this.resources);
    this.root.add(this.marker.mesh);
    this.effects = new ElementEffectsView(ctx.materials);
    this.root.add(this.effects.root);
    this.unsubscribe = net.onSnapshot(() => this.onSnapshot(performance.now()));
    this.onSnapshot(performance.now());
  }

  update(dt: number, input: Readonly<FrameInput>): void {
    const state = this.net.getState();
    if (!state) return;
    const gameTime = this.net.gameTimeNow();
    const local = this.local;

    if (local && this.view?.step) {
      if (this.accumulator === 0) this.stepTime = gameTime;
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
        local.fixedUpdate(input.keyDirX, input.keyDirZ, this.stepTime);
        this.queueInput(this.predictor.record(local.lastIntent, this.stepTime), local);
        this.stepTime += FIXED_DT;
        this.accumulator -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
      // Keep the prediction clock close to the server's estimate.
      if (Math.abs(this.stepTime - gameTime) > 0.25) this.stepTime = gameTime;
      local.renderUpdate(this.accumulator / FIXED_DT, dt);
      if (!local.isClickMoving) this.marker.hide();
    } else {
      this.accumulator = 0;
      this.marker.hide();
    }
    this.marker.update(dt);

    const renderTime = performance.now() - RENDER_DELAY_MS;
    for (const [id, a] of this.actors) {
      if (id === this.net.localId && local) continue;
      if (!a.interp.sample(renderTime, this.sample)) continue;
      a.model.group.position.set(this.sample.x, this.sample.y, this.sample.z);
      a.model.group.rotation.y = this.sample.yaw;
      a.anim.update(dt, this.sample.speed, this.sample.grounded);
    }

    this.effects.update(dt, state, gameTime, (id) => {
      const a = this.actors.get(id);
      return a && a.model.group.visible ? a.model.group.position : null;
    });
    this.updateCameraTarget();
    if (this.view) {
      this.frame ??= { gameTime, state, focus: this.cameraTarget, localId: this.net.localId };
      this.frame.gameTime = gameTime;
      this.frame.state = state;
      this.view.update(dt, this.frame);
    }
  }

  getCameraTarget(): Readonly<THREE.Vector3> {
    return this.cameraTarget;
  }

  getAutoAlignYaw(): number | null {
    return this.local?.isClickMoving ? this.local.state.yaw : null;
  }

  getClickTargets(): readonly THREE.Object3D[] {
    return this.view?.clickTargets ?? [];
  }

  takeCameraPreset(): CameraPreset | null {
    const p = this.pendingPreset;
    this.pendingPreset = null;
    return p;
  }

  onGroundClick(hit: ClickHit): void {
    const me = this.localPlayer();
    if (!me || !me.alive) {
      this.spectateIndex++; // spectators click to watch the next player
      return;
    }
    if (elementUi.get().aiming) {
      elementUi.set({ aiming: false });
      this.castAt(hit);
      return;
    }
    if (this.net.getPhase() !== 'ROUND_PLAYING' || !this.view || !this.frame) return;
    const action = this.view.actionForClick(hit, this.frame);
    if (action) {
      this.net.sendAction(action);
      return;
    }
    if (this.local) {
      this.local.setTarget(hit.x, hit.z);
      this.marker.show(hit.x, hit.y, hit.z);
    }
  }

  onKeyPress(code: string): void {
    if (this.net.getPhase() !== 'ROUND_PLAYING' || !this.view || !this.frame) return;
    if (code === 'Space' && this.local) return; // jump handled by onJump
    const action = this.view.actionForKey(code, this.frame);
    if (action) this.net.sendAction(action);
  }

  onCastAt(hit: ClickHit | null): void {
    this.castAt(hit);
  }

  onStop(): void {
    if (elementUi.get().aiming) {
      elementUi.set({ aiming: false }); // right click cancels aiming instead of stopping
      return;
    }
    this.local?.stop();
    this.marker.hide();
  }

  onJump(): void {
    if (this.local) this.local.requestJump();
    else if (this.net.getPhase() === 'ROUND_PLAYING' && this.view && this.frame) {
      const action = this.view.actionForKey('Space', this.frame);
      if (action) this.net.sendAction(action);
    }
  }

  applyQuality(p: QualityPreset): void {
    this.view?.applyQuality(p);
  }

  entityCount(): number {
    let visible = 0;
    for (const a of this.actors.values()) if (a.model.group.visible) visible++;
    return visible + (this.view?.clickTargets.length ?? 0);
  }

  dispose(): void {
    this.unsubscribe();
    elementUi.set({ aiming: false });
    this.effects.dispose();
    this.viewToken++;
    this.disposeView();
    for (const a of this.actors.values()) a.model.dispose();
    this.actors.clear();
    this.resources.dispose();
    this.root.clear();
  }

  private localPlayer(): NetPlayer | null {
    let me: NetPlayer | null = null;
    this.net.forEachPlayer((p) => {
      if (p.id === this.net.localId) me = p;
    });
    return me;
  }

  /** Use the local player's element. Point elements in movement games need a ground point. */
  private castAt(hit: ClickHit | null): void {
    const me = this.localPlayer();
    if (!me || !me.alive || me.roundState !== 'ACTIVE' || this.net.getPhase() !== 'ROUND_PLAYING') return;
    if (!isElementId(me.element)) return;
    const pointAim = ELEMENTS[me.element].aim === 'point' && this.view?.step != null;
    if (pointAim && !hit) return;
    this.net.sendCast(pointAim && hit ? hit.x : 0, pointAim && hit ? hit.z : 0);
  }

  private updateCameraTarget(): void {
    const focus = this.view?.cameraFocus();
    if (focus) {
      this.cameraTarget.copy(focus);
      return;
    }
    const me = this.actors.get(this.net.localId);
    const meState = this.localPlayer();
    if (me && meState?.alive) {
      this.cameraTarget.copy(me.model.group.position);
      return;
    }
    // Spectator: follow one of the remaining players.
    const alive: Actor[] = [];
    this.net.forEachPlayer((p) => {
      const a = this.actors.get(p.id);
      if (p.alive && a && p.id !== this.net.localId) alive.push(a);
    });
    const target = alive.length > 0 ? alive[this.spectateIndex % alive.length] : me;
    if (target) this.cameraTarget.copy(target.model.group.position);
  }

  private queueInput(seq: number, local: PlayerController): void {
    const intent = local.lastIntent;
    if (this.batch.i.length === 0) this.batch.s = seq;
    this.batch.i.push(intent.dirX, intent.dirZ, intent.jump ? 1 : 0);
    if (this.batch.i.length >= INPUT_BATCH * 3) {
      this.net.sendMove(this.batch); // serialized synchronously, safe to reuse afterwards
      this.batch.i.length = 0;
    }
  }

  private onSnapshot(now: number): void {
    const state = this.net.getState();
    if (!state) return;
    const phase = this.net.getPhase();
    if (state.currentGame && state.currentGame !== this.viewGame) void this.loadView(state.currentGame as MinigameId);
    this.effects.syncField(state);
    if (phase === 'ROUND_INTRO' && this.lastPhase !== 'ROUND_INTRO') {
      this.participants.clear();
      state.players.forEach((p) => {
        if (p.alive) this.participants.add(p.id);
      });
    }
    this.lastPhase = phase;
    if (this.participants.size === 0) state.players.forEach((p) => p.alive && this.participants.add(p.id));

    const gen = ++this.generation;
    const winnerId = state.winnerId;
    this.net.forEachPlayer((p) => {
      const actor = this.ensureActor(p, gen);
      actor.model.group.visible = this.participants.has(p.id);
      const pose: Pose =
        p.roundState === 'OUT' ? 'fallen' : p.roundState === 'FINISHED' || (phase === 'MATCH_END' && p.id === winnerId) ? 'cheer' : 'normal';
      actor.anim.setPose(pose);
      actor.model.setElement(p.element);
      if (p.id === this.net.localId) this.syncLocal(p, actor, now);
      else actor.interp.push(now, p.x, p.y, p.z, p.yaw, Math.hypot(p.vx, p.vz), p.grounded);
    });
    for (const [id, a] of this.actors) {
      if (a.generation === gen) continue;
      a.model.dispose();
      this.actors.delete(id);
    }
  }

  private ensureActor(p: NetPlayer, gen: number): Actor {
    let a = this.actors.get(p.id);
    if (!a) {
      const look = SLOT_LOOKS[p.slot] ?? SLOT_LOOKS[0]!;
      const model = new PlayerModel(this.ctx.materials, look.color, look.accessory);
      model.group.position.set(p.x, p.y, p.z);
      this.root.add(model.group);
      a = { model, anim: new AnimationController(model), interp: new RemoteInterpolator(), generation: gen };
      this.actors.set(p.id, a);
    }
    a.generation = gen;
    return a;
  }

  /** Local player: predicted while it can move in a movement game, otherwise shown like everyone else. */
  private syncLocal(p: NetPlayer, actor: Actor, now: number): void {
    const step = this.view?.step ?? null;
    const canMove = step !== null && this.net.getPhase() === 'ROUND_PLAYING' && p.alive && p.roundState === 'ACTIVE';
    if (!canMove || !step) {
      if (this.local) {
        this.local = null;
        this.predictor.clear();
        this.batch.i.length = 0;
      }
      actor.interp.push(now, p.x, p.y, p.z, p.yaw, Math.hypot(p.vx, p.vz), p.grounded);
      return;
    }
    if (!this.seqInitialized) {
      this.predictor.setNextSeq(p.lastSeq + 1);
      this.seqInitialized = true;
    }
    if (!this.local || !this.localStep) {
      // NetPlayer is the live schema object, so stun/haste changes reach the wrapped step automatically.
      this.localStep = effectStep(step, this.effects.field, p, this.net.localId);
      this.local = new PlayerController(this.localStep, actor.model, p.x, p.z, p.yaw);
      this.predictor.clear();
      this.accumulator = 0;
    }
    const s = this.local.state;
    const bx = s.x;
    const by = s.y;
    const bz = s.z;
    this.predictor.reconcile(s, p, p.lastSeq, this.localStep);
    this.local.applyCorrection(s.x - bx, s.y - by, s.z - bz);
    // Keep the interpolator primed so switching back to interpolation does not jump.
    actor.interp.push(now, p.x, p.y, p.z, p.yaw, Math.hypot(p.vx, p.vz), p.grounded);
  }

  private async loadView(game: MinigameId): Promise<void> {
    this.viewGame = game;
    const token = ++this.viewToken;
    const factory = await VIEW_LOADERS[game]();
    if (token !== this.viewToken) return; // superseded or disposed while loading
    this.disposeView();
    const viewRoot = new THREE.Group();
    const resources = new ResourceTracker();
    this.root.add(viewRoot);
    this.view = factory(viewRoot, this.root, this.ctx, resources);
    this.viewRoot = viewRoot;
    this.viewResources = resources;
    this.pendingPreset = this.view.cameraPreset;
    this.local = null; // new game, new step function
    this.predictor.clear();
  }

  private disposeView(): void {
    this.view?.dispose();
    this.view = null;
    this.frame = null;
    this.viewResources?.dispose();
    this.viewResources = null;
    this.viewRoot?.removeFromParent();
    this.viewRoot?.clear();
    this.viewRoot = null;
  }
}

export function createMatchScene(ctx: SceneContext, net: MatchNetAdapter): GameScene {
  return new MatchScene(ctx, net);
}
