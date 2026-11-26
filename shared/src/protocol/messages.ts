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
  | { kind: 'JUMP_TILE'; side: 0 | 1 }
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
