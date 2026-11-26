/** Client → server and server → client message types. */
export const MSG = {
  MOVE: 'move',
  READY: 'ready',
  START: 'start',
  BACK_TO_LOBBY: 'backToLobby',
  ERROR: 'error',
} as const;

export type Phase = 'LOBBY' | 'STARTING' | 'PLAYING';

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

export interface ReadyMessage {
  ready: boolean;
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
