import type { Difficulty } from '../config/npc.ts';

/** Client → server and server → client message types. */
export const MSG = {
  MOVE: 'move',
  ACTION: 'action',
  READY: 'ready',
  START: 'start',
  NPC_CONFIG: 'npcConfig',
  BACK_TO_LOBBY: 'backToLobby',
  ERROR: 'error',
  /** Server-initiated latency probe: server sends {t}, client echoes it back unchanged. */
  PING: 'ping',
  PONG: 'pong',
  /** Element mode: pick an element during the round intro, cast it while playing, host toggles the mode. */
  PICK_ELEMENT: 'pickElement',
  CAST: 'cast',
  ELEMENTS_TOGGLE: 'elementsToggle',
  /** Host toggles "no elimination" mode: everyone plays every round and scores points. */
  NO_ELIMINATION_TOGGLE: 'noEliminationToggle',
  CARDS_TOGGLE: 'cardsToggle',
  /** Host ticks a minigame / element in or out of the pool: {id, enabled}. */
  GAME_TOGGLE: 'gameToggle',
  ELEMENT_TOGGLE: 'elementToggle',
  /** Choose one card of your offer during the round result. */
  PICK_CARD: 'pickCard',
  /** Server → one client: Mắt Thần bridge hints {rows: [[row, brokenSide], ...]}. */
  BRIDGE_HINT: 'bridgeHint',
} as const;

export type Phase = 'LOBBY' | 'ROUND_INTRO' | 'ROUND_COUNTDOWN' | 'ROUND_PLAYING' | 'ROUND_RESULT' | 'MATCH_END';
export const IN_MATCH_PHASES: readonly Phase[] = ['ROUND_INTRO', 'ROUND_COUNTDOWN', 'ROUND_PLAYING', 'ROUND_RESULT', 'MATCH_END'];

export type RoundState = 'ACTIVE' | 'FINISHED' | 'OUT';

export interface JoinOptions {
  nickname?: string;
}

/**
 * A batch of consecutive inputs. `s` is the sequence number of the first input;
 * `i` is flat: [dirX, dirZ, jump(0|1), dirX, dirZ, jump, ...].
 */
export interface MoveBatch {
  s: number;
  i: number[];
}

/** Discrete game actions (non-movement minigames). */
export type GameAction =
  | { kind: 'JUMP_TILE'; side: 0 | 1 | 2 }
  | { kind: 'PULL' }
  | { kind: 'REACT' };

export interface ReadyMessage {
  ready: boolean;
}

export interface NpcConfigMessage {
  count: number;
  difficulties: Difficulty[];
}

export const ERROR_CODES = {
  NOT_HOST: 'NOT_HOST',
  NOT_ALL_READY: 'NOT_ALL_READY',
  BAD_PHASE: 'BAD_PHASE',
} as const;
export type ErrorCodeName = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ErrorMessage {
  code: ErrorCodeName;
}
