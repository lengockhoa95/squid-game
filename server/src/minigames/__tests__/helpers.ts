import { createRng } from '@sp/shared';
import { MatchState } from '@sp/shared/schema';
import { PlayerSim } from '../../players/PlayerSim.ts';
import { addPlayer } from '../../players/factory.ts';
import type { GamePlayer, MinigameContext, ServerMinigame } from '../framework/types.ts';

/** Build a minimal round context with `n` players (no room, no bots). */
export function makeContext(n: number, seed = 1, rtt = 0): { ctx: MinigameContext; players: GamePlayer[]; match: MatchState } {
  const match = new MatchState();
  const sims = new Map<string, PlayerSim>();
  const players: GamePlayer[] = [];
  for (let i = 0; i < n; i++) {
    const { state, sim } = addPlayer(match, sims, { id: `p${i}`, nickname: `P${i}`, slot: i, joinOrder: i, isBot: false });
    players.push({ id: state.id, state, sim });
  }
  return { ctx: { match, players, rng: createRng(seed), rttOf: () => rtt }, players, match };
}

/** Advance a game by `seconds` at 60Hz, ticking movement sims for active players. */
export function run(game: ServerMinigame, players: GamePlayer[], startTime: number, seconds: number): number {
  const dt = 1 / 60;
  let t = startTime;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    t += dt;
    if (game.step) for (const p of players) if (p.state.roundState === 'ACTIVE') p.sim.tick(game.step, t);
    game.update(dt, t);
    if (game.step) {
      for (const p of players) {
        p.state.x = p.sim.state.x;
        p.state.z = p.sim.state.z;
      }
    }
  }
  return t;
}

/** Queue `seconds` of identical movement input. */
export function hold(p: GamePlayer, dirX: number, dirZ: number, seconds: number): void {
  const n = Math.round(seconds * 60);
  for (let k = 0; k < n; k += 6) {
    const count = Math.min(6, n - k);
    p.sim.enqueue({ s: p.sim.nextSeq, i: Array.from({ length: count }, () => [dirX, dirZ, 0]).flat() });
  }
}
