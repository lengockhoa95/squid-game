import * as THREE from 'three';
import { ZOMBIE, ZOMBIE_CRATES, createZombieWorld, zombieStep, type QualityPreset } from '@sp/shared';
import type { SceneContext } from '../../core/GameScene.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';
import type { MinigameView, ViewFrame } from '../framework/MinigameView.ts';
import { StageLights, placeBox, setSky } from '../framework/stage.ts';

const DEG = Math.PI / 180;

/** Spooky walled yard with crates to hide behind. */
class ZombieView implements MinigameView {
  readonly step = zombieStep(createZombieWorld());
  readonly clickTargets: THREE.Object3D[] = [];
  readonly cameraPreset = { yaw: 0, pitch: 46 * DEG, distance: 13 };
  private readonly lights: StageLights;

  constructor(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker) {
    setSky(scene, 0x1b2418, 25, 90);
    this.lights = new StageLights(root, 22, 0xcfe8c0, 0x2a3324);
    const m = ctx.materials;
    const unit = res.track(new THREE.BoxGeometry(1, 1, 1));
    const h = ZOMBIE.half;
    const ground = placeBox(new THREE.Mesh(unit, m.lambert(0x5b6b3f)), -h - 2, h + 2, -h - 2, h + 2, -1, 0);
    ground.receiveShadow = true;
    root.add(ground);
    this.clickTargets.push(ground);
    for (const [x0, x1, z0, z1] of [[-h - 1, h + 1, -h - 1, -h], [-h - 1, h + 1, h, h + 1], [-h - 1, -h, -h, h], [h, h + 1, -h, h]] as const) {
      root.add(placeBox(new THREE.Mesh(unit, m.lambert(0x3b3a4a)), x0, x1, z0, z1, 0, 2.2));
    }
    for (const c of ZOMBIE_CRATES) {
      const crate = placeBox(new THREE.Mesh(unit, m.lambert(c.top < 1 ? 0x8a6d4b : 0x6e5638)), c.x - c.w / 2, c.x + c.w / 2, c.z - c.d / 2, c.z + c.d / 2, 0, c.top);
      crate.castShadow = true;
      crate.receiveShadow = true;
      root.add(crate);
      this.clickTargets.push(crate);
    }
    this.applyQuality(ctx.quality);
  }

  cameraFocus(): null {
    return null;
  }

  update(_dt: number, frame: ViewFrame): void {
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
  return new ZombieView(root, scene, ctx, res);
}
