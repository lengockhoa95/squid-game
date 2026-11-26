import { MAX_PLAYERS, SIM_DT, createRng, type Difficulty, type MinigameId } from '@sp/shared';
import { MatchState } from '@sp/shared/schema';
import { PlayerSim } from '../players/PlayerSim.ts';
import { addPlayer } from '../players/factory.ts';
import { NPCManager } from '../npc/NPCManager.ts';
import { MatchController } from './MatchController.ts';

export interface SimulatedMatch {
  winnerId: string;
  winnerDifficulty: string;
  rounds: number;
  games: readonly MinigameId[];
  ticks: number;
  phasesSeen: Set<string>;
}

const MAX_TICKS = 60 * 60 * 15; // 15 simulated minutes: a match must end well before this

/** Run a full bots-only match headless at the fixed simulation step. Throws if it never ends. */
export function simulateMatch(seed: number, difficulties: readonly Difficulty[], available?: MinigameId[]): SimulatedMatch {
  const rng = createRng(seed);
  const state = new MatchState();
  state.phase = 'LOBBY';
  const sims = new Map<string, PlayerSim>();
  const npcs = new NPCManager(seed * 7919);
  const specs = NPCManager.planBots(Math.min(MAX_PLAYERS, difficulties.length), difficulties, new Set(), rng);
  specs.forEach((spec, slot) => {
    const { state: ps, sim } = addPlayer(state, sims, { id: spec.id, nickname: spec.nickname, slot, joinOrder: slot + 1, isBot: true, difficulty: spec.difficulty });
    npcs.add(spec, ps, sim);
  });

  let over = false;
  const controller = new MatchController(
    { state, sims, npcs, rng, rttOf: () => 0, onMatchOver: () => { over = true; } },
    available,
  );
  const phasesSeen = new Set<string>();
  controller.begin();
  let ticks = 0;
  while (!over) {
    controller.update(SIM_DT);
    phasesSeen.add(state.phase);
    if (++ticks > MAX_TICKS) throw new Error(`Match did not finish (phase ${state.phase}, round ${state.roundIndex})`);
  }
  const winner = state.players.get(state.winnerId);
  return {
    winnerId: state.winnerId,
    winnerDifficulty: winner?.difficulty ?? '',
    rounds: state.roundIndex,
    games: controller.playedGames,
    ticks,
    phasesSeen,
  };
}
