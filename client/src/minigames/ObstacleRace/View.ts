import * as THREE from 'three';
import {
  MOVEMENT, PUSHERS, RACE, RACE_LAYOUT, SWEEPERS, createRaceWorld, pusherX, raceStep, sweeperAngle,
  type QualityPreset,
} from '@sp/shared';
import type { SceneContext } from '../../core/GameScene.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';
import type { MinigameView, ViewFrame } from '../framework/MinigameView.ts';
import { StageLights, placeBox, setSky } from '../framework/stage.ts';

const DEG = Math.PI / 180;
const FLOOR_COLORS = [0x8fd3ff, 0xffd166, 0x9bf6a3];

/** Floating track over water: floor segments with gaps, low walls, sliding pushers and rotating sweepers. */
class RaceView implements MinigameView {
  // Own RaceWorld instance: prediction moves its pushers independently of the rendered ones.
  readonly step = raceStep(createRaceWorld(), MOVEMENT.radius);
  readonly clickTargets: THREE.Object3D[] = [];
  readonly cameraPreset = { yaw: 0, pitch: 30 * DEG, distance: 10 };
  private readonly lights: StageLights;
  private readonly pushers: THREE.Mesh[] = [];
  private readonly sweepers: THREE.Group[] = [];

  constructor(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker) {
    setSky(scene, 0xa8e0ff, 40, 110);
    this.lights = new StageLights(root, 20);
    const m = ctx.materials;
    const unit = res.track(new THREE.BoxGeometry(1, 1, 1));
    const hw = RACE.halfWidth;

    const water = placeBox(new THREE.Mesh(unit, m.lambert(0x3d8bfd)), -60, 60, -110, 80, -5, -4);
    root.add(water);
    RACE_LAYOUT.floor.forEach(([a, b], i) => {
      const seg = placeBox(new THREE.Mesh(unit, m.lambert(FLOOR_COLORS[i % FLOOR_COLORS.length]!)), -hw, hw, b, a, -1.2, 0);
      seg.receiveShadow = true;
      seg.castShadow = true;
      root.add(seg);
      this.clickTargets.push(seg);
    });
    for (const z of RACE_LAYOUT.wallZs) {
      const wall = placeBox(new THREE.Mesh(unit, m.lambert(0xff5d8f)), -hw, hw, z - 0.4, z + 0.4, 0, RACE_LAYOUT.wallHeight);
      wall.castShadow = true;
      root.add(wall);
      this.clickTargets.push(wall);
    }
    for (const p of PUSHERS) {
      const mesh = placeBox(new THREE.Mesh(unit, m.lambert(0x7b61ff)), -p.width / 2, p.width / 2, p.z - p.depth / 2, p.z + p.depth / 2, 0, p.top);
      mesh.castShadow = true;
      root.add(mesh);
      this.pushers.push(mesh);
    }
    const postGeo = res.track(new THREE.CylinderGeometry(0.35, 0.45, 1.2, 8));
    for (const sw of SWEEPERS) {
      const pivot = new THREE.Group();
      pivot.position.set(sw.x, 0, sw.z);
      const post = new THREE.Mesh(postGeo, m.lambert(0x23232e));
      post.position.y = 0.6;
      const bar = new THREE.Mesh(unit, m.lambert(0xff8c42));
      bar.scale.set(sw.length * 2, 0.3, 0.35);
      bar.position.y = 0.45;
      bar.castShadow = true;
      pivot.add(post, bar);
      root.add(pivot);
      this.sweepers.push(pivot);
    }
    // Checkpoint markers and finish arch.
    for (const cp of RACE.checkpoints.slice(1)) {
      root.add(placeBox(new THREE.Mesh(unit, m.lambert(0xffffff)), -hw, hw, cp - 0.15, cp + 0.15, 0, 0.03));
      for (const x of [-hw, hw]) root.add(placeBox(new THREE.Mesh(unit, m.lambert(0x3df5c8)), x - 0.1, x + 0.1, cp - 0.1, cp + 0.1, 0, 2));
    }
    for (const x of [-hw - 0.3, hw + 0.3]) {
      const post = placeBox(new THREE.Mesh(unit, m.lambert(0xffd23f)), x - 0.3, x + 0.3, RACE.finishZ - 0.3, RACE.finishZ + 0.3, 0, 4);
      post.castShadow = true;
      root.add(post);
    }
    root.add(placeBox(new THREE.Mesh(unit, m.lambert(0xff5d8f)), -hw - 0.6, hw + 0.6, RACE.finishZ - 0.3, RACE.finishZ + 0.3, 3.4, 4.2));
    root.add(placeBox(new THREE.Mesh(unit, m.lambert(0x23232e)), -hw, hw, RACE.finishZ - 0.3, RACE.finishZ + 0.3, 0, 0.03));
    this.applyQuality(ctx.quality);
  }

  cameraFocus(): null {
    return null;
  }

  update(_dt: number, frame: ViewFrame): void {
    const t = frame.gameTime;
    PUSHERS.forEach((p, i) => {
      this.pushers[i]!.position.x = pusherX(p, t);
    });
    SWEEPERS.forEach((sw, i) => {
      this.sweepers[i]!.rotation.y = -sweeperAngle(sw, t);
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
  return new RaceView(root, scene, ctx, res);
}
