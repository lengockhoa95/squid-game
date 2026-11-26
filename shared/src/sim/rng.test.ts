import { describe, expect, it } from 'vitest';
import { createRng } from './rng.ts';

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });

  it('differs between seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const sa = Array.from({ length: 5 }, a);
    const sb = Array.from({ length: 5 }, b);
    expect(sa).not.toEqual(sb);
  });

  it('stays within [0, 1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 10000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
