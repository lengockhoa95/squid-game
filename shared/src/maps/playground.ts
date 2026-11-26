import { createRng } from '../sim/rng.ts';
import type { Box, SimWorld } from '../sim/kinematics.ts';

export const ARENA_HALF = 28;

export interface ColoredBox extends Box {
  color: number;
}

/** Obstacles of varying height: steppable (≤0.35), jumpable (~1), and walls (>2). */
export const PLAYGROUND_BOXES: readonly ColoredBox[] = [
  { minX: -6, maxX: -2, minZ: -10, maxZ: -6, top: 0.3, color: 0xffd166 },
  { minX: -2, maxX: 2, minZ: -10, maxZ: -6, top: 0.6, color: 0xffb347 },
  { minX: 2, maxX: 6, minZ: -10, maxZ: -6, top: 1.0, color: 0xff8c42 },
  { minX: 10, maxX: 12, minZ: -4, maxZ: 8, top: 2.4, color: 0x9b5de5 },
  { minX: -14, maxX: -9, minZ: 4, maxZ: 9, top: 1.0, color: 0x4ecdc4 },
  { minX: -13, maxX: -10, minZ: 5, maxZ: 8, top: 1.9, color: 0x3aa7a0 },
  { minX: 4, maxX: 7, minZ: 12, maxZ: 15, top: 0.9, color: 0xff6b6b },
  { minX: -4, maxX: -1, minZ: 16, maxZ: 19, top: 1.6, color: 0xf15bb5 },
  { minX: 16, maxX: 22, minZ: -18, maxZ: -15, top: 1.0, color: 0x00bbf9 },
];

export function createPlaygroundWorld(): SimWorld {
  return {
    bounds: { minX: -ARENA_HALF, maxX: ARENA_HALF, minZ: -ARENA_HALF, maxZ: ARENA_HALF },
    boxes: PLAYGROUND_BOXES,
    killY: -10,
  };
}

export interface DecorPlacement {
  x: number;
  z: number;
  scale: number;
  rotY: number;
}

/** Seeded scatter of decorations in a ring outside the arena fence. */
export function scatterDecor(seed: number, count: number, minR: number, maxR: number): DecorPlacement[] {
  const rng = createRng(seed);
  const out: DecorPlacement[] = [];
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const r = minR + rng() * (maxR - minR);
    out.push({ x: Math.cos(angle) * r, z: Math.sin(angle) * r, scale: 0.7 + rng() * 0.8, rotY: rng() * Math.PI * 2 });
  }
  return out;
}

/** Spawn points per lobby slot (0..3), facing -Z (away from the default camera). */
export const PLAYGROUND_SPAWNS: ReadonlyArray<{ x: number; z: number; yaw: number }> = [
  { x: -3, z: 2, yaw: Math.PI },
  { x: -1, z: 2, yaw: Math.PI },
  { x: 1, z: 2, yaw: Math.PI },
  { x: 3, z: 2, yaw: Math.PI },
];
