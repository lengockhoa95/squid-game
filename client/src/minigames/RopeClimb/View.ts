import * as THREE from 'three';
import {
  ROPE, ROPE_FINISH_Z, createRopeWorld, plankCenter, ropeStep, stationCenter, windAt,
  type QualityPreset,
} from '@sp/shared';
import type { SceneContext } from '../../core/GameScene.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';
import type { MinigameView, ViewFrame } from '../framework/MinigameView.ts';
import { StageLights, placeBox, setSky } from '../framework/stage.ts';

const DEG = Math.PI / 180;

/** Stations on poles over a canyon, swaying plank bridges with rope rails, wind streaks during gusts. */
class RopeView implements MinigameView {
  readonly step = ropeStep(createRopeWorld());
  readonly clickTargets: THREE.Object3D[] = [];
  readonly cameraPreset = { yaw: 0, pitch: 26 * DEG, distance: 10 };
  private readonly lights: StageLights;
  private readonly planks: THREE.Mesh[] = [];
  private readonly streaks: THREE.Mesh[] = [];
  private time = 0;

  constructor(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker) {
    setSky(scene, 0xffc98a, 40, 140);
    this.lights = new StageLights(root, 20, 0xfff1d6, 0x8a5a3a);
    const m = ctx.materials;
    const unit = res.track(new THREE.BoxGeometry(1, 1, 1));
    const h = ROPE.stationSize / 2;
    for (let i = 0; i < ROPE.stations; i++) {
      const c = stationCenter(i);
      const top = placeBox(new THREE.Mesh(unit, m.lambert(i === ROPE.stations - 1 ? 0x3df5c8 : 0x8b5a2b)), c.x - h, c.x + h, c.z - h, c.z + h, c.y - 1, c.y);
      top.castShadow = true;
      top.receiveShadow = true;
      root.add(top);
      this.clickTargets.push(top);
      root.add(placeBox(new THREE.Mesh(unit, m.lambert(0x5a3a1c)), c.x - 0.6, c.x + 0.6, c.z - 0.6, c.z + 0.6, -30, c.y - 1)); // pole
    }
    const plankGeo = res.track(new THREE.BoxGeometry(ROPE.plankWidth, 0.2, 1.15));
    const plankMat = m.lambert(0xd9a066);
    for (let i = 0; i < ROPE.stations - 1; i++) {
      for (let k = 0; k < ROPE.planks; k++) {
        const plank = new THREE.Mesh(plankGeo, plankMat);
        plank.castShadow = true;
        plank.receiveShadow = true;
        root.add(plank);
        this.planks.push(plank);
        this.clickTargets.push(plank);
      }
    }
    // Canyon floor far below.
    const floor = new THREE.Mesh(res.track(new THREE.PlaneGeometry(200, 260).rotateX(-Math.PI / 2)), m.lambert(0xb5733c));
    floor.position.set(0, -30, -40);
    root.add(floor);
    // Finish flag.
    const end = stationCenter(ROPE.stations - 1);
    root.add(placeBox(new THREE.Mesh(unit, m.lambert(0xffffff)), -0.05, 0.05, ROPE_FINISH_Z - 0.05, ROPE_FINISH_Z + 0.05, end.y, end.y + 3));
    root.add(placeBox(new THREE.Mesh(unit, m.lambert(0xff4f9a)), 0.05, 1.2, ROPE_FINISH_Z - 0.03, ROPE_FINISH_Z + 0.03, end.y + 2.2, end.y + 2.9));
    // Wind streaks (shown during gusts).
    const streakGeo = res.track(new THREE.BoxGeometry(2.4, 0.04, 0.04));
    for (let n = 0; n < 24; n++) {
      const st = new THREE.Mesh(streakGeo, m.basic(0xffffff, 0.6));
      st.visible = false;
      root.add(st);
      this.streaks.push(st);
    }
    this.applyQuality(ctx.quality);
  }

  cameraFocus(): null {
    return null;
  }

  update(dt: number, frame: ViewFrame): void {
    this.time += dt;
    const t = frame.gameTime;
    for (let i = 0; i < ROPE.stations - 1; i++) {
      for (let k = 0; k < ROPE.planks; k++) {
        const p = plankCenter(i, k, t);
        this.planks[i * ROPE.planks + k]!.position.set(p.x, p.y - 0.1, p.z);
      }
    }
    const wind = windAt(t);
    this.streaks.forEach((st, n) => {
      st.visible = Math.abs(wind) > 0.3;
      if (!st.visible) return;
      const f = frame.focus;
      const span = 24;
      const x = ((((this.time * wind * 8 + n * 7.3) % span) + span) % span) - span / 2;
      st.position.set(f.x + x, f.y + 0.5 + (n % 6) * 0.7, f.z - 6 + (n % 4) * 4);
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
  return new RopeView(root, scene, ctx, res);
}
