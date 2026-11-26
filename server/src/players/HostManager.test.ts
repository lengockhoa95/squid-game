import { describe, expect, it } from 'vitest';
import { pickNextHost, freeSlot } from './HostManager.ts';

const p = (id: string, joinOrder: number, extra: Partial<{ isBot: boolean; connected: boolean; slot: number }> = {}) => ({
  id, joinOrder, isBot: false, connected: true, slot: joinOrder, ...extra,
});

describe('pickNextHost', () => {
  it('picks the earliest-joined connected human', () => {
    expect(pickNextHost([p('c', 3), p('b', 2), p('d', 4)])).toBe('b');
  });
  it('skips bots and prefers connected humans', () => {
    expect(pickNextHost([p('bot', 1, { isBot: true }), p('dc', 2, { connected: false }), p('ok', 3)])).toBe('ok');
  });
  it('falls back to a disconnected human', () => {
    expect(pickNextHost([p('dc', 2, { connected: false })])).toBe('dc');
  });
  it('returns empty string when nobody qualifies', () => {
    expect(pickNextHost([p('bot', 1, { isBot: true })])).toBe('');
  });
});

describe('freeSlot', () => {
  it('returns the lowest unused slot', () => {
    expect(freeSlot([p('a', 0, { slot: 0 }), p('b', 1, { slot: 2 })], 4)).toBe(1);
    expect(freeSlot([], 4)).toBe(0);
  });
  it('returns -1 when full', () => {
    expect(freeSlot([0, 1, 2, 3].map((s) => p(String(s), s, { slot: s })), 4)).toBe(-1);
  });
});
