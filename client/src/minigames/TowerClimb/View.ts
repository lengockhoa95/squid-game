import * as THREE from 'three';
import {
  TOWER, TOWER_PLATFORMS, TOWER_TOP, createTowerWorld, ghostIsSolid, lavaHeight, platformCenter, towerStep,
  type QualityPreset,
} from '@sp/shared';
import type { SceneContext } from '../../core/GameScene.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';
import type { MinigameView, ViewFrame } from '../framework/MinigameView.ts';
import { StageLights, setSky } from '../framework/stage.ts';

const DEG = Math.PI / 180;

/** Spiral platforms around a stone core, a ground floor, and a glowing lava sheet that rises with game time. */
class TowerView implements MinigameView {
  readonly step = towerStep(createTowerWorld());
  readonly clickTargets: THREE.Object3D[] = [];
  readonly cameraPreset = { yaw: 0, pitch: 24 * DEG, distance: 11 };
  private readonly lights: StageLights;
  private readonly platforms: THREE.Mesh[] = [];
  private readonly ghostMat: THREE.MeshLambertMaterial;
  private readonly lava: THREE.Mesh;
  private readonly lavaLight: THREE.PointLight;
  private time = 0;

  constructor(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker) {
    setSky(scene, 0x3a1f2e, 30, 120);
    this.lights = new StageLights(root, 18, 0xffe1c4, 0x5a2a1a);
    const m = ctx.materials;
    const core = new THREE.Mesh(res.track(new THREE.CylinderGeometry(TOWER.coreRadius, TOWER.coreRadius + 0.6, TOWER_TOP + 8, 12)), m.lambert(0x6b5a7a));
    core.position.y = (TOWER_TOP + 8) / 2 - 2;
    core.castShadow = true;
    core.receiveShadow = true;
    root.add(core);
    const b = TOWER.baseHalf;
    const base = new THREE.Mesh(res.track(new THREE.BoxGeometry(b * 2, 1, b * 2)), m.lambert(0x4a3b55));
    base.position.y = -0.5;
    base.receiveShadow = true;
    root.add(base);
    this.clickTargets.push(base, core);

    const plat = res.track(new THREE.BoxGeometry(TOWER.size, TOWER.thickness, TOWER.size));
    const goal = res.track(new THREE.BoxGeometry(TOWER.goalSize, TOWER.thickness, TOWER.goalSize));
    this.ghostMat = res.track(new THREE.MeshLambertMaterial({ color: 0xb78cff, transparent: true, opacity: 0.9 }));
    const color = new THREE.Color();
    for (const p of TOWER_PLATFORMS) {
      let mat: THREE.Material;
      if (p.kind === 'ghost') mat = this.ghostMat;
      else if (p.kind === 'moving') mat = m.lambert(0xffd23f);
      else if (p.kind === 'goal') mat = m.lambert(0x3df5c8);
      else mat = m.lambert(color.setHSL(0.55 - (p.y / TOWER_TOP) * 0.45, 0.65, 0.62).getHex());
      const mesh = new THREE.Mesh(p.kind === 'goal' ? goal : plat, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.y = p.y - TOWER.thickness / 2;
      root.add(mesh);
      this.platforms.push(mesh);
      this.clickTargets.push(mesh);
    }
    // Flag on the goal.
    const top = TOWER_PLATFORMS[TOWER_PLATFORMS.length - 1]!;
    const tc = platformCenter(top, 0);
    const pole = new THREE.Mesh(res.track(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6)), m.lambert(0xffffff));
    pole.position.set(tc.x, top.y + 1.3, tc.z);
    const flag = new THREE.Mesh(res.track(new THREE.BoxGeometry(0.05, 0.7, 1.1)), m.lambert(0xff4f9a));
    flag.position.set(tc.x, top.y + 2.2, tc.z + 0.55);
    root.add(pole, flag);

    this.lava = new THREE.Mesh(res.track(new THREE.PlaneGeometry(140, 140).rotateX(-Math.PI / 2)), m.basic(0xff5a1f));
    root.add(this.lava);
    this.lavaLight = new THREE.PointLight(0xff6a2a, 60, 30, 1.6);
    root.add(this.lavaLight);
    this.applyQuality(ctx.quality);
  }

  cameraFocus(): null {
    return null;
  }

  update(dt: number, frame: ViewFrame): void {
    this.time += dt;
    const t = frame.gameTime;
    TOWER_PLATFORMS.forEach((p, i) => {
      const mesh = this.platforms[i]!;
      const c = platformCenter(p, t);
      mesh.position.x = c.x;
      mesh.position.z = c.z;
      if (p.kind === 'ghost') mesh.visible = ghostIsSolid(p, t) || Math.sin(this.time * 25) > 0.6;
    });
    const lava = lavaHeight(t);
    this.lava.position.y = lava + Math.sin(this.time * 2) * 0.05;
    this.lavaLight.position.set(frame.focus.x, lava + 2, frame.focus.z);
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
  return new TowerView(root, scene, ctx, res);
}
