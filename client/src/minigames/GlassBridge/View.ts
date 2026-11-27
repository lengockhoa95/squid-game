import * as THREE from 'three';
import {
  BRIDGE, TILE_BROKEN, TILE_SAFE, bridgeFinishZ, bridgeRowZ, bridgeRowsFor,
  type BridgeSide, type GameAction, type QualityPreset,
} from '@sp/shared';
import type { ClickHit, SceneContext } from '../../core/GameScene.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';
import type { MinigameView, ViewFrame } from '../framework/MinigameView.ts';
import { StageLights, placeBox, setSky } from '../framework/stage.ts';
import { bridgeHints } from '../../network/bridgeHints.ts';

const DEG = Math.PI / 180;
const PER_ROW = BRIDGE.tilesPerRow;
const TILE_CAPACITY = BRIDGE.maxRows * PER_ROW;
const SHARDS = 48;
const UNKNOWN_COLOR = 0xaee9ff;
const SAFE_COLOR = 0x7dffb2;
const HINT_COLOR = 0xff5a5a;

/** Platforms over a deep pit, glass tiles in one instanced mesh, pooled shard particles when a tile breaks. */
class BridgeView implements MinigameView {
  readonly step = null;
  readonly clickTargets: THREE.Object3D[] = [];
  readonly cameraPreset = { yaw: 0, pitch: 34 * DEG, distance: 9 };
  private readonly lights: StageLights;
  private readonly tiles: THREE.InstancedMesh;
  private readonly finish: THREE.Mesh;
  private readonly finishLine: THREE.Mesh;
  private readonly beams: THREE.Mesh[] = [];
  private rows = 0;
  private hintRound = -1;
  private readonly shards: THREE.InstancedMesh;
  private readonly shardPos = new Float32Array(SHARDS * 3);
  private readonly shardVel = new Float32Array(SHARDS * 3);
  private readonly shardLife = new Float32Array(SHARDS);
  private nextShard = 0;
  private readonly known = new Uint8Array(TILE_CAPACITY);
  private readonly mtx = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  private readonly quat = new THREE.Quaternion();
  private readonly scl = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private readonly spinAxis = new THREE.Vector3(1, 1, 0).normalize();

  constructor(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker) {
    setSky(scene, 0x9db8e8, 30, 90);
    this.lights = new StageLights(root, 18);
    const m = ctx.materials;
    const unit = res.track(new THREE.BoxGeometry(1, 1, 1));
    const lastZ = bridgeFinishZ(BRIDGE.maxRows); // repositioned in layout() once the row count is known

    const start = placeBox(new THREE.Mesh(unit, m.lambert(0x6c7aa8)), -5, 5, BRIDGE.startZ - 1.6, BRIDGE.startZ + 4, -1.5, 0);
    this.finish = placeBox(new THREE.Mesh(unit, m.lambert(0x6c7aa8)), -5, 5, lastZ - 6, lastZ + 1.4, -1.5, 0);
    for (const p of [start, this.finish]) {
      p.receiveShadow = true;
      p.castShadow = true;
      root.add(p);
    }
    this.clickTargets.push(this.finish);
    this.finishLine = placeBox(new THREE.Mesh(unit, m.lambert(0xffd23f)), -4, 4, lastZ + 1.1, lastZ + 1.4, 0, 0.03);
    root.add(this.finishLine);

    for (const x of [-3.95, -1.3, 1.3, 3.95]) {
      const beam = new THREE.Mesh(unit, m.lambert(0x3c4466));
      beam.castShadow = true;
      beam.userData.x = x;
      root.add(beam);
      this.beams.push(beam);
    }
    const pit = placeBox(new THREE.Mesh(unit, m.lambert(0x1b1f33)), -40, 40, lastZ - 30, BRIDGE.startZ + 30, -21, -20);
    root.add(pit);

    const glass = res.track(new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.72 }));
    const tileGeo = res.track(new THREE.BoxGeometry(BRIDGE.tileSize, 0.14, BRIDGE.tileSize * 0.9));
    this.tiles = res.track(new THREE.InstancedMesh(tileGeo, glass, TILE_CAPACITY));
    for (let i = 0; i < TILE_CAPACITY; i++) this.setTile(i, false, UNKNOWN_COLOR);
    this.layout(bridgeRowsFor(4));
    this.tiles.receiveShadow = true;
    root.add(this.tiles);
    this.clickTargets.push(this.tiles);

    const shardGeo = res.track(new THREE.TetrahedronGeometry(0.18));
    this.shards = res.track(new THREE.InstancedMesh(shardGeo, glass, SHARDS));
    this.shards.frustumCulled = false;
    this.mtx.makeScale(0, 0, 0);
    for (let i = 0; i < SHARDS; i++) this.shards.setMatrixAt(i, this.mtx);
    root.add(this.shards);
    this.applyQuality(ctx.quality);
  }

  cameraFocus(): null {
    return null;
  }

  update(dt: number, frame: ViewFrame): void {
    const bridge = frame.state.bridge;
    if (bridge && bridge.rows !== this.rows) this.layout(bridge.rows);
    const tiles = bridge?.tiles;
    if (tiles) {
      for (let i = 0; i < this.rows * PER_ROW; i++) {
        const v = tiles[i] ?? 0;
        if (v === this.known[i]) continue;
        this.known[i] = v;
        if (v === TILE_BROKEN) {
          this.setTile(i, false, UNKNOWN_COLOR);
          this.burst(i);
        } else if (v === TILE_SAFE) {
          this.setTile(i, true, SAFE_COLOR);
        }
      }
    }
    // Mắt Thần: tint the tiles this player knows will break (private hint for this round).
    const hints = bridgeHints.get();
    if (hints.round === frame.state.roundIndex && this.hintRound !== hints.round) {
      this.hintRound = hints.round;
      for (const [row, side] of hints.broken) {
        const i = row * PER_ROW + side;
        if (row < this.rows && this.known[i] === 0) this.setTile(i, true, HINT_COLOR);
      }
    }
    this.updateShards(dt);
    this.lights.follow(frame.focus);
  }

  actionForClick(hit: ClickHit, frame: ViewFrame): GameAction | null {
    const me = frame.state.players.get(frame.localId);
    if (!me) return null;
    const nextRow = Math.round(me.score); // score = rows cleared; the next row index
    if (hit.object === this.finish) return nextRow >= this.rows ? { kind: 'JUMP_TILE', side: 0 } : null;
    if (hit.object !== this.tiles || hit.instanceId === undefined) return null;
    const row = Math.floor(hit.instanceId / PER_ROW);
    const side = (hit.instanceId % PER_ROW) as BridgeSide;
    return row === nextRow ? { kind: 'JUMP_TILE', side } : null;
  }

  actionForKey(code: string): GameAction | null {
    if (code === 'KeyA' || code === 'ArrowLeft') return { kind: 'JUMP_TILE', side: 0 };
    if (code === 'KeyS' || code === 'KeyW' || code === 'ArrowDown' || code === 'ArrowUp') return { kind: 'JUMP_TILE', side: 1 };
    if (code === 'KeyD' || code === 'ArrowRight') return { kind: 'JUMP_TILE', side: 2 };
    return null;
  }

  applyQuality(p: QualityPreset): void {
    this.lights.applyQuality(p);
  }

  dispose(): void {
    this.lights.dispose();
  }

  /** Place tiles, beams and the finish platform for `rows` rows. */
  private layout(rows: number): void {
    this.rows = rows;
    this.known.fill(0);
    this.hintRound = -1;
    for (let i = 0; i < TILE_CAPACITY; i++) this.setTile(i, i < rows * PER_ROW, UNKNOWN_COLOR);
    const lastZ = bridgeFinishZ(rows);
    placeBox(this.finish, -5, 5, lastZ - 6, lastZ + 1.4, -1.5, 0);
    placeBox(this.finishLine, -4, 4, lastZ + 1.1, lastZ + 1.4, 0, 0.03);
    for (const beam of this.beams) {
      const x = beam.userData.x as number;
      placeBox(beam, x - 0.12, x + 0.12, lastZ + 1, BRIDGE.startZ - 1.5, -0.6, -0.2);
    }
  }

  private setTile(index: number, visible: boolean, color: number): void {
    const row = Math.floor(index / PER_ROW);
    const side = index % PER_ROW;
    this.pos.set(BRIDGE.tileX[side as BridgeSide], -0.07, bridgeRowZ(row));
    this.scl.setScalar(visible ? 1 : 0);
    this.mtx.compose(this.pos, this.quat, this.scl);
    this.tiles.setMatrixAt(index, this.mtx);
    this.tiles.setColorAt(index, this.color.set(color));
    this.tiles.instanceMatrix.needsUpdate = true;
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
  }

  private burst(index: number): void {
    const row = Math.floor(index / PER_ROW);
    const x = BRIDGE.tileX[(index % PER_ROW) as BridgeSide];
    const z = bridgeRowZ(row);
    for (let k = 0; k < 12; k++) {
      const i = this.nextShard;
      this.nextShard = (this.nextShard + 1) % SHARDS;
      this.shardPos[i * 3] = x + (Math.random() - 0.5) * BRIDGE.tileSize;
      this.shardPos[i * 3 + 1] = 0;
      this.shardPos[i * 3 + 2] = z + (Math.random() - 0.5) * BRIDGE.tileSize;
      this.shardVel[i * 3] = (Math.random() - 0.5) * 3;
      this.shardVel[i * 3 + 1] = Math.random() * 2;
      this.shardVel[i * 3 + 2] = (Math.random() - 0.5) * 3;
      this.shardLife[i] = 1.6;
    }
  }

  private updateShards(dt: number): void {
    let any = false;
    for (let i = 0; i < SHARDS; i++) {
      if (this.shardLife[i]! <= 0) continue;
      any = true;
      this.shardLife[i]! -= dt;
      this.shardVel[i * 3 + 1]! -= 18 * dt;
      this.shardPos[i * 3]! += this.shardVel[i * 3]! * dt;
      this.shardPos[i * 3 + 1]! += this.shardVel[i * 3 + 1]! * dt;
      this.shardPos[i * 3 + 2]! += this.shardVel[i * 3 + 2]! * dt;
      const alive = this.shardLife[i]! > 0;
      this.pos.set(this.shardPos[i * 3]!, this.shardPos[i * 3 + 1]!, this.shardPos[i * 3 + 2]!);
      this.quat.setFromAxisAngle(this.spinAxis, this.shardLife[i]! * 6 + i);
      this.scl.setScalar(alive ? 1 : 0);
      this.mtx.compose(this.pos, this.quat, this.scl);
      this.shards.setMatrixAt(i, this.mtx);
    }
    this.quat.identity();
    if (any) this.shards.instanceMatrix.needsUpdate = true;
  }
}

export function createView(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker): MinigameView {
  return new BridgeView(root, scene, ctx, res);
}
