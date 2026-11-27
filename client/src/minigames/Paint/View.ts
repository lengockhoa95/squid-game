import * as THREE from 'three';
import {
  PAINT, PAINT_CELL_COUNT, PAINT_CRATES, PAINT_HALF, SLOT_LOOKS, createPaintWorld, paintCellCenter, paintStep,
  type QualityPreset,
} from '@sp/shared';
import type { SceneContext } from '../../core/GameScene.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';
import type { MinigameView, ViewFrame } from '../framework/MinigameView.ts';
import { StageLights, placeBox, setSky } from '../framework/stage.ts';

const DEG = Math.PI / 180;
const BLANK = [0xe8e4f0, 0xdcd7e8];

/** Square arena of floor cells (one instanced mesh) recoloured as players paint them. */
class PaintView implements MinigameView {
  readonly step = paintStep(createPaintWorld());
  readonly clickTargets: THREE.Object3D[] = [];
  readonly cameraPreset = { yaw: 0, pitch: 48 * DEG, distance: 13 };
  private readonly lights: StageLights;
  private readonly cells: THREE.InstancedMesh;
  private readonly known = new Uint8Array(PAINT_CELL_COUNT);
  private readonly color = new THREE.Color();

  constructor(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker) {
    setSky(scene, 0x1f2a44, 30, 110);
    this.lights = new StageLights(root, 22);
    const m = ctx.materials;
    const unit = res.track(new THREE.BoxGeometry(1, 1, 1));
    const geo = res.track(new THREE.BoxGeometry(PAINT.cell * 0.96, 0.2, PAINT.cell * 0.96));
    this.cells = res.track(new THREE.InstancedMesh(geo, res.track(new THREE.MeshLambertMaterial({ color: 0xffffff })), PAINT_CELL_COUNT));
    this.cells.receiveShadow = true;
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < PAINT_CELL_COUNT; i++) {
      const c = paintCellCenter(i);
      mtx.makeTranslation(c.x, -0.1, c.z);
      this.cells.setMatrixAt(i, mtx);
      this.cells.setColorAt(i, this.color.set(this.blank(i)));
    }
    root.add(this.cells);
    this.clickTargets.push(this.cells);
    const base = placeBox(new THREE.Mesh(unit, m.lambert(0x3a3557)), -PAINT_HALF - 1, PAINT_HALF + 1, -PAINT_HALF - 1, PAINT_HALF + 1, -1.2, -0.2);
    root.add(base);
    for (const c of PAINT_CRATES) {
      const crate = placeBox(new THREE.Mesh(unit, m.lambert(0xb07a45)), c.x - c.w / 2, c.x + c.w / 2, c.z - c.d / 2, c.z + c.d / 2, 0, 1.4);
      crate.castShadow = true;
      root.add(crate);
    }
    this.applyQuality(ctx.quality);
  }

  cameraFocus(): null {
    return null;
  }

  update(_dt: number, frame: ViewFrame): void {
    const cells = frame.state.paint?.cells;
    if (cells) {
      let dirty = false;
      for (let i = 0; i < PAINT_CELL_COUNT; i++) {
        const v = cells[i] ?? 0;
        if (v === this.known[i]) continue;
        this.known[i] = v;
        this.cells.setColorAt(i, this.color.set(v > 0 ? (SLOT_LOOKS[v - 1]?.color ?? 0xffffff) : this.blank(i)));
        dirty = true;
      }
      if (dirty && this.cells.instanceColor) this.cells.instanceColor.needsUpdate = true;
    }
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

  private blank(i: number): number {
    return BLANK[(Math.floor(i / PAINT.cells) + (i % PAINT.cells)) % 2]!;
  }
}

export function createView(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker): MinigameView {
  return new PaintView(root, scene, ctx, res);
}
