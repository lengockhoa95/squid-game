import { describe, expect, it } from 'vitest';
import { LatencyTracker } from './LatencyTracker.ts';

describe('LatencyTracker', () => {
  it('measures RTT from echoed tokens and smooths it', () => {
    const lt = new LatencyTracker();
    lt.receive('a', lt.issue('a', 1000), 1100);
    expect(lt.rttOf('a')).toBe(100);
    lt.receive('a', lt.issue('a', 2000), 2200);
    expect(lt.rttOf('a')).toBeCloseTo(130);
  });

  it('ignores forged or replayed tokens', () => {
    const lt = new LatencyTracker();
    const token = lt.issue('a', 1000);
    lt.receive('a', 999_999, 1050); // forged: claims a tiny RTT
    expect(lt.rttOf('a')).toBe(0);
    lt.receive('a', token, 1300);
    lt.receive('a', token, 5000); // replay ignored
    expect(lt.rttOf('a')).toBe(300);
  });

  it('caps absurd values', () => {
    const lt = new LatencyTracker(500);
    lt.receive('a', lt.issue('a', 0), 10_000);
    expect(lt.rttOf('a')).toBe(500);
  });
});
