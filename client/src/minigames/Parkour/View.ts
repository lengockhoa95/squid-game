import * as THREE from 'three';
import {
  MOVEMENT, PARKOUR, PARKOUR_CHECKPOINTS, PARKOUR_MOVERS, PARKOUR_STATIC, PARKOUR_SWEEPERS,
  createParkourWorld, moverX, parkourStep, sweeperAngle,
  type ParkourKind, type QualityPreset,
} from '@sp/shared';
import type { SceneContext } from '../../core/GameScene.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';
import type { MinigameView, ViewFrame } from '../framework/MinigameView.ts';
import { StageLights, placeBox, setSky } from '../framework/stage.ts';

const DEG = Math.PI / 180;
const COLORS: Record<ParkourKind, number> = {
  floor: 0x8fd3ff,
  stone: 0xffd166,
  beam: 0xff9f1c,
  hurdle: 0xff5d8f,
  pad: 0x3df5c8,
  deck: 0xb8a1ff,
  conveyor: 0x4a4f6a,
  moving: 0xffd23f,
  hammer: 0xff3b5c,
};
const STRIPES = 8;

/** Obstacle course in the sky: static pieces from shared data, animated hammers/platform/sweeper/belt stripes. */
class ParkourView implements MinigameView {
  readonly step = parkourStep(createParkourWorld(), MOVEMENT.radius);
  readonly clickTargets: THREE.Object3D[] = [];
  readonly cameraPreset = { yaw: 0, pitch: 28 * DEG, distance: 10 };
  private readonly lights: StageLights;
  private readonly movers: THREE.Mesh[] = [];
  private readonly sweepers: THREE.Group[] = [];
  private readonly stripes: THREE.Mesh[] = [];
  private readonly belt: { minZ: number; maxZ: number; top: number };

  constructor(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker) {
    setSky(scene, 0x9fd8ff, 40, 130);
    this.lights = new StageLights(root, 20);
    const m = ctx.materials;
    const unit = res.track(new THREE.BoxGeometry(1, 1, 1));
    for (const b of PARKOUR_STATIC) {
      const mesh = placeBox(new THREE.Mesh(unit, m.lambert(COLORS[b.kind])), b.minX, b.maxX, b.minZ, b.maxZ, b.bottom ?? b.top - 1, b.top);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      this.clickTargets.push(mesh);
    }
    for (const mv of PARKOUR_MOVERS) {
      const mesh = placeBox(new THREE.Mesh(unit, m.lambert(COLORS[mv.kind])), mv.minX, mv.maxX, mv.minZ, mv.maxZ, mv.top - mv.depth, mv.top);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      this.movers.push(mesh);
      this.clickTargets.push(mesh);
    }
    for (const sw of PARKOUR_SWEEPERS) {
      const g = new THREE.Group();
      g.position.set(sw.x, sw.y ?? 0, sw.z);
      const pivot = placeBox(new THREE.Mesh(unit, m.lambert(0x4a4f6a)), -0.4, 0.4, -0.4, 0.4, 0, 1.2);
      const bar = placeBox(new THREE.Mesh(unit, m.lambert(0xff3b5c)), -sw.length, sw.length, -0.18, 0.18, sw.height - 0.4, sw.height);
      bar.castShadow = true;
      g.add(pivot, bar);
      root.add(g);
      this.sweepers.push(g);
    }
    const conveyor = PARKOUR_STATIC.find((b) => b.kind === 'conveyor')!;
    this.belt = { minZ: conveyor.minZ, maxZ: conveyor.maxZ, top: conveyor.top };
    for (let i = 0; i < STRIPES; i++) {
      const stripe = placeBox(new THREE.Mesh(unit, m.lambert(0xffd23f)), conveyor.minX, conveyor.maxX, -0.15, 0.15, conveyor.top, conveyor.top + 0.02);
      root.add(stripe);
      this.stripes.push(stripe);
    }
    // Pad arrows, checkpoint flags and the finish arch.
    const pad = PARKOUR_STATIC.find((b) => b.kind === 'pad')!;
    for (const x of [-2, 0, 2]) {
      const arrow = new THREE.Mesh(res.track(new THREE.ConeGeometry(0.35, 0.6, 4)), m.basic(0xffffff));
      arrow.position.set(x, pad.top + 0.4, (pad.minZ + pad.maxZ) / 2);
      root.add(arrow);
    }
    for (const cp of PARKOUR_CHECKPOINTS.slice(1)) {
      root.add(placeBox(new THREE.Mesh(unit, m.lambert(0xffd23f)), -PARKOUR.halfWidth - 0.4, -PARKOUR.halfWidth - 0.1, cp.z - 0.15, cp.z + 0.15, cp.y, cp.y + 2));
    }
    const fz = PARKOUR.finishZ;
    for (const x of [-PARKOUR.halfWidth, PARKOUR.halfWidth]) root.add(placeBox(new THREE.Mesh(unit, m.lambert(0xffd23f)), x - 0.3, x + 0.3, fz - 0.3, fz + 0.3, 0, 4));
    root.add(placeBox(new THREE.Mesh(unit, m.lambert(0xff5d8f)), -PARKOUR.halfWidth - 0.6, PARKOUR.halfWidth + 0.6, fz - 0.3, fz + 0.3, 3.4, 4.2));
    root.add(placeBox(new THREE.Mesh(unit, m.lambert(0x23232e)), -PARKOUR.halfWidth, PARKOUR.halfWidth, fz - 0.3, fz + 0.3, 0, 0.03));
    this.applyQuality(ctx.quality);
  }

  cameraFocus(): null {
    return null;
  }

  update(_dt: number, frame: ViewFrame): void {
    const t = frame.gameTime;
    PARKOUR_MOVERS.forEach((mv, i) => {
      this.movers[i]!.position.x = (mv.minX + mv.maxX) / 2 + moverX(mv, t);
    });
    PARKOUR_SWEEPERS.forEach((sw, i) => {
      this.sweepers[i]!.rotation.y = -sweeperAngle(sw, t);
    });
    const len = this.belt.maxZ - this.belt.minZ;
    this.stripes.forEach((stripe, i) => {
      const offset = ((t * PARKOUR.conveyorSpeed + (i * len) / STRIPES) % len + len) % len;
      stripe.position.z = this.belt.minZ + offset; // moves toward +z like the belt
    });
    this.lights.follow(frame.focus);
  }

  actionForClick(): null {
    return null;
  }

  actionForKey(): null {
    return null;
  }

  applyQuality(p: QualityPreset): void {
    this.lights.applyQuality(p);
  }

  dispose(): void {
    this.lights.dispose();
  }
}

export function createView(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker): MinigameView {
  return new ParkourView(root, scene, ctx, res);
}
