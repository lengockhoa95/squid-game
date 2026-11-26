// Bots-only match simulator for balancing: `npm run sim -w server -- [matches] [game]`.
import { MINIGAME_IDS, type MinigameId } from '@sp/shared';
import { simulateMatch } from '../src/match/simulateMatch.ts';

const matches = Number(process.argv[2] ?? 200);
const only = process.argv[3] as MinigameId | undefined;
if (only && !MINIGAME_IDS.includes(only)) throw new Error(`Unknown game ${only}`);

const wins: Record<string, number> = { EASY: 0, NORMAL: 0, HARD: 0, SMART: 0 };
const games: Record<string, number> = {};
let rounds = 0;
let ticks = 0;
const started = Date.now();
for (let seed = 1; seed <= matches; seed++) {
  const r = simulateMatch(seed, ['EASY', 'NORMAL', 'HARD', 'SMART'], only ? [only] : undefined);
  wins[r.winnerDifficulty] = (wins[r.winnerDifficulty] ?? 0) + 1;
  rounds += r.rounds;
  ticks += r.ticks;
  for (const g of r.games) games[g] = (games[g] ?? 0) + 1;
}
const pct = (n: number) => `${((n / matches) * 100).toFixed(1)}%`;
console.log(`${matches} matches in ${((Date.now() - started) / 1000).toFixed(1)}s` + (only ? ` (only ${only})` : ''));
console.log('Win rate:', Object.entries(wins).map(([d, n]) => `${d} ${pct(n)}`).join(' · '));
console.log(`Avg rounds: ${(rounds / matches).toFixed(2)} · avg match length: ${(ticks / matches / 60).toFixed(0)}s (simulated)`);
console.log('Games played:', games);
