import * as THREE from 'three';
import { createRng, type QualityPreset, type SimWorld } from '@sp/shared';
import type { FrameInput, GameScene, SceneContext } from '../../core/GameScene.ts';
import { ResourceTracker } from '../../core/ResourceTracker.ts';
import { PlayerModel, type Accessory } from '../../player/PlayerModel.ts';
import { FIXED_DT, PlayerController } from '../../player/PlayerController.ts';
import { ClickMarker } from '../../player/ClickMarker.ts';
import { ARENA_HALF, PLAYGROUND_BOXES, createPlaygroundWorld, scatterDecor, type DecorPlacement } from './playgroundLayout.ts';

const SKY = 0x9fd8ff;
const FLOOR = 0x8fcf8a;
const SHADOW_RANGE = 18;
const MAX_STEPS_PER_FRAME = 6;

interface Bot {
  ctrl: PlayerController;
  rng: () => number;
  idle: number;
}

const DEMO_BOTS: ReadonlyArray<{ color: number; accessory: Accessory; x: number; z: number }> = [
  { color: 0xff5d8f, accessory: 'cap', x: -4, z: 3 },
  { color: 0xffd23f, accessory: 'glasses', x: 4, z: 3 },
  { color: 0x7b61ff, accessory: 'band', x: 0, z: 6 },
];

/** Phase 1 test map: obstacles, instanced scenery, the local player and 3 wandering demo characters. */
class PlaygroundScene implements GameScene {
  readonly root = new THREE.Scene();
  private readonly resources = new ResourceTracker();
  private readonly world: SimWorld = createPlaygroundWorld();
  private readonly player: PlayerController;
  private readonly bots: Bot[] = [];
  private readonly models: PlayerModel[] = [];
  private readonly marker: ClickMarker;
  private readonly sun: THREE.DirectionalLight;
  private readonly clickTargets: THREE.Object3D[] = [];
  private readonly cameraTarget = new THREE.Vector3();
  private accumulator = 0;

  constructor(ctx: SceneContext) {
    this.root.background = new THREE.Color(SKY);
    this.root.fog = new THREE.Fog(SKY, 45, 110);

    this.root.add(new THREE.HemisphereLight(0xdff3ff, 0x6b5a7a, 1.8));
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    const cam = this.sun.shadow.camera;
    cam.left = -SHADOW_RANGE;
    cam.right = SHADOW_RANGE;
    cam.top = SHADOW_RANGE;
    cam.bottom = -SHADOW_RANGE;
    cam.near = 1;
    cam.far = 80;
    this.sun.shadow.bias = -0.0005;
    this.root.add(this.sun, this.sun.target);

    this.buildFloor(ctx);
    this.buildObstacles(ctx);
    this.buildFence(ctx);
    this.buildScenery(ctx);

    this.marker = new ClickMarker(this.resources);
    this.root.add(this.marker.mesh);

    const playerModel = new PlayerModel(ctx.materials, 0x3df5c8, 'none');
    this.models.push(playerModel);
    this.root.add(playerModel.group);
    this.player = new PlayerController(this.world, playerModel, 0, 0);

    DEMO_BOTS.forEach((b, i) => {
      const model = new PlayerModel(ctx.materials, b.color, b.accessory);
      this.models.push(model);
      this.root.add(model.group);
      this.bots.push({ ctrl: new PlayerController(this.world, model, b.x, b.z), rng: createRng(100 + i), idle: 0.5 + i });
    });

    this.applyQuality(ctx.quality);
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

    const p = this.player.model.group.position;
    this.cameraTarget.copy(p);
    this.sun.position.set(p.x + 12, p.y + 22, p.z + 8);
    this.sun.target.position.copy(p);
  }

  getCameraTarget(): Readonly<THREE.Vector3> {
    return this.cameraTarget;
  }

  getAutoAlignYaw(): number | null {
    return this.player.isClickMoving ? this.player.state.yaw : null;
  }

  getClickTargets(): readonly THREE.Object3D[] {
    return this.clickTargets;
  }

  onGroundClick(x: number, y: number, z: number): void {
    this.player.setTarget(x, z);
    this.marker.show(x, y, z);
  }

  onStop(): void {
    this.player.stop();
    this.marker.hide();
  }

  onJump(): void {
    this.player.requestJump();
  }

  applyQuality(p: QualityPreset): void {
    this.sun.castShadow = p.shadows;
    if (p.shadows && this.sun.shadow.mapSize.x !== p.shadowMapSize) {
      this.sun.shadow.mapSize.set(p.shadowMapSize, p.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  entityCount(): number {
    return 1 + this.bots.length + PLAYGROUND_BOXES.length;
  }

  dispose(): void {
    for (const m of this.models) m.dispose();
    this.models.length = 0;
    this.sun.shadow.map?.dispose();
    this.sun.dispose();
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

  private buildFloor(ctx: SceneContext): void {
    const size = ARENA_HALF * 2 + 70;
    const floorGeo = this.resources.track(new THREE.PlaneGeometry(size, size));
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, ctx.materials.lambert(FLOOR));
    floor.receiveShadow = true;
    this.root.add(floor);
    this.clickTargets.push(floor);

    // Track stripes inside the arena (one instanced mesh, one draw call).
    const stripeGeo = this.resources.track(new THREE.PlaneGeometry(1, 1));
    stripeGeo.rotateX(-Math.PI / 2);
    const stripes = this.resources.track(new THREE.InstancedMesh(stripeGeo, ctx.materials.lambert(0xf6f1e3), 6));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    for (let i = 0; i < 6; i++) {
      const z = -ARENA_HALF + 6 + i * ((ARENA_HALF * 2 - 12) / 5);
      pos.set(0, 0.01, z);
      s.set(ARENA_HALF * 2 - 4, 1, 0.25);
      m.compose(pos, q, s);
      stripes.setMatrixAt(i, m);
    }
    stripes.receiveShadow = true;
    this.root.add(stripes);
  }

  private buildObstacles(ctx: SceneContext): void {
    const unitBox = this.resources.track(new THREE.BoxGeometry(1, 1, 1));
    for (const b of PLAYGROUND_BOXES) {
      const mesh = new THREE.Mesh(unitBox, ctx.materials.lambert(b.color));
      mesh.scale.set(b.maxX - b.minX, b.top, b.maxZ - b.minZ);
      mesh.position.set((b.minX + b.maxX) / 2, b.top / 2, (b.minZ + b.maxZ) / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      this.clickTargets.push(mesh);
    }
  }

  private buildFence(ctx: SceneContext): void {
    const spacing = 2.5;
    const perSide = Math.floor((ARENA_HALF * 2) / spacing);
    const count = perSide * 4;
    const postGeo = this.resources.track(new THREE.BoxGeometry(0.25, 1.2, 0.25));
    postGeo.translate(0, 0.6, 0);
    const posts = this.resources.track(new THREE.InstancedMesh(postGeo, ctx.materials.lambert(0xf4f4f4), count));
    const m = new THREE.Matrix4();
    let i = 0;
    for (let side = 0; side < 4; side++) {
      for (let k = 0; k < perSide; k++) {
        const t = -ARENA_HALF + k * spacing;
        const [x, z] =
          side === 0 ? [t, -ARENA_HALF] : side === 1 ? [ARENA_HALF, t] : side === 2 ? [-t, ARENA_HALF] : [-ARENA_HALF, -t];
        m.makeTranslation(x, 0, z);
        posts.setMatrixAt(i++, m);
      }
    }
    this.root.add(posts);

    const railGeo = this.resources.track(new THREE.BoxGeometry(1, 0.12, 0.12));
    const rails = this.resources.track(new THREE.InstancedMesh(railGeo, ctx.materials.lambert(0xff5d8f), 4));
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3(ARENA_HALF * 2, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    for (let side = 0; side < 4; side++) {
      const horizontal = side % 2 === 0;
      pos.set(horizontal ? 0 : side === 1 ? ARENA_HALF : -ARENA_HALF, 1, horizontal ? (side === 0 ? -ARENA_HALF : ARENA_HALF) : 0);
      q.setFromAxisAngle(up, horizontal ? 0 : Math.PI / 2);
      m.compose(pos, q, scale);
      rails.setMatrixAt(side, m);
    }
    this.root.add(rails);
  }

  private buildScenery(ctx: SceneContext): void {
    const trunkGeo = this.resources.track(new THREE.CylinderGeometry(0.18, 0.25, 1.2, 5));
    trunkGeo.translate(0, 0.6, 0);
    const crownGeo = this.resources.track(new THREE.ConeGeometry(1.1, 2.4, 6));
    crownGeo.translate(0, 2.3, 0);
    const rockGeo = this.resources.track(new THREE.DodecahedronGeometry(0.7, 0));

    const trees = scatterDecor(7, 70, ARENA_HALF + 4, ARENA_HALF + 30);
    const rocks = scatterDecor(11, 40, ARENA_HALF + 2, ARENA_HALF + 28);
    this.root.add(
      this.instanced(trunkGeo, ctx.materials.lambert(0x8a5a3c), trees, false),
      this.instanced(crownGeo, ctx.materials.lambert(0x3e9e5f), trees, true),
      this.instanced(rockGeo, ctx.materials.lambert(0xa9a3b8), rocks, true),
    );
  }

  private instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: DecorPlacement[], cast: boolean): THREE.InstancedMesh {
    const mesh = this.resources.track(new THREE.InstancedMesh(geo, mat, items.length));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    items.forEach((d, i) => {
      p.set(d.x, 0, d.z);
      q.setFromAxisAngle(up, d.rotY);
      s.setScalar(d.scale);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = cast;
    mesh.computeBoundingSphere(); // enables frustum culling for the whole batch
    return mesh;
  }
}

export function createPlaygroundScene(ctx: SceneContext): GameScene {
  return new PlaygroundScene(ctx);
}
