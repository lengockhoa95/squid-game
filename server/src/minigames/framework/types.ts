import type { GameAction, MinigameId, StepFn } from '@sp/shared';
import type { MatchState, PlayerState } from '@sp/shared/schema';
import type { PlayerSim } from '../../players/PlayerSim.ts';

export interface GamePlayer {
  readonly id: string;
  readonly state: PlayerState;
  readonly sim: PlayerSim;
}

export interface MinigameContext {
  readonly match: MatchState;
  /** Participants of this round (alive at round start), in slot order. */
  readonly players: readonly GamePlayer[];
  readonly rng: () => number;
  /** Measured round-trip time (ms) for latency compensation; 0 for bots. */
  rttOf(id: string): number;
}

export interface RoundOutcome {
  /** Participant ids, best first. */
  ranking: string[];
  /** Ids that met the round's win condition. */
  passed: Set<string>;
  /** Short per-player explanation shown on the result screen. */
  details: Map<string, string>;
}

/**
 * Server-side minigame. The match controller drives the lifecycle:
 * initialize → start → (handlePlayerInput | update)* → finish → dispose.
 * The server alone decides outcomes; clients only send inputs.
 */
export interface ServerMinigame {
  readonly id: MinigameId;
  /** Movement games return the step function used for player simulation; null if players do not walk. */
  readonly step: StepFn | null;
  initialize(ctx: MinigameContext): void;
  start(): void;
  handlePlayerInput(playerId: string, action: GameAction, gameTime: number): void;
  /** Called every tick while playing, after movement simulation. */
  update(dt: number, gameTime: number): void;
  /** Public synced sub-state (what clients and NPCs are allowed to see). */
  getState(): unknown;
  isFinished(): boolean;
  finish(): RoundOutcome;
  dispose(): void;
}

/** Shared helpers for ranking: finished players by time, then others by a progress score. */
export function rankPlayers(
  players: readonly GamePlayer[],
  finishTimes: ReadonlyMap<string, number>,
  progress: (p: GamePlayer) => number,
): string[] {
  return [...players]
    .sort((a, b) => {
      const fa = finishTimes.get(a.id);
      const fb = finishTimes.get(b.id);
      if (fa !== undefined && fb !== undefined) return fa - fb;
      if (fa !== undefined) return -1;
      if (fb !== undefined) return 1;
      return progress(b) - progress(a);
    })
    .map((p) => p.id);
}
