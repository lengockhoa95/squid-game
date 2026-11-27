import type { Difficulty, MinigameId, Phase } from '@sp/shared';
import { createStore } from '../store/UIStore.ts';

export type SessionStatus = 'idle' | 'connecting' | 'in-room' | 'reconnecting';

export interface LobbyPlayer {
  id: string;
  nickname: string;
  slot: number;
  isBot: boolean;
  difficulty: string;
  ready: boolean;
  connected: boolean;
  alive: boolean;
  roundState: string;
  team: number;
  element: string;
  points: number;
}

export interface ResultRow {
  id: string;
  nickname: string;
  rank: number;
  passed: boolean;
  eliminated: boolean;
  detail: string;
  gained: number;
}

export interface SessionState {
  status: SessionStatus;
  /** User-facing error message (Vietnamese), shown on the home screen or as a toast. */
  error: string | null;
  toast: string | null;
  roomCode: string;
  phase: Phase;
  hostId: string;
  myId: string;
  npcCount: number;
  npcDifficulties: readonly Difficulty[];
  totalRounds: number;
  roundIndex: number;
  currentGame: MinigameId | '';
  /** Whole seconds left in the current phase (rounded up) — changes at most once per second. */
  timerSeconds: number;
  winnerId: string;
  elementsEnabled: boolean;
  noElimination: boolean;
  results: readonly ResultRow[];
  /** Sorted by slot. Only replaced when listed fields change (never on movement patches). */
  players: readonly LobbyPlayer[];
}

export const sessionStore = createStore<SessionState>({
  status: 'idle',
  error: null,
  toast: null,
  roomCode: '',
  phase: 'LOBBY',
  hostId: '',
  myId: '',
  npcCount: 0,
  npcDifficulties: [],
  totalRounds: 0,
  roundIndex: 0,
  currentGame: '',
  timerSeconds: 0,
  winnerId: '',
  elementsEnabled: true,
  noElimination: false,
  results: [],
  players: [],
});
