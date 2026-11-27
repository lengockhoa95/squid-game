import { stepCharacter, type Box, type SimWorld } from '../sim/kinematics.ts';
import type { StepFn } from '../sim/step.ts';

/** Sàn Sụp: stacked tile floors; tiles you stand on crack and drop. Falling below the last floor = out. */
export const COLLAPSE = {
  cols: 16,
  rows: 16,
  layers: 3,
  tile: 2,
  layerGap: 6,
  thickness: 0.4,
  /** Seconds between a tile being stepped on and it dropping. */
  crackSeconds: 0.8,
  killY: -20,
} as const;

export const TILE_SOLID = 0;
export const TILE_CRACKING = 1;
export const TILE_GONE = 2;

const HALF_W = (COLLAPSE.cols * COLLAPSE.tile) / 2;
const HALF_D = (COLLAPSE.rows * COLLAPSE.tile) / 2;
export const COLLAPSE_TILE_COUNT = COLLAPSE.cols * COLLAPSE.rows * COLLAPSE.layers;

export function layerTop(layer: number): number {
  return -layer * COLLAPSE.layerGap;
}

export function collapseIndex(layer: number, row: number, col: number): number {
  return (layer * COLLAPSE.rows + row) * COLLAPSE.cols + col;
}

/** Layer / row / col of a tile index. */
export function collapseCoords(index: number): { layer: number; row: number; col: number } {
  const perLayer = COLLAPSE.cols * COLLAPSE.rows;
  const layer = Math.floor(index / perLayer);
  const rest = index % perLayer;
  return { layer, row: Math.floor(rest / COLLAPSE.cols), col: rest % COLLAPSE.cols };
}

export function tileCenter(index: number): { x: number; y: number; z: number } {
  const { layer, row, col } = collapseCoords(index);
  return { x: -HALF_W + (col + 0.5) * COLLAPSE.tile, y: layerTop(layer), z: -HALF_D + (row + 0.5) * COLLAPSE.tile };
}

/** Tile under a point standing on a layer (by height), or -1. */
export function tileAt(x: number, y: number, z: number): number {
  const layer = Math.round(-y / COLLAPSE.layerGap);
  if (layer < 0 || layer >= COLLAPSE.layers || Math.abs(y - layerTop(layer)) > 0.3) return -1;
  const col = Math.floor((x + HALF_W) / COLLAPSE.tile);
  const row = Math.floor((z + HALF_D) / COLLAPSE.tile);
  if (col < 0 || col >= COLLAPSE.cols || row < 0 || row >= COLLAPSE.rows) return -1;
  return collapseIndex(layer, row, col);
}

export interface CollapseWorld {
  world: SimWorld;
  /** One box per tile, same index as the tile state array. */
  tiles: Box[];
}

export function createCollapseWorld(): CollapseWorld {
  const tiles: Box[] = [];
  for (let i = 0; i < COLLAPSE_TILE_COUNT; i++) {
    const c = tileCenter(i);
    const h = COLLAPSE.tile / 2;
    tiles.push({ minX: c.x - h, maxX: c.x + h, minZ: c.z - h, maxZ: c.z + h, top: c.y, bottom: c.y - COLLAPSE.thickness });
  }
  const margin = 8;
  return {
    world: { bounds: { minX: -HALF_W - margin, maxX: HALF_W + margin, minZ: -HALF_D - margin, maxZ: HALF_D + margin }, boxes: tiles, killY: COLLAPSE.killY, noFloor: true },
    tiles,
  };
}

/** Remove a dropped tile from the collision world (moved far away so indices stay stable). */
export function dropTile(cw: CollapseWorld, index: number): void {
  const box = cw.tiles[index];
  if (!box) return;
  box.minX = box.maxX = 1e6;
  box.minZ = box.maxZ = 1e6;
}

export function collapseStep(cw: CollapseWorld): StepFn {
  return (s, intent, dt) => stepCharacter(s, intent, dt, cw.world);
}

/** Spawn on the top layer, spread around the centre. */
export function collapseSpawn(slot: number): { x: number; z: number; yaw: number } {
  const a = (slot / 4) * Math.PI * 2 + Math.PI / 4;
  return { x: Math.cos(a) * 5, z: Math.sin(a) * 5, yaw: a + Math.PI };
}
