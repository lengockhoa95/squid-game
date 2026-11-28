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
  /** Card "Mạng Phụ": spend a life to cancel a failure. True = the player is saved. */
  tryRescue?(id: string): boolean;
  /** Draw a short visual effect (slash, shot…) for everyone; (x2, z2) is an optional second point. */
  flash?(kind: string, ownerId: string, x: number, z: number, x2?: number, z2?: number): void;
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
  /** Movement games: playable area (element clones stay inside it). */
  readonly bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Non-movement games that support the SWAP element: exchange two players' progress. */
  swapPlayers?(a: string, b: string): boolean;
  /** Combat games: the player attacks with their weapon (facing direction). */
  handleAttack?(id: string, gameTime: number, aimYaw?: number): void;
  /**
   * PvE games: an element cast handled by the game (e.g. lightning on monsters). Return true/false
   * when handled (cast used / rejected), undefined to fall back to the normal element effect.
   */
  elementCast?(element: string, casterId: string, x: number, z: number, t: number): boolean | undefined;
  /** PvE games: where a bot should aim its element (null = nothing worth it). */
  elementTarget?(botId: string): { x: number; z: number } | null;
  /** In-round choice (Thủ Thành weapon card after a wave). */
  handlePick?(id: string, choice: string): void;
  /** Overrides the catalog time limit (read after initialize). */
  readonly timeLimit?: number;
  /** Card "Mắt Thần" (bridge): reveal the breaking tile of the first `rows` rows to this player. */
  revealFor?(id: string, rows: number): Array<[row: number, side: number]>;
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
