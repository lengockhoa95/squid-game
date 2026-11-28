// Dev aid: run single rounds of one minigame with bots and print the result lines.
// Usage: node server/scripts/round-check.ts OBSTACLE_RACE [rounds]
import { MAX_PLAYERS, SIM_DT, createRng, type Difficulty, type MinigameId } from '@sp/shared';
import { MatchState } from '@sp/shared/schema';
import { PlayerSim } from '../src/players/PlayerSim.ts';
import { addPlayer } from '../src/players/factory.ts';
import { NPCManager } from '../src/npc/NPCManager.ts';
import { MatchController } from '../src/match/MatchController.ts';

const game = (process.argv[2] ?? 'OBSTACLE_RACE') as MinigameId;
const rounds = Number(process.argv[3] ?? 4);
const diffs: Difficulty[] = ['EASY', 'NORMAL', 'HARD', 'SMART'];
for (let seed = 1; seed <= rounds; seed++) {
  const rng = createRng(seed);
  const state = new MatchState();
  state.phase = 'LOBBY';
  state.noElimination = true;
  state.elementsEnabled = process.env.ELEMENTS !== '0';
  state.cardsEnabled = process.env.CARDS !== '0';
  if (process.env.WAVES) state.castleWaves = Number(process.env.WAVES);
  const sims = new Map<string, PlayerSim>();
  const npcs = new NPCManager(seed * 31);
  NPCManager.planBots(MAX_PLAYERS, diffs, new Set(), rng).forEach((spec, slot) => {
    const { state: ps, sim } = addPlayer(state, sims, { id: spec.id, nickname: `${spec.nickname}(${spec.difficulty})`, slot, joinOrder: slot, isBot: true, difficulty: spec.difficulty });
    npcs.add(spec, ps, sim);
  });
  const c = new MatchController({ state, sims, npcs, rng, rttOf: () => 0, onMatchOver: () => {} }, [game]);
  c.begin();
  let ticks = 0;
  while (state.phase !== 'ROUND_RESULT' && ticks++ < 60 * 1300) c.update(SIM_DT);
  console.log(`seed ${seed} (${state.gameTime.toFixed(0)}s${state.castle ? '' : ''}): ${state.results.map((r) => `${r.nickname}: ${r.detail}`).join(' | ')}`);
}
