import * as THREE from 'three';
import { RLGL, createRlglWorld, staticWorldStep, type QualityPreset } from '@sp/shared';
import type { SceneContext } from '../../core/GameScene.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';
import type { MinigameView, ViewFrame } from '../framework/MinigameView.ts';
import { StageLights, placeBox, setSky } from '../framework/stage.ts';

const DEG = Math.PI / 180;
const GREEN = 0x37f08b;
const RED = 0xff3b5c;

/** Long sandy track, start/finish lines, side walls and an original "watcher" robot whose eye shows the light. */
class RlglView implements MinigameView {
  readonly step = staticWorldStep(createRlglWorld());
  readonly clickTargets: THREE.Object3D[] = [];
  readonly cameraPreset = { yaw: 0, pitch: 24 * DEG, distance: 10 };
  private readonly lights: StageLights;
  private readonly head = new THREE.Group();
  private readonly eyeMat: THREE.MeshBasicMaterial;
  private readonly lampMat: THREE.MeshBasicMaterial;
  private headYaw = Math.PI;

  constructor(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker) {
    setSky(scene, 0xbfe6ff, 45, 120);
    this.lights = new StageLights(root, 22);
    const m = ctx.materials;
    const unit = res.track(new THREE.BoxGeometry(1, 1, 1));
    const hw = RLGL.halfWidth;

    const ground = placeBox(new THREE.Mesh(unit, m.lambert(0xe9c79a)), -hw - 6, hw + 6, RLGL.dollZ - 10, RLGL.startZ + 10, -1, 0);
    ground.receiveShadow = true;
    root.add(ground);
    this.clickTargets.push(ground);
    const track = placeBox(new THREE.Mesh(unit, m.lambert(0xf3dcb6)), -hw, hw, RLGL.finishZ - 2, RLGL.startZ + 3, -1, 0.005);
    track.receiveShadow = true;
    root.add(track);
    this.clickTargets.push(track);

    root.add(placeBox(new THREE.Mesh(unit, m.lambert(0xffffff)), -hw, hw, RLGL.startZ + 1.2, RLGL.startZ + 1.6, 0, 0.02));
    // Checkered finish line: one instanced mesh.
    const cells = Math.round(hw * 2);
    const checker = res.track(new THREE.InstancedMesh(unit, m.lambert(0xffffff), cells * 2));
    const mtx = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let i = 0; i < cells * 2; i++) {
      const col = i % cells;
      const row = Math.floor(i / cells);
      mtx.makeScale(1, 0.03, 0.5).setPosition(-hw + col + 0.5, 0.015, RLGL.finishZ - row * 0.5 - 0.25);
      checker.setMatrixAt(i, mtx);
      checker.setColorAt(i, color.set((col + row) % 2 === 0 ? 0x23232e : 0xffffff));
    }
    root.add(checker);

    for (const side of [-1, 1]) {
      const wall = placeBox(new THREE.Mesh(unit, m.lambert(side < 0 ? 0xff8fb1 : 0x8fd3ff)), side * (hw + 0.5) - 0.5, side * (hw + 0.5) + 0.5, RLGL.dollZ - 4, RLGL.startZ + 6, 0, 3.2);
      wall.castShadow = true;
      wall.receiveShadow = true;
      root.add(wall);
    }

    // Watcher robot: stacked cylinders + a round head with one big eye.
    const watcher = new THREE.Group();
    watcher.position.set(0, 0, RLGL.dollZ);
    const bodyGeo = res.track(new THREE.CylinderGeometry(1.1, 1.5, 4.2, 10));
    const body = new THREE.Mesh(bodyGeo, m.lambert(0xff6f91));
    body.position.y = 2.1;
    body.castShadow = true;
    const headGeo = res.track(new THREE.IcosahedronGeometry(1.5, 1));
    const headMesh = new THREE.Mesh(headGeo, m.lambert(0xffd23f));
    headMesh.castShadow = true;
    this.eyeMat = res.track(new THREE.MeshBasicMaterial({ color: GREEN }));
    const eye = new THREE.Mesh(res.track(new THREE.CircleGeometry(0.55, 16)), this.eyeMat);
    eye.position.set(0, 0.15, 1.42);
    const backDot = new THREE.Mesh(res.track(new THREE.CircleGeometry(0.25, 10)), m.lambert(0x23232e));
    backDot.position.set(0, 0.1, -1.42);
    backDot.rotation.y = Math.PI;
    this.head.add(headMesh, eye, backDot);
    this.head.position.y = 5.4;
    watcher.add(body, this.head);
    root.add(watcher);

    this.lampMat = res.track(new THREE.MeshBasicMaterial({ color: GREEN }));
    for (const x of [-5, 5]) {
      const pole = placeBox(new THREE.Mesh(unit, m.lambert(0x4a4f6a)), x - 0.15, x + 0.15, RLGL.dollZ + 1.85, RLGL.dollZ + 2.15, 0, 4.5);
      const lamp = new THREE.Mesh(res.track(new THREE.SphereGeometry(0.6, 12, 8)), this.lampMat);
      lamp.position.set(x, 5, RLGL.dollZ + 2);
      root.add(pole, lamp);
    }
    this.applyQuality(ctx.quality);
  }

  cameraFocus(): null {
    return null;
  }

  update(dt: number, frame: ViewFrame): void {
    const red = frame.state.rlgl?.light === 'RED';
    const color = red ? RED : GREEN;
    this.eyeMat.color.setHex(color);
    this.lampMat.color.setHex(color);
    // Green: the watcher looks away; red: it turns to face the players.
    const target = red ? 0 : Math.PI;
    this.headYaw += (target - this.headYaw) * (1 - Math.exp(-14 * dt));
    this.head.rotation.y = this.headYaw;
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
  return new RlglView(root, scene, ctx, res);
}
