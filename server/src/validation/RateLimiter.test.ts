import { describe, expect, it } from 'vitest';
import { RateLimiter } from './RateLimiter.ts';

describe('RateLimiter', () => {
  const limits = { move: { perSecond: 10, burst: 5 } };

  it('allows a burst then drops', () => {
    const rl = new RateLimiter(limits, 1000);
    const results = Array.from({ length: 7 }, () => rl.check('a', 'move', 0));
    expect(results.slice(0, 5)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    expect(results[5]).toBe('drop');
  });

  it('refills over time', () => {
    const rl = new RateLimiter(limits, 1000);
    for (let i = 0; i < 5; i++) rl.check('a', 'move', 0);
    expect(rl.check('a', 'move', 0)).toBe('drop');
    expect(rl.check('a', 'move', 100)).toBe('ok'); // 10/s → 1 token per 100ms
  });

  it('tracks clients independently', () => {
    const rl = new RateLimiter(limits, 1000);
    for (let i = 0; i < 6; i++) rl.check('a', 'move', 0);
    expect(rl.check('b', 'move', 0)).toBe('ok');
  });

  it('asks to kick after too many violations', () => {
    const rl = new RateLimiter(limits, 3);
    for (let i = 0; i < 5; i++) rl.check('a', 'move', 0);
    expect(rl.check('a', 'move', 0)).toBe('drop');
    expect(rl.check('a', 'move', 0)).toBe('drop');
    expect(rl.check('a', 'move', 0)).toBe('kick');
  });

  it('drops unknown message types', () => {
    const rl = new RateLimiter(limits, 1000);
    expect(rl.check('a', 'nope', 0)).toBe('drop');
  });

  it('forgets a client', () => {
    const rl = new RateLimiter(limits, 1000);
    for (let i = 0; i < 6; i++) rl.check('a', 'move', 0);
    rl.forget('a');
    expect(rl.check('a', 'move', 0)).toBe('ok');
  });
});
