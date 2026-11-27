import { stepCharacter, type Box, type CharacterState, type SimWorld } from '../sim/kinematics.ts';
import type { StepFn } from '../sim/step.ts';

export const BRIDGE = {
  /** Maximum rows (layout capacity); the actual count per round comes from `bridgeRowsFor`. */
  maxRows: 12,
  rowSpacing: 3.2,
  firstRowZ: 0,
  /** Three tiles per row; exactly one of them breaks. */
  tilesPerRow: 3,
  tileX: [-2.6, 0, 2.6] as const,
  tileSize: 2.2,
  startZ: 4,
  jumpTime: 0.55,
  cooldown: 0.2,
  fallDepth: -14,
} as const;

export const TILE_UNKNOWN = 0;
export const TILE_BROKEN = 1;
export const TILE_SAFE = 2;

export function bridgeRowZ(row: number): number {
  return BRIDGE.firstRowZ - row * BRIDGE.rowSpacing;
}

export type BridgeSide = 0 | 1 | 2;

/**
 * Rows for a round. With one breaking tile out of three, the first player to test a row falls with
 * probability 1/3, so players + 3 rows costs a bit over half the field on average — a long bridge
 * that still usually leaves survivors.
 */
export function bridgeRowsFor(playerCount: number): number {
  return Math.max(5, Math.min(BRIDGE.maxRows, playerCount + 3));
}

/** z of the finish platform edge (one row past the last glass row). */
export function bridgeFinishZ(rows: number): number {
  return bridgeRowZ(rows) - 1;
}

/** Small per-slot offset so players sharing a tile do not overlap exactly. */
export function bridgeSlotOffset(slot: number): { dx: number; dz: number } {
  return { dx: (slot % 2 === 0 ? -0.35 : 0.35), dz: slot < 2 ? -0.3 : 0.3 };
}

export function tileIndex(row: number, side: number): number {
  return row * BRIDGE.tilesPerRow + side;
}

export function isBridgeSide(v: unknown): v is BridgeSide {
  return v === 0 || v === 1 || v === 2;
}

// --- Free-movement bridge: tiles are floating boxes you walk and jump on. ---


export const BRIDGE_PLATFORM_HALF = 5;
const TILE_THICKNESS = 0.14;

export interface BridgeWorld {
  world: SimWorld;
  rows: number;
  /** One box per tile, indexed by tileIndex(row, side). */
  tiles: Box[];
}

export function createBridgeWorld(rows: number): BridgeWorld {
  const h = BRIDGE.tileSize / 2;
  const d = (BRIDGE.tileSize * 0.9) / 2;
  const tiles: Box[] = [];
  for (let row = 0; row < rows; row++) {
    for (let side = 0; side < BRIDGE.tilesPerRow; side++) {
      const x = BRIDGE.tileX[side as BridgeSide];
      const z = bridgeRowZ(row);
      tiles.push({ minX: x - h, maxX: x + h, minZ: z - d, maxZ: z + d, top: 0, bottom: -TILE_THICKNESS });
    }
  }
  const p = BRIDGE_PLATFORM_HALF;
  const lastZ = bridgeFinishZ(rows);
  const start: Box = { minX: -p, maxX: p, minZ: BRIDGE.startZ - 1.6, maxZ: BRIDGE.startZ + 4, top: 0, bottom: -1.5 };
  const finish: Box = { minX: -p, maxX: p, minZ: lastZ - 6, maxZ: lastZ + 1.4, top: 0, bottom: -1.5 };
  return {
    world: { bounds: { minX: -p - 3, maxX: p + 3, minZ: lastZ - 7, maxZ: BRIDGE.startZ + 5 }, boxes: [start, finish, ...tiles], killY: -10, noFloor: true },
    rows,
    tiles,
  };
}

/** A broken tile disappears from the collision world (moved far away so indices stay stable). */
export function breakBridgeTile(bw: BridgeWorld, index: number): void {
  const box = bw.tiles[index];
  if (!box) return;
  box.minX = box.maxX = box.minZ = box.maxZ = 1e6;
}

export function bridgeStep(bw: BridgeWorld): StepFn {
  return (s, intent, dt) => stepCharacter(s, intent, dt, bw.world);
}

/** Tile a grounded character stands on, or -1 (platforms / air). */
export function bridgeTileUnder(bw: BridgeWorld, s: CharacterState): number {
  if (!s.grounded || Math.abs(s.y) > 0.05) return -1;
  for (let i = 0; i < bw.tiles.length; i++) {
    const b = bw.tiles[i]!;
    if (s.x >= b.minX && s.x <= b.maxX && s.z >= b.minZ && s.z <= b.maxZ) return i;
  }
  return -1;
}

export function bridgeSpawn(slot: number): { x: number; z: number; yaw: number } {
  return { x: -3 + slot * 2, z: BRIDGE.startZ + 1.5, yaw: Math.PI };
}
