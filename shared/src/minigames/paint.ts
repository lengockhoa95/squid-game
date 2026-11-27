import { staticWorldStep, type StepFn } from '../sim/step.ts';
import type { Box, SimWorld } from '../sim/kinematics.ts';

/** Sơn Lãnh Thổ: paint the floor your colour by walking on it; most cells when time runs out wins. */
export const PAINT = {
  cells: 24,
  cell: 1.5,
} as const;

export const PAINT_HALF = (PAINT.cells * PAINT.cell) / 2;
export const PAINT_CELL_COUNT = PAINT.cells * PAINT.cells;

/** Crates to run around. */
export const PAINT_CRATES: ReadonlyArray<{ x: number; z: number; w: number; d: number }> = [
  { x: -8, z: -8, w: 2.4, d: 2.4 }, { x: 8, z: 8, w: 2.4, d: 2.4 }, { x: 8, z: -8, w: 1.6, d: 4 },
  { x: -8, z: 8, w: 4, d: 1.6 }, { x: 0, z: 0, w: 3, d: 3 },
];

export function paintCellAt(x: number, z: number): number {
  const c = Math.floor((x + PAINT_HALF) / PAINT.cell);
  const r = Math.floor((z + PAINT_HALF) / PAINT.cell);
  if (c < 0 || r < 0 || c >= PAINT.cells || r >= PAINT.cells) return -1;
  return r * PAINT.cells + c;
}

export function paintCellCenter(i: number): { x: number; z: number } {
  const r = Math.floor(i / PAINT.cells);
  const c = i % PAINT.cells;
  return { x: -PAINT_HALF + (c + 0.5) * PAINT.cell, z: -PAINT_HALF + (r + 0.5) * PAINT.cell };
}

export function createPaintWorld(): SimWorld {
  const boxes: Box[] = PAINT_CRATES.map((c) => ({ minX: c.x - c.w / 2, maxX: c.x + c.w / 2, minZ: c.z - c.d / 2, maxZ: c.z + c.d / 2, top: 1.4 }));
  return { bounds: { minX: -PAINT_HALF, maxX: PAINT_HALF, minZ: -PAINT_HALF, maxZ: PAINT_HALF }, boxes, killY: -10 };
}

export function paintStep(world: SimWorld): StepFn {
  return staticWorldStep(world);
}

/** Start in the four corners. */
export function paintSpawn(slot: number): { x: number; z: number; yaw: number } {
  const sx = slot % 2 === 0 ? -1 : 1;
  const sz = slot < 2 ? -1 : 1;
  const d = PAINT_HALF - 2.5;
  return { x: sx * d, z: sz * d, yaw: Math.atan2(-sx, -sz) };
}
