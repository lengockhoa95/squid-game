import { Room, type Client } from '@colyseus/core';
import {
  ERROR_CODES, IN_MATCH_PHASES, MAX_PLAYERS, MSG, PATCH_MS, PLAYGROUND_SPAWNS, RECONNECT_SECONDS, SIM_DT, SIM_HZ,
  DEFAULT_NPC_DIFFICULTIES, isDifficulty, parseCast, parseElementsToggle, parseGameAction, parseMoveBatch, parseNpcConfig,
  CHARACTER_IDS, ELEMENT_IDS, MINIGAME_IDS, characterFor, isCharacterId, parseItemToggle, parsePickCard, parsePickElement, sanitizeNickname,
  type ErrorCodeName, type JoinOptions, type MinigameId, type Phase,
} from '@sp/shared';
import { MatchState } from '@sp/shared/schema';
import { PlayerSim } from '../players/PlayerSim.ts';
import { freeSlot, pickNextHost } from '../players/HostManager.ts';
import { addPlayer } from '../players/factory.ts';
import { syncPlayerFromSim } from '../players/sync.ts';
import { RateLimiter } from '../validation/RateLimiter.ts';
import { LatencyTracker } from '../network/LatencyTracker.ts';
import { roomCodes } from '../network/RoomCodeRegistry.ts';
import { NPCManager } from '../npc/NPCManager.ts';
import { MatchController } from '../match/MatchController.ts';

const RATE_LIMITS = {
  [MSG.MOVE]: { perSecond: 30, burst: 15 }, // client sends ~20/s
  [MSG.ACTION]: { perSecond: 12, burst: 6 },
  [MSG.READY]: { perSecond: 4, burst: 4 },
  [MSG.START]: { perSecond: 2, burst: 2 },
  [MSG.NPC_CONFIG]: { perSecond: 6, burst: 6 },
  [MSG.BACK_TO_LOBBY]: { perSecond: 2, burst: 2 },
  [MSG.PONG]: { perSecond: 4, burst: 4 },
  [MSG.PICK_ELEMENT]: { perSecond: 6, burst: 6 },
  [MSG.CAST]: { perSecond: 8, burst: 4 },
  [MSG.ELEMENTS_TOGGLE]: { perSecond: 4, burst: 4 },
  [MSG.NO_ELIMINATION_TOGGLE]: { perSecond: 4, burst: 4 },
  [MSG.CARDS_TOGGLE]: { perSecond: 4, burst: 4 },
  [MSG.PICK_CARD]: { perSecond: 4, burst: 4 },
  // Hosts click through checkbox lists quickly.
  [MSG.GAME_TOGGLE]: { perSecond: 10, burst: 16 },
  [MSG.PICK_CHARACTER]: { perSecond: 6, burst: 6 },
  [MSG.ELEMENT_TOGGLE]: { perSecond: 10, burst: 16 },
};
const KICK_AFTER_VIOLATIONS = 300;
const KICK_CLOSE_CODE = 4002;
const PING_INTERVAL_MS = 2000;

export interface MatchRoomOptions {
  /** Multiplier for intro/countdown/result durations (tests use a small value). */
  phaseScale?: number;
  /** Restrict the minigame pool (testing aid). */
  games?: MinigameId[];
}

/**
 * Lobby + match room. The server owns every outcome: clients send movement intents and discrete
 * actions, which are validated, rate-limited and handed to the MatchController. Bots are driven
 * server-side through the same paths.
 */
export class MatchRoom extends Room {
  override maxClients = MAX_PLAYERS;
  override patchRate = PATCH_MS;
  override maxMessagesPerSecond = 60;
  override state = new MatchState();

  private readonly sims = new Map<string, PlayerSim>();
  private readonly limiter = new RateLimiter(RATE_LIMITS, KICK_AFTER_VIOLATIONS);
  private readonly latency = new LatencyTracker();
  private readonly npcs = new NPCManager(Math.floor(Math.random() * 1e9));
  private readonly rng = Math.random;
  private joinCounter = 0;
  private controller!: MatchController;

  override onCreate(options?: MatchRoomOptions): void {
    const code = roomCodes.reserve();
    this.roomId = code;
    this.state.roomCode = code;
    this.state.phase = 'LOBBY';
    this.state.npcCount = MAX_PLAYERS - 1;
    for (const d of DEFAULT_NPC_DIFFICULTIES) this.state.npcDifficulties.push(d);
    this.controller = new MatchController({
      state: this.state,
      sims: this.sims,
      npcs: this.npcs,
      rng: this.rng,
      rttOf: (id) => this.latency.rttOf(id),
      onMatchOver: () => this.returnToLobby(),
      phaseScale: options?.phaseScale ?? 1,
      sendTo: (id, type, message) => this.clients.find((c) => c.sessionId === id)?.send(type, message),
    }, options?.games);

    this.onMessage(MSG.READY, (client, msg: unknown) => this.handleReady(client, msg));
    this.onMessage(MSG.START, (client) => this.handleStart(client));
    this.onMessage(MSG.NPC_CONFIG, (client, msg: unknown) => this.handleNpcConfig(client, msg));
    this.onMessage(MSG.BACK_TO_LOBBY, (client) => this.handleBackToLobby(client));
    this.onMessage(MSG.MOVE, (client, msg: unknown) => this.handleMove(client, msg));
    this.onMessage(MSG.ACTION, (client, msg: unknown) => this.handleAction(client, msg));
    this.onMessage(MSG.PICK_ELEMENT, (client, msg: unknown) => {
      if (!this.allow(client, MSG.PICK_ELEMENT)) return;
      const pick = parsePickElement(msg);
      if (pick) this.controller.pickElement(client.sessionId, pick.element);
    });
    this.onMessage(MSG.CAST, (client, msg: unknown) => {
      if (!this.allow(client, MSG.CAST)) return;
      const cast = parseCast(msg);
      if (cast) this.controller.castElement(client.sessionId, cast.x, cast.z);
    });
    this.onMessage(MSG.ELEMENTS_TOGGLE, (client, msg: unknown) => {
      if (!this.allow(client, MSG.ELEMENTS_TOGGLE)) return;
      if (client.sessionId !== this.state.hostId) return this.sendError(client, ERROR_CODES.NOT_HOST);
      if (this.state.phase !== 'LOBBY') return this.sendError(client, ERROR_CODES.BAD_PHASE);
      const toggle = parseElementsToggle(msg);
      if (toggle) this.state.elementsEnabled = toggle.enabled;
    });
    this.onMessage(MSG.NO_ELIMINATION_TOGGLE, (client, msg: unknown) => {
      if (!this.allow(client, MSG.NO_ELIMINATION_TOGGLE)) return;
      if (client.sessionId !== this.state.hostId) return this.sendError(client, ERROR_CODES.NOT_HOST);
      if (this.state.phase !== 'LOBBY') return this.sendError(client, ERROR_CODES.BAD_PHASE);
      const toggle = parseElementsToggle(msg); // same {enabled: boolean} payload
      if (toggle) this.state.noElimination = toggle.enabled;
    });
    this.onMessage(MSG.CARDS_TOGGLE, (client, msg: unknown) => {
      if (!this.allow(client, MSG.CARDS_TOGGLE)) return;
      if (client.sessionId !== this.state.hostId) return this.sendError(client, ERROR_CODES.NOT_HOST);
      if (this.state.phase !== 'LOBBY') return this.sendError(client, ERROR_CODES.BAD_PHASE);
      const toggle = parseElementsToggle(msg);
      if (toggle) this.state.cardsEnabled = toggle.enabled;
    });
    this.onMessage(MSG.GAME_TOGGLE, (client, msg: unknown) => {
      if (!this.hostLobbyAction(client, MSG.GAME_TOGGLE)) return;
      const t = parseItemToggle(msg, MINIGAME_IDS);
      if (!t) return;
      const off = this.state.disabledGames;
      const i = off.indexOf(t.id);
      if (t.enabled && i >= 0) off.splice(i, 1);
      // Keep at least one game in the pool.
      if (!t.enabled && i < 0 && off.length < MINIGAME_IDS.length - 1) off.push(t.id);
    });
    this.onMessage(MSG.ELEMENT_TOGGLE, (client, msg: unknown) => {
      if (!this.hostLobbyAction(client, MSG.ELEMENT_TOGGLE)) return;
      const t = parseItemToggle(msg, ELEMENT_IDS);
      if (!t) return;
      const off = this.state.disabledElements;
      const i = off.indexOf(t.id);
      if (t.enabled && i >= 0) off.splice(i, 1);
      if (!t.enabled && i < 0) off.push(t.id);
    });
    this.onMessage(MSG.PICK_CHARACTER, (client, msg: unknown) => {
      if (!this.allow(client, MSG.PICK_CHARACTER)) return;
      if (this.state.phase !== 'LOBBY') return this.sendError(client, ERROR_CODES.BAD_PHASE);
      const id = (msg as { id?: unknown } | null)?.id;
      const p = this.state.players.get(client.sessionId);
      if (p && isCharacterId(id)) p.character = id;
    });
    this.onMessage(MSG.PICK_CARD, (client, msg: unknown) => {
      if (!this.allow(client, MSG.PICK_CARD)) return;
      const pick = parsePickCard(msg);
      if (pick) this.controller.pickCard(client.sessionId, pick.card);
    });
    this.onMessage(MSG.PONG, (client, msg: unknown) => {
      if (!this.allow(client, MSG.PONG)) return;
      this.latency.receive(client.sessionId, (msg as { t?: unknown } | null)?.t, Date.now());
    });
    this.setSimulationInterval(() => this.controller.update(SIM_DT), 1000 / SIM_HZ);
    this.clock.setInterval(() => this.pingAll(), PING_INTERVAL_MS);
  }

  override onJoin(client: Client, options?: JoinOptions): void {
    if (this.state.phase !== 'LOBBY') throw new Error('Trận đấu đã bắt đầu');
    const slot = freeSlot(this.humans(), MAX_PLAYERS);
    if (slot < 0) throw new Error('Phòng đã đủ người');
    addPlayer(this.state, this.sims, {
      id: client.sessionId,
      nickname: sanitizeNickname(options?.nickname, `Người chơi ${slot + 1}`),
      slot,
      joinOrder: ++this.joinCounter,
      isBot: false,
    });
    if (!this.state.hostId) this.state.hostId = client.sessionId;
    this.clampNpcCount();
    this.pingClient(client);
  }

  override onDrop(client: Client): void {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = false;
    this.allowReconnection(client, RECONNECT_SECONDS);
  }

  override onReconnect(client: Client): void {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = true;
  }

  override onLeave(client: Client): void {
    const id = client.sessionId;
    this.limiter.forget(id);
    this.latency.forget(id);
    if (this.inMatch()) {
      this.controller.playerLeft(id); // keep the record for results; removed on return to lobby
    } else {
      this.state.players.delete(id);
      this.sims.delete(id);
    }
    if (this.state.hostId === id) this.state.hostId = pickNextHost([...this.state.players.values()].filter((p) => p.connected));
  }

  override onDispose(): void {
    this.controller.abort();
    roomCodes.release(this.state.roomCode);
  }

  private handleReady(client: Client, msg: unknown): void {
    if (!this.allow(client, MSG.READY)) return;
    if (this.state.phase !== 'LOBBY') return this.sendError(client, ERROR_CODES.BAD_PHASE);
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.ready = typeof msg === 'object' && msg !== null && (msg as { ready?: unknown }).ready === true;
  }

  private handleNpcConfig(client: Client, msg: unknown): void {
    if (!this.allow(client, MSG.NPC_CONFIG)) return;
    if (client.sessionId !== this.state.hostId) return this.sendError(client, ERROR_CODES.NOT_HOST);
    if (this.state.phase !== 'LOBBY') return this.sendError(client, ERROR_CODES.BAD_PHASE);
    const cfg = parseNpcConfig(msg);
    if (!cfg) return;
    this.state.npcCount = cfg.count;
    cfg.difficulties.forEach((d, i) => {
      this.state.npcDifficulties[i] = d;
    });
    this.clampNpcCount();
  }

  private handleStart(client: Client): void {
    if (!this.allow(client, MSG.START)) return;
    if (client.sessionId !== this.state.hostId) return this.sendError(client, ERROR_CODES.NOT_HOST);
    if (this.state.phase !== 'LOBBY') return this.sendError(client, ERROR_CODES.BAD_PHASE);
    const humans = this.humans();
    if (humans.some((p) => !p.ready)) return this.sendError(client, ERROR_CODES.NOT_ALL_READY);

    // 1. count humans 2. fill with NPCs per config 3. lock the roster 4. start (intro + countdown)
    this.clampNpcCount();
    const used = new Set(humans.map((p) => p.nickname));
    const difficulties = this.state.npcDifficulties.map((d) => (isDifficulty(d) ? d : 'NORMAL'));
    const specs = NPCManager.planBots(this.state.npcCount, difficulties, used, this.rng);
    for (const spec of specs) {
      const slot = freeSlot(this.state.players.values(), MAX_PLAYERS);
      if (slot < 0) break;
      const { state, sim } = addPlayer(this.state, this.sims, {
        id: spec.id, nickname: spec.nickname, slot, joinOrder: ++this.joinCounter, isBot: true, difficulty: spec.difficulty,
      });
      this.npcs.add(spec, state, sim);
      // Bots take a character nobody is using yet.
      const used = new Set([...this.state.players.values()].map((pl) => characterFor(pl.character, pl.slot)));
      const free = CHARACTER_IDS.filter((c) => !used.has(c));
      state.character = free[Math.floor(this.rng() * free.length)] ?? '';
    }
    void this.lock();
    this.controller.begin();
  }

  private handleBackToLobby(client: Client): void {
    if (!this.allow(client, MSG.BACK_TO_LOBBY)) return;
    if (client.sessionId !== this.state.hostId) return this.sendError(client, ERROR_CODES.NOT_HOST);
    if (!this.inMatch()) return this.sendError(client, ERROR_CODES.BAD_PHASE);
    this.returnToLobby();
  }

  private handleMove(client: Client, msg: unknown): void {
    if (!this.allow(client, MSG.MOVE)) return;
    const batch = parseMoveBatch(msg);
    if (batch) this.controller.handleMove(client.sessionId, batch);
  }

  private handleAction(client: Client, msg: unknown): void {
    if (!this.allow(client, MSG.ACTION)) return;
    const action = parseGameAction(msg);
    if (action) this.controller.handleAction(client.sessionId, action);
  }

  /** End of match (or host abort): drop bots and departed humans, reset everyone for a new game. */
  private returnToLobby(): void {
    this.controller.abort();
    this.npcs.clear();
    for (const [id, p] of [...this.state.players.entries()]) {
      if (p.isBot || !p.connected) {
        this.state.players.delete(id);
        this.sims.delete(id);
      }
    }
    for (const p of this.state.players.values()) {
      p.ready = false;
      p.alive = true;
      p.roundState = 'ACTIVE';
      p.team = -1;
      p.score = 0;
      p.element = '';
      p.cards = '';
      p.cardOffer = '';
      p.lives = 0;
      const sim = this.sims.get(p.id)!;
      const spawn = PLAYGROUND_SPAWNS[p.slot]!;
      sim.reset(spawn.x, spawn.z, spawn.yaw);
      syncPlayerFromSim(p, sim);
    }
    this.state.phase = 'LOBBY';
    this.state.currentGame = '';
    this.state.timer = 0;
    this.state.roundIndex = 0;
    this.state.results.clear();
    this.clampNpcCount();
    void this.unlock();
  }

  /** Rate limit + host only + lobby only (sends the matching error otherwise). */
  private hostLobbyAction(client: Client, type: string): boolean {
    if (!this.allow(client, type)) return false;
    if (client.sessionId !== this.state.hostId) {
      this.sendError(client, ERROR_CODES.NOT_HOST);
      return false;
    }
    if (this.state.phase !== 'LOBBY') {
      this.sendError(client, ERROR_CODES.BAD_PHASE);
      return false;
    }
    return true;
  }

  private humans() {
    return [...this.state.players.values()].filter((p) => !p.isBot);
  }

  private clampNpcCount(): void {
    const maxBots = Math.max(0, MAX_PLAYERS - this.humans().length);
    if (this.state.npcCount > maxBots) this.state.npcCount = maxBots;
  }

  private inMatch(): boolean {
    return IN_MATCH_PHASES.includes(this.state.phase as Phase);
  }

  private pingAll(): void {
    for (const client of this.clients) this.pingClient(client);
  }

  private pingClient(client: Client): void {
    client.send(MSG.PING, { t: this.latency.issue(client.sessionId, Date.now()) });
  }

  private allow(client: Client, type: string): boolean {
    const decision = this.limiter.check(client.sessionId, type, Date.now());
    if (decision === 'kick') client.leave(KICK_CLOSE_CODE);
    return decision === 'ok';
  }

  private sendError(client: Client, code: ErrorCodeName): void {
    client.send(MSG.ERROR, { code });
  }
}
