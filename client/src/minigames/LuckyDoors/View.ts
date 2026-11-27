import * as THREE from 'three';
import {
  DOORS, DOORS_FINISH_Z, DOOR_FAKE, DOOR_REAL, addFakeDoor, createDoorsWorld, doorRowZ, doorX, doorsStep,
  type QualityPreset,
} from '@sp/shared';
import type { SceneContext } from '../../core/GameScene.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';
import type { MinigameView, ViewFrame } from '../framework/MinigameView.ts';
import { StageLights, placeBox, setSky } from '../framework/stage.ts';
import { audio } from '../../audio/AudioManager.ts';

const DEG = Math.PI / 180;
const COUNT = DOORS.rows * DOORS.perRow;

/**
 * Corridor of door walls. Every unknown door looks the same (a shiny panel). Revealed real doors
 * open (panel gone, green frame); revealed fakes turn red and join the local collision world.
 */
class DoorsView implements MinigameView {
  private readonly world = createDoorsWorld();
  readonly step = doorsStep(this.world);
  readonly clickTargets: THREE.Object3D[] = [];
  readonly cameraPreset = { yaw: 0, pitch: 26 * DEG, distance: 9 };
  private readonly lights: StageLights;
  private readonly panels: THREE.Mesh[] = [];
  private readonly frames: THREE.Mesh[] = [];
  private readonly known = new Uint8Array(COUNT);
  private readonly fakeMat: THREE.Material;
  private readonly realMat: THREE.Material;

  constructor(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker) {
    setSky(scene, 0x2a1d3f, 30, 110);
    this.lights = new StageLights(root, 18, 0xffe9ff, 0x3a2d5c);
    const m = ctx.materials;
    const unit = res.track(new THREE.BoxGeometry(1, 1, 1));
    for (const b of this.world.boxes) {
      const isFloor = b.top <= 0;
      const mesh = placeBox(new THREE.Mesh(unit, m.lambert(isFloor ? 0x4a3b6a : 0xffd23f)), b.minX, b.maxX, b.minZ, b.maxZ, b.bottom ?? 0, b.top);
      mesh.receiveShadow = true;
      mesh.castShadow = !isFloor;
      root.add(mesh);
      if (isFloor) this.clickTargets.push(mesh);
    }
    const panelMat = res.track(new THREE.MeshStandardMaterial({ color: 0xc77dff, roughness: 0.25, metalness: 0.2 }));
    this.fakeMat = m.lambert(0xff3b5c);
    this.realMat = m.basic(0x3df5c8);
    const lintel = m.lambert(0xffd23f);
    for (let row = 0; row < DOORS.rows; row++) {
      const z = doorRowZ(row);
      // Beam over the whole row.
      root.add(placeBox(new THREE.Mesh(unit, lintel), -DOORS.halfWidth, DOORS.halfWidth, z - 0.3, z + 0.3, DOORS.wallHeight, DOORS.wallHeight + 0.4));
      for (let k = 0; k < DOORS.perRow; k++) {
        const x = doorX(k);
        const hw = DOORS.doorWidth / 2;
        const panel = placeBox(new THREE.Mesh(unit, panelMat), x - hw, x + hw, z - 0.12, z + 0.12, 0, DOORS.wallHeight);
        panel.castShadow = true;
        root.add(panel);
        this.panels.push(panel);
        const frame = placeBox(new THREE.Mesh(unit, this.realMat), x - hw, x + hw, z - 0.05, z + 0.05, DOORS.wallHeight - 0.15, DOORS.wallHeight);
        frame.visible = false;
        root.add(frame);
        this.frames.push(frame);
      }
    }
    // Finish line.
    root.add(placeBox(new THREE.Mesh(unit, m.basic(0x3df5c8)), -DOORS.halfWidth, DOORS.halfWidth, DOORS_FINISH_Z - 0.2, DOORS_FINISH_Z + 0.2, 0, 0.03));
    this.applyQuality(ctx.quality);
  }

  cameraFocus(): null {
    return null;
  }

  update(_dt: number, frame: ViewFrame): void {
    const tiles = frame.state.doors?.tiles;
    if (tiles) {
      for (let i = 0; i < COUNT; i++) {
        const v = tiles[i] ?? 0;
        if (v === this.known[i]) continue;
        this.known[i] = v;
        const row = Math.floor(i / DOORS.perRow);
        const k = i % DOORS.perRow;
        if (v === DOOR_FAKE) {
          this.panels[i]!.material = this.fakeMat;
          addFakeDoor(this.world, row, k); // now known: predict the bounce locally too
          audio.play('rumble', 0.15);
        } else if (v === DOOR_REAL) {
          this.panels[i]!.visible = false;
          this.frames[i]!.visible = true;
          audio.play('pass', 0.08);
        }
      }
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
}

export function createView(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker): MinigameView {
  return new DoorsView(root, scene, ctx, res);
}
