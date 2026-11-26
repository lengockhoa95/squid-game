import { describe, expect, it } from 'vitest';
import { generateRoomCode, normalizeRoomCode } from './roomCode.ts';
import { sanitizeNickname } from './nickname.ts';
import { parseMoveBatch } from './moveBatch.ts';
import { createRng } from '../sim/rng.ts';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../protocol/constants.ts';

describe('room codes', () => {
  it('generates codes from the unambiguous alphabet', () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode(rng);
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
    }
  });

  it('normalizes user input (case, spaces) and rejects invalid codes', () => {
    expect(normalizeRoomCode(' k7xmp ')).toBe('K7XMP');
    expect(normalizeRoomCode('K7X')).toBeNull();
    expect(normalizeRoomCode('K7XM0')).toBeNull(); // 0 is not in the alphabet
    expect(normalizeRoomCode('K7XMPQ')).toBeNull();
  });
});

describe('sanitizeNickname', () => {
  it('trims, collapses whitespace and limits length', () => {
    expect(sanitizeNickname('  An   Bình  ', 'X')).toBe('An Bình');
    expect(sanitizeNickname('a'.repeat(40), 'X')).toHaveLength(16);
  });
  it('strips control and markup characters', () => {
    expect(sanitizeNickname('<b>Hi</b>\u0000', 'X')).toBe('bHi/b');
  });
  it('falls back when empty or not a string', () => {
    expect(sanitizeNickname('   ', 'Người chơi 1')).toBe('Người chơi 1');
    expect(sanitizeNickname(42, 'Người chơi 2')).toBe('Người chơi 2');
  });
});

describe('parseMoveBatch', () => {
  it('accepts a well-formed batch', () => {
    expect(parseMoveBatch({ s: 5, i: [1, 0, 0, 0.5, 0.5, 1] })).toEqual({ s: 5, i: [1, 0, 0, 0.5, 0.5, 1] });
  });
  it('rejects malformed payloads', () => {
    expect(parseMoveBatch(null)).toBeNull();
    expect(parseMoveBatch({ s: -1, i: [0, 0, 0] })).toBeNull();
    expect(parseMoveBatch({ s: 1.5, i: [0, 0, 0] })).toBeNull();
    expect(parseMoveBatch({ s: 1, i: [0, 0] })).toBeNull();
    expect(parseMoveBatch({ s: 1, i: [] })).toBeNull();
    expect(parseMoveBatch({ s: 1, i: [Number.NaN, 0, 0] })).toBeNull();
    expect(parseMoveBatch({ s: 1, i: [0, 0, 2] })).toBeNull();
    expect(parseMoveBatch({ s: 1, i: new Array(30).fill(0) })).toBeNull();
    expect(parseMoveBatch({ s: 1, i: 'x' })).toBeNull();
  });
  it('clamps direction magnitude to 1', () => {
    const b = parseMoveBatch({ s: 1, i: [30, 40, 0] });
    expect(b?.i[0]).toBeCloseTo(0.6);
    expect(b?.i[1]).toBeCloseTo(0.8);
  });
});
