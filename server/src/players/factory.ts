import { PLAYGROUND_SPAWNS, type Difficulty } from '@sp/shared';
import { PlayerState, type MatchState } from '@sp/shared/schema';
import { PlayerSim } from './PlayerSim.ts';
import { syncPlayerFromSim } from './sync.ts';

export interface NewPlayer {
  id: string;
  nickname: string;
  slot: number;
  joinOrder: number;
  isBot: boolean;
  difficulty?: Difficulty;
}

/** Create the synced PlayerState + server simulation for a human or bot and register both. */
export function addPlayer(state: MatchState, sims: Map<string, PlayerSim>, np: NewPlayer): { state: PlayerState; sim: PlayerSim } {
  const spawn = PLAYGROUND_SPAWNS[np.slot] ?? PLAYGROUND_SPAWNS[0]!;
  const p = new PlayerState();
  p.id = np.id;
  p.nickname = np.nickname;
  p.slot = np.slot;
  p.joinOrder = np.joinOrder;
  p.isBot = np.isBot;
  p.difficulty = np.difficulty ?? '';
  p.ready = np.isBot;
  p.connected = true;
  p.alive = true;
  p.roundState = 'ACTIVE';
  state.players.set(np.id, p);
  const sim = new PlayerSim(spawn.x, spawn.z, spawn.yaw);
  sims.set(np.id, sim);
  syncPlayerFromSim(p, sim);
  return { state: p, sim };
}
