import type { GameAction, MoveBatch, Phase } from '@sp/shared';
import type { MatchState } from '@sp/shared/schema';

/** Read-only view of a synced player (structurally matches the PlayerState schema). */
export interface NetPlayer {
  readonly id: string;
  readonly nickname: string;
  readonly slot: number;
  readonly isBot: boolean;
  readonly ready: boolean;
  readonly connected: boolean;
  readonly alive: boolean;
  readonly roundState: string;
  readonly team: number;
  readonly score: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  readonly yaw: number;
  readonly grounded: boolean;
  readonly lastSeq: number;
}

/** What networked scenes/HUDs need from the session — keeps them SDK-agnostic. */
export interface MatchNetAdapter {
  readonly localId: string;
  getPhase(): Phase;
  /** Live synced state (read-only by convention). Null after leaving. */
  getState(): MatchState | null;
  forEachPlayer(cb: (p: NetPlayer) => void): void;
  /** Fires once per received state patch. Returns an unsubscribe function. */
  onSnapshot(cb: () => void): () => void;
  sendMove(batch: MoveBatch): void;
  sendAction(action: GameAction): void;
  /** Estimated server game time (seconds) now, extrapolated from the last patch. */
  gameTimeNow(): number;
}
