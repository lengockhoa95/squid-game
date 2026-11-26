import { describe, expect, it } from 'vitest';
import { simulateMatch } from './simulateMatch.ts';

describe('headless bots-only matches', () => {
  it('always end with exactly one winner and pass through every phase', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const r = simulateMatch(seed, ['EASY', 'NORMAL', 'HARD', 'SMART']);
      expect(r.winnerId, `seed ${seed}`).not.toBe('');
      expect(r.rounds).toBeGreaterThanOrEqual(1);
      expect(r.rounds).toBeLessThanOrEqual(5);
      for (const phase of ['ROUND_INTRO', 'ROUND_COUNTDOWN', 'ROUND_PLAYING', 'ROUND_RESULT', 'MATCH_END']) {
        expect(r.phasesSeen.has(phase), `seed ${seed} phase ${phase}`).toBe(true);
      }
    }
  }, 120000);
});
