export const BRIDGE = {
  /** Maximum rows (layout capacity); the actual count per round comes from `bridgeRowsFor`. */
  maxRows: 8,
  rowSpacing: 3.2,
  firstRowZ: 0,
  tileX: [-1.5, 1.5] as const,
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

/**
 * Rows for a round: each unknown row costs about half a player on average, so players + 1 rows
 * eliminates roughly half the field — enough tension without wiping everyone out.
 */
export function bridgeRowsFor(playerCount: number): number {
  return Math.max(3, Math.min(BRIDGE.maxRows, playerCount + 1));
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
  return row * 2 + side;
}
