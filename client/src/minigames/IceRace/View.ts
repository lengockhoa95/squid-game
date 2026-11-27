import * as THREE from 'three';
import { ICE, ICE_BUMPERS, ICE_PATH, createIceWorld, iceStep, type QualityPreset } from '@sp/shared';
import type { SceneContext } from '../../core/GameScene.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';
import type { MinigameView, ViewFrame } from '../framework/MinigameView.ts';
import { StageLights, placeBox, setSky } from '../framework/stage.ts';

const DEG = Math.PI / 180;

/** A frozen track over a snowy abyss: glossy ice slabs, blue edge rails, ice pillars, finish arch. */
class IceView implements MinigameView {
  readonly step = iceStep(createIceWorld());
  readonly clickTargets: THREE.Object3D[] = [];
  readonly cameraPreset = { yaw: 0, pitch: 30 * DEG, distance: 11 };
  private readonly lights: StageLights;

  constructor(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker) {
    setSky(scene, 0xcfe9ff, 40, 120);
    this.lights = new StageLights(root, 22, 0xf2fbff, 0x7aa6c8);
    const m = ctx.materials;
    const unit = res.track(new THREE.BoxGeometry(1, 1, 1));
    const ice = res.track(new THREE.MeshStandardMaterial({ color: 0xcdeeff, roughness: 0.08, metalness: 0.1 }));
    const h = ICE.width / 2;
    for (let i = 1; i < ICE_PATH.length; i++) {
      const a = ICE_PATH[i - 1]!;
      const b = ICE_PATH[i]!;
      const slab = placeBox(new THREE.Mesh(unit, ice), Math.min(a.x, b.x) - h, Math.max(a.x, b.x) + h, Math.min(a.z, b.z) - h, Math.max(a.z, b.z) + h, -1, 0);
      slab.receiveShadow = true;
      root.add(slab);
      this.clickTargets.push(slab);
    }
    for (const p of ICE_BUMPERS) {
      const pillar = placeBox(new THREE.Mesh(unit, m.lambert(0x7fc8ff)), p.x - 0.6, p.x + 0.6, p.z - 0.6, p.z + 0.6, 0, 1.6);
      pillar.castShadow = true;
      root.add(pillar);
    }
    // Snowy ground far below.
    const snow = new THREE.Mesh(res.track(new THREE.PlaneGeometry(220, 220).rotateX(-Math.PI / 2)), m.lambert(0xffffff));
    snow.position.set(10, -14, -15);
    root.add(snow);
    // Finish arch.
    const end = ICE_PATH[ICE_PATH.length - 1]!;
    const fz = end.z + 3;
    for (const x of [end.x - h, end.x + h]) root.add(placeBox(new THREE.Mesh(unit, m.lambert(0xffd23f)), x - 0.3, x + 0.3, fz - 0.3, fz + 0.3, 0, 4));
    root.add(placeBox(new THREE.Mesh(unit, m.lambert(0xff5d8f)), end.x - h - 0.6, end.x + h + 0.6, fz - 0.3, fz + 0.3, 3.4, 4.2));
    root.add(placeBox(new THREE.Mesh(unit, m.lambert(0x23232e)), end.x - h, end.x + h, fz - 0.3, fz + 0.3, 0, 0.03));
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
  return new IceView(root, scene, ctx, res);
}
