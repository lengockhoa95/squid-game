import * as THREE from 'three';
import { TUG, type GameAction, type QualityPreset } from '@sp/shared';
import type { SceneContext } from '../../core/GameScene.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';
import type { MinigameView, ViewFrame } from '../framework/MinigameView.ts';
import { StageLights, placeBox, setSky } from '../framework/stage.ts';

const DEG = Math.PI / 180;

/** Two platforms over a gap, a rope with a centre ribbon. Players are placed by the server. */
class TugView implements MinigameView {
  readonly step = null;
  readonly clickTargets: THREE.Object3D[] = [];
  readonly cameraPreset = { yaw: 0, pitch: 26 * DEG, distance: 13 };
  private readonly lights: StageLights;
  private readonly rope = new THREE.Group();
  private readonly focus = new THREE.Vector3(0, 0.5, 0);
  private ropeX = 0;

  constructor(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker) {
    setSky(scene, 0xffd6a5, 40, 110);
    this.lights = new StageLights(root, 18);
    const m = ctx.materials;
    const unit = res.track(new THREE.BoxGeometry(1, 1, 1));
    const left = placeBox(new THREE.Mesh(unit, m.lambert(0x4ecdc4)), -16, -1.2, -4, 4, -2, 0);
    const right = placeBox(new THREE.Mesh(unit, m.lambert(0xff6b6b)), 1.2, 16, -4, 4, -2, 0);
    for (const p of [left, right]) {
      p.receiveShadow = true;
      root.add(p);
      this.clickTargets.push(p);
    }
    root.add(placeBox(new THREE.Mesh(unit, m.lambert(0x1b1f33)), -30, 30, -30, 30, -16, -15));

    const ropeGeo = res.track(new THREE.CylinderGeometry(0.08, 0.08, TUG.ropeLength * 2, 6));
    ropeGeo.rotateZ(Math.PI / 2);
    const ropeMesh = new THREE.Mesh(ropeGeo, m.lambert(0xc8a165));
    ropeMesh.castShadow = true;
    const ribbon = new THREE.Mesh(unit, m.lambert(0xffd23f));
    ribbon.scale.set(0.25, 0.7, 0.25);
    ribbon.position.y = -0.35;
    this.rope.add(ropeMesh, ribbon);
    this.rope.position.y = 0.95;
    root.add(this.rope);
    this.applyQuality(ctx.quality);
  }

  cameraFocus(): THREE.Vector3 {
    return this.focus;
  }

  update(dt: number, frame: ViewFrame): void {
    const target = (frame.state.tug?.rope ?? 0) * TUG.shift;
    this.ropeX += (target - this.ropeX) * (1 - Math.exp(-10 * dt));
    this.rope.position.x = this.ropeX;
    this.lights.follow(this.focus);
  }

  actionForClick(): GameAction {
    return { kind: 'PULL' };
  }

  actionForKey(code: string): GameAction | null {
    return code === 'Space' ? { kind: 'PULL' } : null;
  }

  applyQuality(p: QualityPreset): void {
    this.lights.applyQuality(p);
  }

  dispose(): void {
    this.lights.dispose();
  }
}

export function createView(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker): MinigameView {
  return new TugView(root, scene, ctx, res);
}
