import * as THREE from 'three';
import type { GameAction, QualityPreset } from '@sp/shared';
import type { SceneContext } from '../../core/GameScene.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';
import type { MinigameView, ViewFrame } from '../framework/MinigameView.ts';
import { StageLights, placeBox, setSky } from '../framework/stage.ts';

const DEG = Math.PI / 180;
const STAGE_COLORS: Record<string, number> = { WAIT: 0xff3b5c, GO: 0x37f08b, BREAK: 0x5a5f7a, DONE: 0x5a5f7a };

/** Players line up facing a giant signal screen that turns green on GO. */
class ReactionView implements MinigameView {
  readonly step = null;
  readonly clickTargets: THREE.Object3D[] = [];
  readonly cameraPreset = { yaw: 0, pitch: 16 * DEG, distance: 9 };
  private readonly lights: StageLights;
  private readonly screenMat: THREE.MeshBasicMaterial;
  private readonly focus = new THREE.Vector3(0, 1.2, -2);

  constructor(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker) {
    setSky(scene, 0x1d2136, 30, 80);
    this.lights = new StageLights(root, 14, 0xc9d4ff, 0x30263f);
    const m = ctx.materials;
    const unit = res.track(new THREE.BoxGeometry(1, 1, 1));
    const floor = placeBox(new THREE.Mesh(unit, m.lambert(0x3a3f5c)), -12, 12, -12, 8, -1, 0);
    floor.receiveShadow = true;
    root.add(floor);
    this.clickTargets.push(floor);
    root.add(placeBox(new THREE.Mesh(unit, m.lambert(0xffffff)), -7, 7, -0.9, -0.7, 0, 0.02));

    const frame = placeBox(new THREE.Mesh(unit, m.lambert(0x23232e)), -6, 6, -10.6, -10, 0.5, 7.5);
    frame.castShadow = true;
    this.screenMat = res.track(new THREE.MeshBasicMaterial({ color: STAGE_COLORS.WAIT }));
    const screen = new THREE.Mesh(res.track(new THREE.PlaneGeometry(11, 6)), this.screenMat);
    screen.position.set(0, 4, -9.95);
    root.add(frame, screen);
    this.applyQuality(ctx.quality);
  }

  cameraFocus(): THREE.Vector3 {
    return this.focus;
  }

  update(_dt: number, frame: ViewFrame): void {
    const stage = frame.state.reaction?.stage ?? 'WAIT';
    this.screenMat.color.setHex(STAGE_COLORS[stage] ?? STAGE_COLORS.WAIT!);
    this.lights.follow(this.focus);
  }

  actionForClick(): GameAction {
    return { kind: 'REACT' };
  }

  actionForKey(code: string): GameAction | null {
    return code === 'Space' ? { kind: 'REACT' } : null;
  }

  applyQuality(p: QualityPreset): void {
    this.lights.applyQuality(p);
  }

  dispose(): void {
    this.lights.dispose();
  }
}

export function createView(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker): MinigameView {
  return new ReactionView(root, scene, ctx, res);
}
