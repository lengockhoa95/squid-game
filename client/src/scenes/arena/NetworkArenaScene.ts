import * as THREE from 'three';
import { INPUT_BATCH, SLOT_LOOKS, createPlaygroundWorld, type MoveBatch, type QualityPreset, type SimWorld } from '@sp/shared';
import type { FrameInput, GameScene, SceneContext } from '../../core/GameScene.ts';
import { ResourceTracker } from '../../core/ResourceTracker.ts';
import { PlayerModel } from '../../player/PlayerModel.ts';
import { AnimationController } from '../../player/AnimationController.ts';
import { FIXED_DT, PlayerController } from '../../player/PlayerController.ts';
import { ClickMarker } from '../../player/ClickMarker.ts';
import { LocalPredictor } from '../../player/LocalPredictor.ts';
import { RemoteInterpolator, createSample } from '../../player/RemoteInterpolator.ts';
import type { MatchNetAdapter, NetPlayer } from '../../network/types.ts';
import { PlaygroundEnvironment } from '../playground/PlaygroundEnvironment.ts';

const MAX_STEPS_PER_FRAME = 6;
/** Remote players are drawn this far in the past so there are always two snapshots to blend. */
const RENDER_DELAY_MS = 100;

interface RemotePlayer {
  model: PlayerModel;
  anim: AnimationController;
  interp: RemoteInterpolator;
  generation: number;
}

/**
 * Online arena: local player is predicted + reconciled, remote players are interpolated.
 * Movement only runs in the PLAYING phase; during STARTING everyone is held at spawn by the server.
 */
class NetworkArenaScene implements GameScene {
  readonly root = new THREE.Scene();
  private readonly ctx: SceneContext;
  private readonly net: MatchNetAdapter;
  private readonly resources = new ResourceTracker();
  private readonly env: PlaygroundEnvironment;
  private readonly world: SimWorld = createPlaygroundWorld();
  private readonly marker: ClickMarker;
  private readonly predictor = new LocalPredictor();
  private readonly remotes = new Map<string, RemotePlayer>();
  private readonly cameraTarget = new THREE.Vector3();
  private readonly sample = createSample();
  private readonly batch: MoveBatch = { s: 0, i: [] };
  private readonly unsubscribe: () => void;
  private local: PlayerController | null = null;
  private localModel: PlayerModel | null = null;
  private generation = 0;
  private accumulator = 0;

  constructor(ctx: SceneContext, net: MatchNetAdapter) {
    this.ctx = ctx;
    this.net = net;
    this.env = new PlaygroundEnvironment(this.root, ctx, this.resources);
    this.marker = new ClickMarker(this.resources);
    this.root.add(this.marker.mesh);
    this.unsubscribe = net.onSnapshot(() => this.onSnapshot(performance.now()));
    this.onSnapshot(performance.now()); // state already received before the scene loaded
  }

  update(dt: number, input: Readonly<FrameInput>): void {
    const local = this.local;
    const playing = this.net.getPhase() === 'PLAYING';

    if (local && playing) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
        local.fixedUpdate(input.keyDirX, input.keyDirZ);
        this.queueInput(this.predictor.record(local.lastIntent), local);
        this.accumulator -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
    } else {
      this.accumulator = 0;
    }

    if (local) {
      local.renderUpdate(playing ? this.accumulator / FIXED_DT : 1, dt);
      if (!local.isClickMoving) this.marker.hide();
      this.cameraTarget.copy(local.model.group.position);
    }
    this.marker.update(dt);

    const renderTime = performance.now() - RENDER_DELAY_MS;
    for (const r of this.remotes.values()) {
      if (!r.interp.sample(renderTime, this.sample)) continue;
      r.model.group.position.set(this.sample.x, this.sample.y, this.sample.z);
      r.model.group.rotation.y = this.sample.yaw;
      r.anim.update(dt, this.sample.speed, this.sample.grounded);
    }

    this.env.followFocus(this.cameraTarget);
  }

  getCameraTarget(): Readonly<THREE.Vector3> {
    return this.cameraTarget;
  }

  getAutoAlignYaw(): number | null {
    return this.local?.isClickMoving ? this.local.state.yaw : null;
  }

  getClickTargets(): readonly THREE.Object3D[] {
    return this.env.clickTargets;
  }

  onGroundClick(x: number, y: number, z: number): void {
    if (!this.local || this.net.getPhase() !== 'PLAYING') return;
    this.local.setTarget(x, z);
    this.marker.show(x, y, z);
  }

  onStop(): void {
    this.local?.stop();
    this.marker.hide();
  }

  onJump(): void {
    if (this.net.getPhase() === 'PLAYING') this.local?.requestJump();
  }

  applyQuality(p: QualityPreset): void {
    this.env.applyQuality(p);
  }

  entityCount(): number {
    return (this.local ? 1 : 0) + this.remotes.size + this.env.obstacleCount;
  }

  dispose(): void {
    this.unsubscribe();
    this.localModel?.dispose();
    for (const r of this.remotes.values()) r.model.dispose();
    this.remotes.clear();
    this.env.dispose();
    this.resources.dispose();
    this.root.clear();
  }

  /** Collect inputs and send one MOVE message every INPUT_BATCH steps. The batch object is reused. */
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
    const gen = ++this.generation;
    const playing = this.net.getPhase() === 'PLAYING';
    this.net.forEachPlayer((p) => {
      if (p.id === this.net.localId) this.syncLocal(p, playing);
      else this.syncRemote(p, now, gen);
    });
    for (const [id, r] of this.remotes) {
      if (r.generation === gen) continue;
      r.model.dispose();
      this.remotes.delete(id);
    }
  }

  private syncLocal(p: NetPlayer, playing: boolean): void {
    if (!this.local) {
      const look = SLOT_LOOKS[p.slot] ?? SLOT_LOOKS[0]!;
      this.localModel = new PlayerModel(this.ctx.materials, look.color, look.accessory);
      this.root.add(this.localModel.group);
      this.local = new PlayerController(this.world, this.localModel, p.x, p.z, p.yaw);
      this.predictor.setNextSeq(p.lastSeq + 1);
    }
    if (!playing) {
      // Server holds everyone (countdown / respawn): drop predictions and snap to the server.
      this.predictor.clear();
      this.batch.i.length = 0;
    }
    const s = this.local.state;
    const bx = s.x;
    const by = s.y;
    const bz = s.z;
    this.predictor.reconcile(s, p, p.lastSeq, this.world);
    this.local.applyCorrection(s.x - bx, s.y - by, s.z - bz);
  }

  private syncRemote(p: NetPlayer, now: number, gen: number): void {
    let r = this.remotes.get(p.id);
    if (!r) {
      const look = SLOT_LOOKS[p.slot] ?? SLOT_LOOKS[0]!;
      const model = new PlayerModel(this.ctx.materials, look.color, look.accessory);
      this.root.add(model.group);
      r = { model, anim: new AnimationController(model), interp: new RemoteInterpolator(), generation: gen };
      this.remotes.set(p.id, r);
    }
    r.generation = gen;
    r.interp.push(now, p.x, p.y, p.z, p.yaw, Math.hypot(p.vx, p.vz), p.grounded);
  }
}

export function createNetworkArenaScene(ctx: SceneContext, net: MatchNetAdapter): GameScene {
  return new NetworkArenaScene(ctx, net);
}
