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

  it('also end correctly with element mode on and off; bots use their elements', () => {
    let casts = 0;
    for (let seed = 20; seed <= 27; seed++) {
      const on = simulateMatch(seed, ['EASY', 'NORMAL', 'HARD', 'SMART'], undefined, true);
      expect(on.winnerId, `seed ${seed}`).not.toBe('');
      casts += on.casts;
      const off = simulateMatch(seed, ['EASY', 'NORMAL', 'HARD', 'SMART'], undefined, false);
      expect(off.winnerId).not.toBe('');
      expect(off.casts).toBe(0);
    }
    expect(casts).toBeGreaterThan(20);
  }, 120000);

  it('no-elimination mode: nobody is eliminated, all 5 rounds are played, most points wins', async () => {
    for (let seed = 40; seed <= 45; seed++) {
      const r = simulateMatch(seed, ['EASY', 'NORMAL', 'HARD', 'SMART'], undefined, true, true);
      expect(r.rounds, `seed ${seed}`).toBe(5);
      expect(r.eliminatedCount).toBe(0);
      expect(r.winnerId).not.toBe('');
      expect(r.winnerPoints).toBe(Math.max(...r.points));
      // 4 players: 4+3+2+1 = 10 points handed out per round
      expect(r.points.reduce((a, b) => a + b, 0)).toBe(50);
    }
  }, 120000);
});
