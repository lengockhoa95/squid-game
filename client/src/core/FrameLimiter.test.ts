import { describe, expect, it } from 'vitest';
import { FrameLimiter } from './FrameLimiter.ts';

function countRendered(cap: 30 | 60, displayHz: number, seconds: number): number {
  const limiter = new FrameLimiter(cap);
  const frameMs = 1000 / displayHz;
  let rendered = 0;
  for (let i = 0; i < displayHz * seconds; i++) if (limiter.shouldRender(i * frameMs)) rendered++;
  return rendered;
}

describe('FrameLimiter', () => {
  it('renders every frame of a 60Hz display at cap 60', () => {
    expect(countRendered(60, 60, 2)).toBe(120);
  });

  it('renders half the frames of a 60Hz display at cap 30', () => {
    expect(countRendered(30, 60, 2)).toBe(60);
  });

  it('averages ~60fps on a 144Hz display at cap 60', () => {
    const n = countRendered(60, 144, 2);
    expect(n).toBeGreaterThanOrEqual(118);
    expect(n).toBeLessThanOrEqual(122);
  });

  it('does not burst after a long stall', () => {
    const limiter = new FrameLimiter(60);
    limiter.shouldRender(0);
    expect(limiter.shouldRender(1000)).toBe(true);
    expect(limiter.shouldRender(1001)).toBe(false);
  });

  it('applies a new cap', () => {
    const limiter = new FrameLimiter(60);
    limiter.setCap(30);
    expect(limiter.shouldRender(0)).toBe(true);
    expect(limiter.shouldRender(16.7)).toBe(false);
    expect(limiter.shouldRender(33.4)).toBe(true);
  });
});
