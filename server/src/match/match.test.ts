import { describe, expect, it } from 'vitest';
import { createRng, MINIGAME_IDS, type MinigameId } from '@sp/shared';
import { pickNextGame, planRoundCount } from './RoundScheduler.ts';
import { decideEliminations } from './EliminationPolicy.ts';
import { canTransition, assertTransition } from './MatchStateMachine.ts';

describe('RoundScheduler', () => {
  it('plans 3 to 5 rounds', () => {
    const rng = createRng(3);
    const counts = new Set(Array.from({ length: 200 }, () => planRoundCount(rng)));
    expect([...counts].sort()).toEqual([3, 4, 5]);
  });

  it('never repeats the previous game and respects team constraints', () => {
    const rng = createRng(9);
    let prev: MinigameId | null = null;
    const history: MinigameId[] = [];
    for (let i = 0; i < 500; i++) {
      const alive = 2 + (i % 3); // 2, 3, 4
      const game = pickNextGame(rng, alive, history);
      expect(game).not.toBe(prev);
      if (alive % 2 === 1) expect(game).not.toBe('TUG_OF_WAR');
      history.push(game);
      prev = game;
    }
  });

  it('prefers games not played yet in this match', () => {
    const rng = createRng(1);
    const history: MinigameId[] = [];
    for (let i = 0; i < 4; i++) history.push(pickNextGame(rng, 4, history));
    expect(new Set(history).size).toBe(4);
    expect(MINIGAME_IDS).toEqual(expect.arrayContaining(history));
  });
});

describe('EliminationPolicy', () => {
  const alive = ['a', 'b', 'c', 'd'];
  const ranking = ['a', 'b', 'c', 'd'];

  it('eliminates players who failed', () => {
    expect(decideEliminations({ alive, ranking, passed: new Set(['a', 'b']), roundsLeftAfter: 2 })).toEqual(['c', 'd']);
  });

  it('keeps two players before the final round, sparing the best-ranked failures', () => {
    expect(decideEliminations({ alive, ranking, passed: new Set(['a']), roundsLeftAfter: 2 })).toEqual(['c', 'd']);
    expect(decideEliminations({ alive, ranking, passed: new Set(), roundsLeftAfter: 2 })).toEqual(['c', 'd']);
  });

  it('with two players left, a non-final round can still decide the winner', () => {
    expect(decideEliminations({ alive: ['a', 'b'], ranking: ['a', 'b'], passed: new Set(['a']), roundsLeftAfter: 2 })).toEqual(['b']);
  });

  it('allows a round without eliminations when there are enough rounds left', () => {
    expect(decideEliminations({ alive, ranking, passed: new Set(alive), roundsLeftAfter: 3 })).toEqual([]);
  });

  it('forces out the last-ranked player when rounds are running out', () => {
    expect(decideEliminations({ alive, ranking, passed: new Set(alive), roundsLeftAfter: 2 })).toEqual(['d']);
  });

  it('final round keeps exactly one winner', () => {
    expect(decideEliminations({ alive: ['a', 'b', 'c'], ranking: ['b', 'a', 'c'], passed: new Set(['a', 'b', 'c']), roundsLeftAfter: 0 })).toEqual(['a', 'c']);
  });

  it('never eliminates everyone', () => {
    const out = decideEliminations({ alive: ['x', 'y'], ranking: ['y', 'x'], passed: new Set(), roundsLeftAfter: 1 });
    expect(out).toEqual(['x']);
  });
});

describe('MatchStateMachine', () => {
  it('allows the designed flow', () => {
    expect(canTransition('LOBBY', 'ROUND_INTRO')).toBe(true);
    expect(canTransition('ROUND_INTRO', 'ROUND_COUNTDOWN')).toBe(true);
    expect(canTransition('ROUND_COUNTDOWN', 'ROUND_PLAYING')).toBe(true);
    expect(canTransition('ROUND_PLAYING', 'ROUND_RESULT')).toBe(true);
    expect(canTransition('ROUND_RESULT', 'ROUND_INTRO')).toBe(true);
    expect(canTransition('ROUND_RESULT', 'MATCH_END')).toBe(true);
    expect(canTransition('MATCH_END', 'LOBBY')).toBe(true);
  });

  it('rejects skipping phases', () => {
    expect(canTransition('LOBBY', 'ROUND_PLAYING')).toBe(false);
    expect(canTransition('ROUND_PLAYING', 'ROUND_INTRO')).toBe(false);
    expect(() => assertTransition('ROUND_INTRO', 'MATCH_END')).toThrow();
  });

  it('any in-match phase can abort to the lobby', () => {
    for (const p of ['ROUND_INTRO', 'ROUND_COUNTDOWN', 'ROUND_PLAYING', 'ROUND_RESULT'] as const) {
      expect(canTransition(p, 'LOBBY')).toBe(true);
    }
  });
});
