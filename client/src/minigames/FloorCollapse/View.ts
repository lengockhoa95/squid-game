import * as THREE from 'three';
import {
  COLLAPSE, COLLAPSE_TILE_COUNT, TILE_CRACKING, TILE_GONE,
  collapseCoords, collapseStep, createCollapseWorld, dropTile, tileCenter,
  type QualityPreset,
} from '@sp/shared';
import type { SceneContext } from '../../core/GameScene.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';
import type { MinigameView, ViewFrame } from '../framework/MinigameView.ts';
import { StageLights, setSky } from '../framework/stage.ts';

const DEG = Math.PI / 180;
/** Two shades per floor (checkerboard). */
const LAYER_COLORS: ReadonlyArray<[number, number]> = [
  [0xff8fb1, 0xff6f9c],
  [0xffd166, 0xffbf3f],
  [0x7de2d1, 0x4ecdc4],
];
const CRACK_COLOR = 0xff3b3b;
const FALL_SECONDS = 1.2;
const PER_FLOOR = COLLAPSE.cols * COLLAPSE.rows;

/**
 * Three floors of tiles in one instanced mesh. Cracking tiles flash red and shake, dropped tiles fall
 * away; the local collision world drops the same tiles so prediction matches the server.
 */
class CollapseView implements MinigameView {
  private readonly cw = createCollapseWorld();
  readonly step = collapseStep(this.cw);
  readonly clickTargets: THREE.Object3D[] = [];
  readonly cameraPreset = { yaw: 0, pitch: 42 * DEG, distance: 12 };
  private readonly lights: StageLights;
  /** One instanced mesh per floor, so floors above the camera target can fade out. */
  private readonly floors: THREE.InstancedMesh[] = [];
  private readonly floorMats: THREE.MeshLambertMaterial[] = [];
  private readonly dirtyFloor = new Uint8Array(COLLAPSE.layers);
  private focusLayer = -1;
  private readonly known = new Uint8Array(COLLAPSE_TILE_COUNT);
  /** Seconds since a tile dropped (−1 = not falling). */
  private readonly falling = new Float32Array(COLLAPSE_TILE_COUNT).fill(-1);
  private readonly fallingList: number[] = [];
  private readonly mtx = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scl = new THREE.Vector3(1, 1, 1);
  private readonly color = new THREE.Color();
  private readonly axis = new THREE.Vector3(1, 0, 0.4).normalize();
  private time = 0;

  constructor(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker) {
    setSky(scene, 0x2b1f4a, 30, 110);
    this.lights = new StageLights(root, 22, 0xe8dcff, 0x3a2d5c);
    const geo = res.track(new THREE.BoxGeometry(COLLAPSE.tile - 0.08, COLLAPSE.thickness, COLLAPSE.tile - 0.08));
    for (let layer = 0; layer < COLLAPSE.layers; layer++) {
      const mat = res.track(new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 1 }));
      const mesh = res.track(new THREE.InstancedMesh(geo, mat, PER_FLOOR));
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.floors.push(mesh);
      this.floorMats.push(mat);
      root.add(mesh);
      this.clickTargets.push(mesh);
    }
    for (let i = 0; i < COLLAPSE_TILE_COUNT; i++) this.placeTile(i, 0, 0, this.baseColor(i));
    this.flush();

    // Glowing pit far below the last floor.
    const pitGeo = res.track(new THREE.PlaneGeometry(160, 160).rotateX(-Math.PI / 2));
    const pit = new THREE.Mesh(pitGeo, ctx.materials.basic(0xff4f6d));
    pit.position.y = COLLAPSE.killY + 2;
    root.add(pit);
    this.applyQuality(ctx.quality);
  }

  cameraFocus(): null {
    return null;
  }

  update(dt: number, frame: ViewFrame): void {
    this.time += dt;
    // Floors above whoever the camera follows fade out so they do not block the view.
    const layer = Math.max(0, Math.min(COLLAPSE.layers - 1, Math.round(-frame.focus.y / COLLAPSE.layerGap)));
    if (layer !== this.focusLayer) {
      this.focusLayer = layer;
      this.floorMats.forEach((m, l) => {
        const above = l < layer;
        m.opacity = above ? 0.12 : 1;
        m.depthWrite = !above;
        this.floors[l]!.castShadow = !above;
      });
      // Clicks (element aiming) go through faded floors.
      this.clickTargets.length = 0;
      for (let l = layer; l < this.floors.length; l++) this.clickTargets.push(this.floors[l]!);
    }
    const tiles = frame.state.collapse?.tiles;
    if (tiles) {
      for (let i = 0; i < COLLAPSE_TILE_COUNT; i++) {
        const v = tiles[i] ?? 0;
        if (v === this.known[i]) continue;
        this.known[i] = v;
        if (v === TILE_GONE) {
          dropTile(this.cw, i);
          this.falling[i] = 0;
          this.fallingList.push(i);
        }
      }
    }
    // Cracking tiles shake and flash.
    const flash = Math.sin(this.time * 30) > 0;
    for (let i = 0; i < COLLAPSE_TILE_COUNT; i++) {
      if (this.known[i] !== TILE_CRACKING) continue;
      this.placeTile(i, (Math.random() - 0.5) * 0.08, 0, flash ? CRACK_COLOR : this.baseColor(i));
    }
    for (let k = this.fallingList.length - 1; k >= 0; k--) {
      const i = this.fallingList[k]!;
      this.falling[i]! += dt;
      const f = this.falling[i]!;
      if (f >= FALL_SECONDS) {
        this.hideTile(i);
        this.fallingList.splice(k, 1);
      } else {
        this.placeTile(i, 0, -9 * f * f, CRACK_COLOR, f * 3);
      }
    }
    this.flush();
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

  private baseColor(i: number): number {
    const { layer, row, col } = collapseCoords(i);
    return LAYER_COLORS[layer]![(row + col) % 2]!;
  }

  private placeTile(i: number, jitter: number, dropY: number, color: number, spin = 0): void {
    const c = tileCenter(i);
    this.pos.set(c.x + jitter, c.y - COLLAPSE.thickness / 2 + dropY, c.z + jitter);
    this.quat.setFromAxisAngle(this.axis, spin);
    this.scl.set(1, 1, 1);
    this.mtx.compose(this.pos, this.quat, this.scl);
    const mesh = this.floors[Math.floor(i / PER_FLOOR)]!;
    mesh.setMatrixAt(i % PER_FLOOR, this.mtx);
    mesh.setColorAt(i % PER_FLOOR, this.color.set(color));
    this.dirtyFloor[Math.floor(i / PER_FLOOR)] = 1;
  }

  private hideTile(i: number): void {
    this.mtx.makeScale(0, 0, 0);
    this.floors[Math.floor(i / PER_FLOOR)]!.setMatrixAt(i % PER_FLOOR, this.mtx);
    this.dirtyFloor[Math.floor(i / PER_FLOOR)] = 1;
  }

  /** Upload changed instance data (only for floors that changed this frame). */
  private flush(): void {
    for (let l = 0; l < this.floors.length; l++) {
      if (!this.dirtyFloor[l]) continue;
      this.dirtyFloor[l] = 0;
      const mesh = this.floors[l]!;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}

export function createView(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker): MinigameView {
  return new CollapseView(root, scene, ctx, res);
}
