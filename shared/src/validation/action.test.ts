import { describe, expect, it } from 'vitest';
import { parseGameAction, parseNpcConfig } from './action.ts';

describe('parseGameAction', () => {
  it('accepts known actions', () => {
    expect(parseGameAction({ kind: 'JUMP_TILE', side: 1 })).toEqual({ kind: 'JUMP_TILE', side: 1 });
    expect(parseGameAction({ kind: 'PULL', extra: 1 })).toEqual({ kind: 'PULL' });
    expect(parseGameAction({ kind: 'REACT' })).toEqual({ kind: 'REACT' });
  });
  it('rejects malformed actions', () => {
    expect(parseGameAction({ kind: 'JUMP_TILE', side: 2 })).toBeNull();
    expect(parseGameAction({ kind: 'WIN_ROUND' })).toBeNull();
    expect(parseGameAction('PULL')).toBeNull();
  });
});

describe('parseNpcConfig', () => {
  it('clamps count and normalizes difficulties', () => {
    expect(parseNpcConfig({ count: 9, difficulties: ['HARD', 'GODLIKE'] })).toEqual({
      count: 3,
      difficulties: ['HARD', 'NORMAL', 'NORMAL', 'NORMAL'],
    });
  });
  it('rejects non-integer counts', () => {
    expect(parseNpcConfig({ count: 1.5 })).toBeNull();
    expect(parseNpcConfig(null)).toBeNull();
  });
});
