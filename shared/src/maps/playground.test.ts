import { describe, expect, it } from 'vitest';
import { ARENA_HALF, PLAYGROUND_BOXES, scatterDecor } from './playground.ts';

describe('playground layout', () => {
  it('keeps every obstacle inside the arena', () => {
    for (const b of PLAYGROUND_BOXES) {
      expect(b.minX).toBeGreaterThanOrEqual(-ARENA_HALF);
      expect(b.maxX).toBeLessThanOrEqual(ARENA_HALF);
      expect(b.minZ).toBeGreaterThanOrEqual(-ARENA_HALF);
      expect(b.maxZ).toBeLessThanOrEqual(ARENA_HALF);
      expect(b.maxX).toBeGreaterThan(b.minX);
      expect(b.maxZ).toBeGreaterThan(b.minZ);
    }
  });

  it('keeps the spawn area (origin) clear', () => {
    for (const b of PLAYGROUND_BOXES) {
      const inside = 0 >= b.minX - 1 && 0 <= b.maxX + 1 && 0 >= b.minZ - 1 && 0 <= b.maxZ + 1;
      expect(inside).toBe(false);
    }
  });

  it('scatters decor deterministically outside the arena', () => {
    const a = scatterDecor(3, 20, ARENA_HALF + 4, ARENA_HALF + 20);
    const b = scatterDecor(3, 20, ARENA_HALF + 4, ARENA_HALF + 20);
    expect(a).toEqual(b);
    for (const d of a) expect(Math.hypot(d.x, d.z)).toBeGreaterThan(ARENA_HALF + 3.9);
  });
});
