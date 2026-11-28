import * as THREE from 'three';
import {
  CARDS, ELEMENTS, INPUT_BATCH, MINIGAMES, rayBox, TEAM_ZOMBIE, WEAPONS, characterFor, isWeaponId, parseCards, SLOT_LOOKS, effectStep, isElementId, type Box, type MinigameId, type MoveBatch, type QualityPreset, type StepFn,
} from '@sp/shared';
import type { AimRay, CameraPreset, ClickHit, FrameInput, GameScene, SceneContext } from '../../core/GameScene.ts';
import { ResourceTracker } from '../../core/ResourceTracker.ts';
import type { CharacterBody, Pose } from '../../player/CharacterBody.ts';
import { createCharacterBody } from '../../player/characters.ts';
import { FIXED_DT, PlayerController } from '../../player/PlayerController.ts';
import { ClickMarker } from '../../player/ClickMarker.ts';
import { NameTag } from '../../player/NameTag.ts';
import { audio } from '../../audio/AudioManager.ts';
import { LocalPredictor } from '../../player/LocalPredictor.ts';
import { RemoteInterpolator, createSample } from '../../player/RemoteInterpolator.ts';
import type { MatchNetAdapter, NetPlayer } from '../../network/types.ts';
import { VIEW_LOADERS, type MinigameView, type ViewFrame } from '../../minigames/framework/MinigameView.ts';
import { ElementEffectsView } from '../../elements/ElementEffectsView.ts';
import { elementUi } from '../../elements/elementUi.ts';

const MAX_STEPS_PER_FRAME = 6;
/** Other players are drawn this far in the past so there are always two snapshots to blend. */
const RENDER_DELAY_MS = 100;
/** Monster model heights (aiming at their centre). */
const MONSTER_HEIGHT: Record<string, number> = { SLIME: 0.9, SKELETON: 1.6, BAT: 0.9, ARCHER: 1.6, SHIELD: 1.6, BOMBER: 0.9, DRAGON: 3.6, MINOTAUR: 4.5, SLIME_KING: 2.8 };
/** How long a character keeps facing its attack direction. */
const FACE_ATTACK_MS = 450;

interface Actor {
  model: CharacterBody;
  interp: RemoteInterpolator;
  generation: number;
  /** Nickname above the head (none for the local player). */
  tag: NameTag | null;
  /** Character model currently shown. */
  character: string;
  /** Last seen mid-air jump count (a rise = play a flip). */
  airJumps: number;
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
  private readonly facing = new Map<string, { yaw: number; until: number }>();
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
  private readonly auraCache = new Map<string, string>();
  private lastCastAt = 0;
  private localAirJumps = 0;
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
    this.effects.localId = net.localId;
    // Attacks: play the swing/shot animation on whoever attacked.
    this.effects.onNewEffect = (e) => {
      if (e.kind !== 'SLASH' && e.kind !== 'SHOT') return;
      this.actors.get(e.owner)?.model.attack(e.kind === 'SHOT');
      if (e.owner !== this.net.localId) this.faceToward(e.owner, Math.atan2(e.x2 - e.x, e.z2 - e.z));
    };
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
      const airJumps = local.state.airJumps ?? 0;
      if (airJumps > this.localAirJumps) local.model.flip();
      this.localAirJumps = airJumps;
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
      a.model.animate(dt, this.sample.speed, this.sample.grounded);
    }

    this.effects.update(dt, state, gameTime, (id) => {
      const a = this.actors.get(id);
      return a && a.model.group.visible ? a.model.group.position : null;
    });
    // Attack facing overrides the movement facing for a moment.
    const nowMs = performance.now();
    for (const [id, f] of this.facing) {
      const a = this.actors.get(id);
      if (!a || nowMs > f.until) {
        this.facing.delete(id);
        continue;
      }
      a.model.group.rotation.y = f.yaw;
    }
    this.updateCameraTarget();
    if (this.view) {
      this.frame ??= { gameTime, state, focus: this.cameraTarget, localId: this.net.localId };
      this.frame.gameTime = gameTime;
      this.frame.state = state;
      this.view.update(dt, this.frame);
    }
  }

  wantsPointerLock(): boolean {
    if (this.net.getPhase() !== 'ROUND_PLAYING' || !this.view?.step) return false;
    // Thủ Thành break: free the mouse to click weapon cards / elements.
    const castle = this.net.getState()?.castle;
    if (castle && castle.breakUntil > 0) return false;
    const me = this.localPlayer();
    return !!me && me.alive && me.roundState === 'ACTIVE';
  }

  getCameraTarget(): Readonly<THREE.Vector3> {
    return this.cameraTarget;
  }

  getAutoAlignYaw(): number | null {
    // Keyboard movement: the camera drifts back behind the character while it runs.
    const s = this.local?.state;
    return s && s.vx * s.vx + s.vz * s.vz > 4 ? s.yaw : null;
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
    // Movement games: walking is keyboard-only, a left click uses the element at that point.
    if (this.view.step) {
      this.castAt(hit);
      return;
    }
    const action = this.view.actionForClick(hit, this.frame);
    if (action) this.net.sendAction(action);
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

  cameraBlockers(): readonly Box[] {
    return this.view?.aimBoxes ?? [];
  }

  combatAim(): boolean {
    const game = this.net.getState()?.currentGame as MinigameId | undefined;
    return !!game && MINIGAMES[game]?.combat === true && this.net.getPhase() === 'ROUND_PLAYING';
  }

  onAttack(ray: AimRay): void {
    const me = this.localPlayer();
    if (!me || !me.alive || me.roundState !== 'ACTIVE' || !this.combatAim()) return;
    if (elementUi.get().aiming) {
      // Element button armed: this click uses the element instead.
      elementUi.set({ aiming: false });
      const t = ray.dy < -1e-3 ? -ray.oy / ray.dy : 20;
      this.castAt({ x: ray.ox + ray.dx * t, y: 0, z: ray.oz + ray.dz * t, object: this.root, instanceId: undefined });
      return;
    }
    const aim = this.aimFrom(ray, 1.0, true);
    if (!aim) return;
    this.faceToward(this.net.localId, aim.yaw); // turn at once, the server confirms with the slash/shot
    this.net.sendAttack(aim.yaw, aim.pitch);
  }

  onHook(ray: AimRay): void {
    const me = this.localPlayer();
    if (!me || !me.alive || me.roundState !== 'ACTIVE' || me.downed || !this.combatAim()) return;
    const aim = this.aimFrom(ray, 1.2, false);
    if (aim) this.net.sendHook(aim.yaw, aim.pitch);
  }

  /**
   * Third-person aiming: find what the camera ray points at (a monster, a wall, the ground or far
   * away) and return the yaw / pitch from the character's chest to that point.
   */
  private aimFrom(ray: AimRay, chest: number, monsters: boolean): { yaw: number; pitch: number } | null {
    const pos = this.actors.get(this.net.localId)?.model.group.position;
    if (!pos) return null;
    const camDist = Math.hypot(pos.x - ray.ox, pos.y + chest - ray.oy, pos.z - ray.oz);
    let best = camDist + 30;
    const castle = this.net.getState()?.castle;
    if (monsters && castle) {
      castle.monsters.forEach((m) => {
        if (m.state === 'DIE') return;
        const scale = m.elite === 'GIANT' ? 1.8 : m.elite ? 1.35 : 1;
        const cy = m.y + ((MONSTER_HEIGHT[m.kind] ?? 1.4) * scale) / 2;
        const vx = m.x - ray.ox;
        const vy = cy - ray.oy;
        const vz = m.z - ray.oz;
        const t = vx * ray.dx + vy * ray.dy + vz * ray.dz;
        if (t < camDist * 0.6 || t >= best) return;
        const perp = Math.hypot(vx - ray.dx * t, vy - ray.dy * t, vz - ray.dz * t);
        if (perp < 0.8 * scale + (m.kind === 'DRAGON' || m.kind === 'MINOTAUR' || m.kind === 'SLIME_KING' ? 1.5 : 0.3)) best = t;
      });
    }
    for (const b of this.view?.aimBoxes ?? []) {
      const t = rayBox(ray.ox, ray.oy, ray.oz, ray.dx, ray.dy, ray.dz, b);
      if (t !== null && t > camDist * 0.8 && t < best) best = t + 0.05;
    }
    if (ray.dy < -1e-3) {
      const t = -ray.oy / ray.dy;
      if (t > camDist * 0.8 && t < best) best = t;
    }
    const tx = ray.ox + ray.dx * best;
    const ty = ray.oy + ray.dy * best;
    const tz = ray.oz + ray.dz * best;
    const hx = tx - pos.x;
    const hz = tz - pos.z;
    return { yaw: Math.atan2(hx, hz), pitch: Math.atan2(ty - (pos.y + chest), Math.hypot(hx, hz) || 1e-3) };
  }

  /** Show a character facing its attack direction for a moment (attacks can go any way). */
  private faceToward(id: string, yaw: number): void {
    this.facing.set(id, { yaw, until: performance.now() + FACE_ATTACK_MS });
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
    for (const a of this.actors.values()) {
      a.tag?.dispose();
      a.model.dispose();
    }
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

  /** Colour of the first awakened (level 3) card, '' when none. Cached per cards string. */
  private awakenColor(cards: string): string {
    let c = this.auraCache.get(cards);
    if (c === undefined) {
      const levels = parseCards(cards);
      const id = (Object.keys(levels) as Array<keyof typeof levels>).find((k) => levels[k] === 3);
      c = id ? CARDS[id].color : '';
      this.auraCache.set(cards, c);
    }
    return c;
  }

  /** Other active players as static obstacles for the local prediction (the server resolves real pushes). */
  private syncBodies(): void {
    const bodies = this.effects.field.bodies;
    let n = 0;
    this.net.forEachPlayer((p) => {
      if (p.id === this.net.localId || !p.alive || p.roundState !== 'ACTIVE' || !this.participants.has(p.id)) return;
      const b = bodies[n] ?? (bodies[n] = { x: 0, y: 0, z: 0 });
      b.x = p.x;
      b.y = p.y;
      b.z = p.z;
      n++;
    });
    bodies.length = n;
  }

  /** Use the local player's element. Point elements in movement games need a ground point. */
  private castAt(hit: ClickHit | null): void {
    const me = this.localPlayer();
    if (!me || !me.alive || me.roundState !== 'ACTIVE' || this.net.getPhase() !== 'ROUND_PLAYING') return;
    if (!isElementId(me.element)) return;
    // Do not spam the server: skip while cooling down / stunned, and at most a few clicks per second.
    const now = performance.now();
    const t = this.net.gameTimeNow();
    if (now - this.lastCastAt < 250 || t < me.elementReadyAt - 0.05 || t < me.stunUntil) return;
    this.lastCastAt = now;
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
    this.syncBodies();
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
        p.roundState === 'OUT' || p.downed ? 'fallen' : p.roundState === 'FINISHED' || (phase === 'MATCH_END' && p.id === winnerId) ? 'cheer' : 'normal';
      actor.model.setPose(pose);
      // Somersault on the mid-air jump (the local player flips from its own prediction instead).
      if (p.airJumps > actor.airJumps && !(p.id === this.net.localId && this.local)) actor.model.flip();
      actor.airJumps = p.airJumps;
      actor.model.setElement(p.element);
      actor.model.setAura(this.awakenColor(p.cards));
      actor.model.setWeapon(isWeaponId(p.weapon) ? WEAPONS[p.weapon].model : '', p.weaponTier);
      if (p.id === this.net.localId) this.syncLocal(p, actor, now);
      else actor.interp.push(now, p.x, p.y, p.z, p.yaw, Math.hypot(p.vx, p.vz), p.grounded);
    });
    for (const [id, a] of this.actors) {
      if (a.generation === gen) continue;
      a.tag?.dispose();
      a.model.dispose();
      this.actors.delete(id);
    }
  }

  /** Which character to show: zombies in "Zombie Lây Lan" turn into the zombie, otherwise the player's pick. */
  private shownCharacter(p: NetPlayer): string {
    const state = this.net.getState();
    if (state?.currentGame === 'ZOMBIE' && p.team === TEAM_ZOMBIE && this.net.getPhase() !== 'LOBBY') return 'character-zombie';
    return characterFor(p.character, p.slot);
  }

  private ensureActor(p: NetPlayer, gen: number): Actor {
    let a = this.actors.get(p.id);
    const character = this.shownCharacter(p);
    if (a && a.character !== character) {
      // Swap the body (e.g. infected): keep position, tag and interpolation history.
      const old = a.model;
      const model = createCharacterBody(this.ctx.materials, p.slot, character);
      model.group.position.copy(old.group.position);
      model.group.rotation.y = old.group.rotation.y;
      model.group.visible = old.group.visible;
      this.root.add(model.group);
      if (a.tag) a.tag.attach(model.group, model.tagHeight);
      old.dispose();
      a.model = model;
      a.character = character;
      if (p.id === this.net.localId && this.local) {
        this.local = null; // rebuilt around the new body on this snapshot
        this.predictor.clear();
      }
      if (character === 'character-zombie') audio.play('out', 0.12);
    }
    if (!a) {
      const look = SLOT_LOOKS[p.slot] ?? SLOT_LOOKS[0]!;
      const model = createCharacterBody(this.ctx.materials, p.slot, character);
      model.group.position.set(p.x, p.y, p.z);
      this.root.add(model.group);
      let tag: NameTag | null = null;
      if (p.id !== this.net.localId) {
        tag = new NameTag(p.nickname, look.color);
        tag.attach(model.group, model.tagHeight);
      }
      a = { model, interp: new RemoteInterpolator(), generation: gen, tag, character, airJumps: 0 };
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
