import type { CardId, ElementId, GameAction, MoveBatch, Phase } from '@sp/shared';
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
  readonly element: string;
  readonly elementReadyAt: number;
  readonly stunUntil: number;
  readonly hasteUntil: number;
  readonly blindUntil: number;
  readonly points: number;
  readonly cards: string;
  readonly cardOffer: string;
  readonly lives: number;
  readonly airJumps: number;
  readonly character: string;
  readonly moveMul: number;
  readonly weapon: string;
  readonly downed: boolean;
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
  /** Use the chosen element aimed at a ground point (self/auto elements ignore the point). */
  sendCast(x: number, z: number): void;
  pickElement(element: ElementId): void;
  pickCard(card: CardId): void;
  /** Combat games: attack with the weapon in hand. */
  sendAttack(aimYaw: number): void;
  /** Thủ Thành: pick a weapon card between waves. */
  pickPerk(perk: string): void;
  /** Estimated server game time (seconds) now, extrapolated from the last patch. */
  gameTimeNow(): number;
}
