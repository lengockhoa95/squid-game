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
