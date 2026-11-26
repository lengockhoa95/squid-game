import * as THREE from 'three';
import { ARENA_HALF, createPlaygroundWorld, createRng, SLOT_LOOKS, staticWorldStep, type QualityPreset, type SimWorld } from '@sp/shared';
import type { ClickHit, FrameInput, GameScene, SceneContext } from '../../core/GameScene.ts';
import { ResourceTracker } from '../../core/ResourceTracker.ts';
import { PlayerModel } from '../../player/PlayerModel.ts';
import { FIXED_DT, PlayerController } from '../../player/PlayerController.ts';
import { ClickMarker } from '../../player/ClickMarker.ts';
import { PlaygroundEnvironment } from './PlaygroundEnvironment.ts';

const MAX_STEPS_PER_FRAME = 6;
const DEMO_SPAWNS = [
  { x: -4, z: 3 },
  { x: 4, z: 3 },
  { x: 0, z: 6 },
];

interface Bot {
  ctrl: PlayerController;
  rng: () => number;
  idle: number;
}

/** Offline test map: the local player plus 3 wandering demo characters (not real NPCs). */
class PlaygroundScene implements GameScene {
  readonly root = new THREE.Scene();
  private readonly resources = new ResourceTracker();
  private readonly env: PlaygroundEnvironment;
  private readonly world: SimWorld = createPlaygroundWorld();
  private readonly player: PlayerController;
  private readonly bots: Bot[] = [];
  private readonly models: PlayerModel[] = [];
  private readonly marker: ClickMarker;
  private readonly cameraTarget = new THREE.Vector3();
  private accumulator = 0;

  constructor(ctx: SceneContext) {
    this.env = new PlaygroundEnvironment(this.root, ctx, this.resources);
    this.marker = new ClickMarker(this.resources);
    this.root.add(this.marker.mesh);

    const look = SLOT_LOOKS[0]!;
    const playerModel = new PlayerModel(ctx.materials, look.color, look.accessory);
    this.models.push(playerModel);
    this.root.add(playerModel.group);
    this.player = new PlayerController(staticWorldStep(this.world), playerModel, 0, 0, Math.PI, this.world.killY); // face away from the camera

    DEMO_SPAWNS.forEach((spawn, i) => {
      const botLook = SLOT_LOOKS[i + 1]!;
      const model = new PlayerModel(ctx.materials, botLook.color, botLook.accessory);
      this.models.push(model);
      this.root.add(model.group);
      this.bots.push({ ctrl: new PlayerController(staticWorldStep(this.world), model, spawn.x, spawn.z, 0, this.world.killY), rng: createRng(100 + i), idle: 0.5 + i });
    });
  }

  update(dt: number, input: Readonly<FrameInput>): void {
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.player.fixedUpdate(input.keyDirX, input.keyDirZ);
      for (const bot of this.bots) this.stepBot(bot);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0; // avoid spiral of death
    const alpha = this.accumulator / FIXED_DT;

    this.player.renderUpdate(alpha, dt);
    for (const bot of this.bots) bot.ctrl.renderUpdate(alpha, dt);

    if (!this.player.isClickMoving) this.marker.hide();
    this.marker.update(dt);

    this.cameraTarget.copy(this.player.model.group.position);
    this.env.followFocus(this.cameraTarget);
  }

  getCameraTarget(): Readonly<THREE.Vector3> {
    return this.cameraTarget;
  }

  getAutoAlignYaw(): number | null {
    return this.player.isClickMoving ? this.player.state.yaw : null;
  }

  getClickTargets(): readonly THREE.Object3D[] {
    return this.env.clickTargets;
  }

  onGroundClick(hit: ClickHit): void {
    this.player.setTarget(hit.x, hit.z);
    this.marker.show(hit.x, hit.y, hit.z);
  }

  onStop(): void {
    this.player.stop();
    this.marker.hide();
  }

  onJump(): void {
    this.player.requestJump();
  }

  applyQuality(p: QualityPreset): void {
    this.env.applyQuality(p);
  }

  entityCount(): number {
    return 1 + this.bots.length + this.env.obstacleCount;
  }

  dispose(): void {
    for (const m of this.models) m.dispose();
    this.models.length = 0;
    this.env.dispose();
    this.resources.dispose();
    this.root.clear();
  }

  private stepBot(bot: Bot): void {
    const c = bot.ctrl;
    if (!c.isClickMoving) {
      bot.idle -= FIXED_DT;
      if (bot.idle <= 0) {
        const lim = ARENA_HALF - 3;
        c.setTarget((bot.rng() * 2 - 1) * lim, (bot.rng() * 2 - 1) * lim);
        bot.idle = 0.5 + bot.rng() * 2;
      }
    } else if (bot.rng() < 0.004) {
      c.requestJump();
    }
    c.fixedUpdate(0, 0);
    // Wandering into a wall: give up and pick a new spot next time.
    if (c.isClickMoving && Math.hypot(c.state.vx, c.state.vz) < 0.2 && c.state.grounded && bot.rng() < 0.05) {
      c.clearTarget();
    }
  }
}

export function createPlaygroundScene(ctx: SceneContext): GameScene {
  return new PlaygroundScene(ctx);
}
