import { describe, expect, it } from 'vitest';
import { RemoteInterpolator, createSample } from './RemoteInterpolator.ts';

describe('RemoteInterpolator', () => {
  it('interpolates position between the surrounding snapshots', () => {
    const interp = new RemoteInterpolator();
    interp.push(0, 0, 0, 0, 0, 0, true);
    interp.push(100, 10, 2, -4, 0, 5, false);
    const out = createSample();
    expect(interp.sample(50, out)).toBe(true);
    expect(out.x).toBeCloseTo(5);
    expect(out.y).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(-2);
    expect(out.speed).toBeCloseTo(2.5);
  });

  it('clamps to the oldest/newest snapshot instead of extrapolating', () => {
    const interp = new RemoteInterpolator();
    interp.push(100, 1, 0, 0, 0, 0, true);
    interp.push(200, 2, 0, 0, 0, 0, true);
    const out = createSample();
    interp.sample(0, out);
    expect(out.x).toBe(1);
    interp.sample(999, out);
    expect(out.x).toBe(2);
  });

  it('interpolates yaw along the shortest arc', () => {
    const interp = new RemoteInterpolator();
    interp.push(0, 0, 0, 0, Math.PI - 0.1, 0, true);
    interp.push(100, 0, 0, 0, -Math.PI + 0.1, 0, true);
    const out = createSample();
    interp.sample(50, out);
    expect(Math.abs(Math.abs(out.yaw) - Math.PI)).toBeLessThan(1e-6);
  });

  it('returns false when empty and keeps working past buffer capacity', () => {
    const interp = new RemoteInterpolator();
    const out = createSample();
    expect(interp.sample(0, out)).toBe(false);
    for (let i = 0; i < 100; i++) interp.push(i * 50, i, 0, 0, 0, 0, true);
    interp.sample(99 * 50 - 25, out);
    expect(out.x).toBeCloseTo(98.5);
  });
});
