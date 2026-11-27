import { Client, CloseCode, type Room } from '@colyseus/sdk';
import {
  MSG, ROOM_NAME, isDifficulty, vi,
  CARDS, parseCards,
  type CardId, type Difficulty, type ElementId, type ErrorMessage, type GameAction, type MinigameId, type MoveBatch, type NpcConfigMessage, type Phase,
} from '@sp/shared';
import { MatchState } from '@sp/shared/schema';
import { getServerUrl } from './serverUrl.ts';
import { sessionStore, type LobbyPlayer, type ResultRow } from './sessionStore.ts';
import { joinErrorText, serverErrorText } from './errors.ts';
import { bridgeHints } from './bridgeHints.ts';
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
  private resultsSignature = '';
  /** In-flight connection attempt; concurrent calls (double clicks, StrictMode effects) share it. */
  private pending: Promise<void> | null = null;
  private lastGameTime = 0;
  private lastGameTimeAt = 0;

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
    if (this.pending) {
      await this.pending.catch(() => undefined);
      return this.room !== null;
    }
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

  setNpcConfig(config: NpcConfigMessage): void {
    this.room?.send(MSG.NPC_CONFIG, config);
  }

  setElementsEnabled(enabled: boolean): void {
    this.room?.send(MSG.ELEMENTS_TOGGLE, { enabled });
  }

  setNoElimination(enabled: boolean): void {
    this.room?.send(MSG.NO_ELIMINATION_TOGGLE, { enabled });
  }

  setCardsEnabled(enabled: boolean): void {
    this.room?.send(MSG.CARDS_TOGGLE, { enabled });
  }

  setGameEnabled(id: string, enabled: boolean): void {
    this.room?.send(MSG.GAME_TOGGLE, { id, enabled });
  }

  setElementEnabled(id: string, enabled: boolean): void {
    this.room?.send(MSG.ELEMENT_TOGGLE, { id, enabled });
  }

  /** Adapter for the networked scene; null when not in a room. */
  getAdapter(): MatchNetAdapter | null {
    if (!this.room) return null;
    // Always read `this.room`: a manual reconnect replaces the Room object (same sessionId).
    return {
      localId: this.room.sessionId,
      getPhase: () => (this.room?.state.phase as Phase | undefined) ?? 'LOBBY',
      getState: () => this.room?.state ?? null,
      forEachPlayer: (cb) => this.room?.state.players.forEach((p) => cb(p as NetPlayer)),
      onSnapshot: (cb) => {
        this.snapshotListeners.add(cb);
        return () => this.snapshotListeners.delete(cb);
      },
      sendMove: (batch: MoveBatch) => this.room?.send(MSG.MOVE, batch),
      sendAction: (action: GameAction) => this.room?.send(MSG.ACTION, action),
      sendCast: (x: number, z: number) => this.room?.send(MSG.CAST, { x, z }),
      pickElement: (element: ElementId) => this.room?.send(MSG.PICK_ELEMENT, { element }),
      pickCard: (card: CardId) => this.room?.send(MSG.PICK_CARD, { card }),
      gameTimeNow: () => {
        const phase = this.room?.state.phase;
        if (phase !== 'ROUND_PLAYING') return this.lastGameTime;
        return this.lastGameTime + (performance.now() - this.lastGameTimeAt) / 1000;
      },
    };
  }

  private connect(open: () => Promise<MatchRoom>, silent = false): Promise<void> {
    if (this.room) return Promise.resolve();
    this.pending ??= this.doConnect(open, silent).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async doConnect(open: () => Promise<MatchRoom>, silent: boolean): Promise<void> {
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
      this.lastGameTime = state.gameTime;
      this.lastGameTimeAt = performance.now();
      this.syncSession(state);
      for (const l of this.snapshotListeners) l();
    });
    room.onMessage(MSG.ERROR, (msg: ErrorMessage) => this.showToast(serverErrorText(msg.code)));
    // Echo the server's latency probe immediately (the server measures RTT itself).
    room.onMessage(MSG.PING, (msg: unknown) => room.send(MSG.PONG, msg));
    room.onMessage(MSG.BRIDGE_HINT, (msg: { rows?: unknown }) => {
      const rows = Array.isArray(msg?.rows) ? (msg.rows as Array<[number, number]>) : [];
      bridgeHints.set({ round: room.state.roundIndex, broken: new Map(rows.map(([r, side]) => [r, side])) });
    });
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
    this.resultsSignature = '';
    sessionStore.set({
      status: 'idle', error, roomCode: '', phase: 'LOBBY', hostId: '', myId: '', players: [], results: [],
      currentGame: '', winnerId: '', timerSeconds: 0, roundIndex: 0, totalRounds: 0,
    });
  }

  private syncSession(state: MatchState): void {
    // sessionStore.set() ignores unchanged values, so this only re-renders React when something
    // visible changed (timer is whole seconds). Position patches never touch these fields.
    const difficulties = state.npcDifficulties.map((d) => (isDifficulty(d) ? d : 'NORMAL')) as Difficulty[];
    const s = sessionStore.get();
    sessionStore.set({
      phase: state.phase as Phase,
      hostId: state.hostId,
      roomCode: state.roomCode,
      npcCount: state.npcCount,
      npcDifficulties: difficulties.join() === s.npcDifficulties.join() ? s.npcDifficulties : difficulties,
      totalRounds: state.totalRounds,
      roundIndex: state.roundIndex,
      currentGame: state.currentGame as MinigameId | '',
      timerSeconds: Math.ceil(state.timer),
      winnerId: state.winnerId,
      elementsEnabled: state.elementsEnabled,
      noElimination: state.noElimination,
      cardsEnabled: state.cardsEnabled,
    });
    const games = [...state.disabledGames];
    const elements = [...state.disabledElements];
    if (games.join() !== s.disabledGames.join()) sessionStore.set({ disabledGames: games });
    if (elements.join() !== s.disabledElements.join()) sessionStore.set({ disabledElements: elements });

    let resultsSig = '';
    state.results.forEach((r) => {
      resultsSig += `${r.id}|${r.rank}|${r.passed}|${r.eliminated}|${r.detail}|${r.gained};`;
    });
    if (resultsSig !== this.resultsSignature) {
      this.resultsSignature = resultsSig;
      const results: ResultRow[] = [];
      state.results.forEach((r) => results.push({ id: r.id, nickname: r.nickname, rank: r.rank, passed: r.passed, eliminated: r.eliminated, detail: r.detail, gained: r.gained }));
      sessionStore.set({ results });
    }

    let signature = '';
    state.players.forEach((p) => {
      signature += `${p.id}|${p.nickname}|${p.slot}|${p.isBot}|${p.difficulty}|${p.ready}|${p.connected}|${p.alive}|${p.roundState}|${p.team}|${p.element}|${p.points}|${p.cards}|${p.cardOffer}|${p.lives};`;
    });
    if (signature === this.lobbySignature) return;
    this.lobbySignature = signature;
    const players: LobbyPlayer[] = [];
    state.players.forEach((p) => {
      players.push({
        id: p.id, nickname: p.nickname, slot: p.slot, isBot: p.isBot, difficulty: p.difficulty, ready: p.ready,
        connected: p.connected, alive: p.alive, roundState: p.roundState, team: p.team, element: p.element, points: p.points,
        cards: p.cards, cardOffer: p.cardOffer, lives: p.lives,
      });
      this.detectAwakening(p.id, p.nickname, p.cards);
    });
    players.sort((a, b) => a.slot - b.slot);
    sessionStore.set({ players });
  }

  private readonly awakened = new Map<string, Set<string>>();
  private announceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Announce when someone's card reaches level 3 (compared with what we saw before). */
  private detectAwakening(id: string, nickname: string, cards: string): void {
    const levels = parseCards(cards);
    const seen = this.awakened.get(id) ?? new Set<string>();
    const isFirstSight = !this.awakened.has(id);
    this.awakened.set(id, seen);
    for (const [card, level] of Object.entries(levels)) {
      if (level !== 3 || seen.has(card)) continue;
      seen.add(card);
      if (isFirstSight) continue; // joined/reconnected mid-match: no stale announcements
      const info = CARDS[card as CardId];
      sessionStore.set({ announce: `${nickname} ${vi.awakened} ${info.name.toUpperCase()} — ${info.awaken}!` });
      if (this.announceTimer) clearTimeout(this.announceTimer);
      this.announceTimer = setTimeout(() => sessionStore.set({ announce: null }), 3500);
    }
    if (!cards) seen.clear();
  }

  private showToast(text: string): void {
    sessionStore.set({ toast: text });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => sessionStore.set({ toast: null }), TOAST_MS);
  }
}

export const network = new NetworkManager();
