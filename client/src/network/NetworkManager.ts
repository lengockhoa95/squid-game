import { Client, CloseCode, type Room } from '@colyseus/sdk';
import { MSG, ROOM_NAME, vi, type ErrorMessage, type MoveBatch, type Phase } from '@sp/shared';
import { MatchState } from '@sp/shared/schema';
import { getServerUrl } from './serverUrl.ts';
import { sessionStore, type LobbyPlayer } from './sessionStore.ts';
import { joinErrorText, serverErrorText } from './errors.ts';
import type { MatchNetAdapter, NetPlayer } from './types.ts';

const TOKEN_KEY = 'sp.reconnectToken';
const TOAST_MS = 3500;

type MatchRoom = Room<unknown, MatchState>;

function saveToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable: reload-reconnect just won't work
  }
}

function loadToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Owns the Colyseus client + current room. Translates room state into the throttled
 * `sessionStore` for React, and exposes a `MatchNetAdapter` for the 3D scene.
 */
class NetworkManager {
  private client: Client | null = null;
  private room: MatchRoom | null = null;
  private lobbySignature = '';
  private readonly snapshotListeners = new Set<() => void>();
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  private getClient(): Client {
    this.client ??= new Client(getServerUrl());
    return this.client;
  }

  async createRoom(nickname: string): Promise<void> {
    await this.connect(() => this.getClient().create(ROOM_NAME, { nickname }, MatchState) as Promise<MatchRoom>);
  }

  async joinRoom(code: string, nickname: string): Promise<void> {
    await this.connect(() => this.getClient().joinById(code, { nickname }, MatchState) as Promise<MatchRoom>);
  }

  /** After a page reload: rejoin the previous room if the server still holds our seat. */
  async tryResume(): Promise<boolean> {
    const token = loadToken();
    if (!token || this.room) return false;
    try {
      await this.connect(() => this.getClient().reconnect(token, MatchState) as Promise<MatchRoom>, true);
      return true;
    } catch {
      saveToken(null);
      return false;
    }
  }

  async leave(): Promise<void> {
    const room = this.room;
    saveToken(null);
    if (room) await room.leave(true);
    this.reset(null);
  }

  setReady(ready: boolean): void {
    this.room?.send(MSG.READY, { ready });
  }

  start(): void {
    this.room?.send(MSG.START);
  }

  backToLobby(): void {
    this.room?.send(MSG.BACK_TO_LOBBY);
  }

  /** Adapter for the networked scene; null when not in a room. */
  getAdapter(): MatchNetAdapter | null {
    if (!this.room) return null;
    // Always read `this.room`: a manual reconnect replaces the Room object (same sessionId).
    return {
      localId: this.room.sessionId,
      getPhase: () => (this.room?.state.phase as Phase | undefined) ?? 'LOBBY',
      forEachPlayer: (cb) => this.room?.state.players.forEach((p) => cb(p as NetPlayer)),
      onSnapshot: (cb) => {
        this.snapshotListeners.add(cb);
        return () => this.snapshotListeners.delete(cb);
      },
      sendMove: (batch: MoveBatch) => this.room?.send(MSG.MOVE, batch),
    };
  }

  private async connect(open: () => Promise<MatchRoom>, silent = false): Promise<void> {
    if (this.room) return;
    sessionStore.set({ status: 'connecting', error: null });
    let room: MatchRoom;
    try {
      room = await open();
    } catch (err) {
      sessionStore.set({ status: 'idle', error: silent ? null : joinErrorText(err) });
      throw err;
    }
    this.attach(room);
  }

  private attach(room: MatchRoom): void {
    this.room = room;
    this.lobbySignature = '';
    saveToken(room.reconnectionToken);
    sessionStore.set({ status: 'in-room', error: null, myId: room.sessionId });

    room.onStateChange((state) => {
      this.syncSession(state);
      for (const l of this.snapshotListeners) l();
    });
    room.onMessage(MSG.ERROR, (msg: ErrorMessage) => this.showToast(serverErrorText(msg.code)));
    room.onDrop(() => sessionStore.set({ status: 'reconnecting' }));
    room.onReconnect(() => {
      saveToken(room.reconnectionToken);
      sessionStore.set({ status: 'in-room' });
    });
    room.onLeave((code) => void this.handleLeave(room, code));
  }

  private async handleLeave(room: MatchRoom, code: number): Promise<void> {
    if (this.room !== room) return;
    if (code === CloseCode.CONSENTED) {
      this.reset(null);
      return;
    }
    // Automatic retries are over (or were skipped, e.g. the room was too young): try once with our token.
    const token = room.reconnectionToken;
    this.room = null;
    sessionStore.set({ status: 'reconnecting' });
    try {
      const again = (await this.getClient().reconnect(token, MatchState)) as MatchRoom;
      this.attach(again);
    } catch {
      saveToken(null);
      this.reset(vi.errDisconnected);
    }
  }

  private reset(error: string | null): void {
    this.room = null;
    this.snapshotListeners.clear();
    this.lobbySignature = '';
    sessionStore.set({ status: 'idle', error, roomCode: '', phase: 'LOBBY', countdown: 0, hostId: '', myId: '', players: [] });
  }

  private syncSession(state: MatchState): void {
    const phase = state.phase as Phase;
    const s = sessionStore.get();
    if (s.phase !== phase || s.countdown !== state.countdown || s.hostId !== state.hostId || s.roomCode !== state.roomCode) {
      sessionStore.set({ phase, countdown: state.countdown, hostId: state.hostId, roomCode: state.roomCode });
    }
    // Only rebuild the player list when lobby fields change — position patches must not re-render React.
    let signature = '';
    state.players.forEach((p) => {
      signature += `${p.id}|${p.nickname}|${p.slot}|${p.isBot}|${p.ready}|${p.connected};`;
    });
    if (signature === this.lobbySignature) return;
    this.lobbySignature = signature;
    const players: LobbyPlayer[] = [];
    state.players.forEach((p) => {
      players.push({ id: p.id, nickname: p.nickname, slot: p.slot, isBot: p.isBot, ready: p.ready, connected: p.connected });
    });
    players.sort((a, b) => a.slot - b.slot);
    sessionStore.set({ players });
  }

  private showToast(text: string): void {
    sessionStore.set({ toast: text });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => sessionStore.set({ toast: null }), TOAST_MS);
  }
}

export const network = new NetworkManager();
