import type { Phase } from '@sp/shared';
import { createStore } from '../store/UIStore.ts';

export type SessionStatus = 'idle' | 'connecting' | 'in-room' | 'reconnecting';

export interface LobbyPlayer {
  id: string;
  nickname: string;
  slot: number;
  isBot: boolean;
  ready: boolean;
  connected: boolean;
}

export interface SessionState {
  status: SessionStatus;
  /** User-facing error message (Vietnamese), shown on the home screen or as a toast. */
  error: string | null;
  toast: string | null;
  roomCode: string;
  phase: Phase;
  countdown: number;
  hostId: string;
  myId: string;
  /** Sorted by slot. Only replaced when lobby-relevant fields change (not on every movement patch). */
  players: readonly LobbyPlayer[];
}

export const sessionStore = createStore<SessionState>({
  status: 'idle',
  error: null,
  toast: null,
  roomCode: '',
  phase: 'LOBBY',
  countdown: 0,
  hostId: '',
  myId: '',
  players: [],
});
