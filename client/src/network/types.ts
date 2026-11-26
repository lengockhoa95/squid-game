import type { MoveBatch, Phase } from '@sp/shared';

/** Read-only view of a synced player (structurally matches the PlayerState schema). */
export interface NetPlayer {
  readonly id: string;
  readonly nickname: string;
  readonly slot: number;
  readonly isBot: boolean;
  readonly ready: boolean;
  readonly connected: boolean;
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

/** What a networked scene needs from the session — keeps scenes testable and SDK-agnostic. */
export interface MatchNetAdapter {
  readonly localId: string;
  getPhase(): Phase;
  forEachPlayer(cb: (p: NetPlayer) => void): void;
  /** Fires once per received state patch. Returns an unsubscribe function. */
  onSnapshot(cb: () => void): () => void;
  sendMove(batch: MoveBatch): void;
}
