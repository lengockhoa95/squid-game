import { Room, type Client, type Delayed } from '@colyseus/core';
import {
  COUNTDOWN_SECONDS, ERROR_CODES, MAX_PLAYERS, MSG, PATCH_MS, PLAYGROUND_SPAWNS, RECONNECT_SECONDS, SIM_HZ,
  createPlaygroundWorld, parseMoveBatch, sanitizeNickname,
  type ErrorCodeName, type JoinOptions, type Phase, type SimWorld,
} from '@sp/shared';
import { MatchState, PlayerState } from '@sp/shared/schema';
import { PlayerSim } from '../players/PlayerSim.ts';
import { freeSlot, pickNextHost } from '../players/HostManager.ts';
import { RateLimiter } from '../validation/RateLimiter.ts';
import { roomCodes } from '../network/RoomCodeRegistry.ts';

const RATE_LIMITS = {
  [MSG.MOVE]: { perSecond: 30, burst: 15 }, // client sends ~20/s
  [MSG.READY]: { perSecond: 4, burst: 4 },
  [MSG.START]: { perSecond: 2, burst: 2 },
  [MSG.BACK_TO_LOBBY]: { perSecond: 2, burst: 2 },
};
const KICK_AFTER_VIOLATIONS = 300;
const KICK_CLOSE_CODE = 4002;

/**
 * Lobby + (Phase 2) free-roam match room. The server owns every position:
 * clients only send movement intents, which are validated, rate-limited and simulated here.
 */
export class MatchRoom extends Room {
  override maxClients = MAX_PLAYERS;
  override patchRate = PATCH_MS;
  override maxMessagesPerSecond = 60;
  override state = new MatchState();

  private readonly sims = new Map<string, PlayerSim>();
  private readonly limiter = new RateLimiter(RATE_LIMITS, KICK_AFTER_VIOLATIONS);
  private readonly world: SimWorld = createPlaygroundWorld();
  private joinCounter = 0;
  private countdownTimer: Delayed | null = null;

  override onCreate(): void {
    const code = roomCodes.reserve();
    this.roomId = code;
    this.state.roomCode = code;
    this.setPhase('LOBBY');

    this.onMessage(MSG.READY, (client, msg: unknown) => this.handleReady(client, msg));
    this.onMessage(MSG.START, (client) => this.handleStart(client));
    this.onMessage(MSG.BACK_TO_LOBBY, (client) => this.handleBackToLobby(client));
    this.onMessage(MSG.MOVE, (client, msg: unknown) => this.handleMove(client, msg));
    this.setSimulationInterval(() => this.tick(), 1000 / SIM_HZ);
  }

  override onJoin(client: Client, options?: JoinOptions): void {
    if (this.state.phase !== 'LOBBY') throw new Error('Trận đấu đã bắt đầu');
    const slot = freeSlot(this.state.players.values(), MAX_PLAYERS);
    if (slot < 0) throw new Error('Phòng đã đủ người');

    const spawn = PLAYGROUND_SPAWNS[slot]!;
    const p = new PlayerState();
    p.id = client.sessionId;
    p.nickname = sanitizeNickname(options?.nickname, `Người chơi ${slot + 1}`);
    p.slot = slot;
    p.joinOrder = ++this.joinCounter;
    p.isBot = false;
    p.ready = false;
    p.connected = true;
    this.state.players.set(client.sessionId, p);

    const sim = new PlayerSim(spawn.x, spawn.z, spawn.yaw);
    this.sims.set(client.sessionId, sim);
    this.syncPlayer(p, sim);

    if (!this.state.hostId) this.state.hostId = client.sessionId;
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
    this.state.players.delete(id);
    this.sims.delete(id);
    this.limiter.forget(id);
    if (this.state.hostId === id) this.state.hostId = pickNextHost(this.state.players.values());
  }

  override onDispose(): void {
    this.countdownTimer?.clear();
    roomCodes.release(this.state.roomCode);
  }

  private handleReady(client: Client, msg: unknown): void {
    if (!this.allow(client, MSG.READY)) return;
    if (this.state.phase !== 'LOBBY') return this.sendError(client, ERROR_CODES.BAD_PHASE);
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.ready = typeof msg === 'object' && msg !== null && (msg as { ready?: unknown }).ready === true;
  }

  private handleStart(client: Client): void {
    if (!this.allow(client, MSG.START)) return;
    if (client.sessionId !== this.state.hostId) return this.sendError(client, ERROR_CODES.NOT_HOST);
    if (this.state.phase !== 'LOBBY') return this.sendError(client, ERROR_CODES.BAD_PHASE);
    for (const p of this.state.players.values()) {
      if (!p.isBot && !p.ready) return this.sendError(client, ERROR_CODES.NOT_ALL_READY);
    }
    void this.beginCountdown();
  }

  private handleBackToLobby(client: Client): void {
    if (!this.allow(client, MSG.BACK_TO_LOBBY)) return;
    if (client.sessionId !== this.state.hostId) return this.sendError(client, ERROR_CODES.NOT_HOST);
    if (this.state.phase === 'LOBBY') return this.sendError(client, ERROR_CODES.BAD_PHASE);
    this.countdownTimer?.clear();
    this.countdownTimer = null;
    for (const p of this.state.players.values()) p.ready = false;
    this.respawnAll();
    this.setPhase('LOBBY');
    void this.unlock();
  }

  private handleMove(client: Client, msg: unknown): void {
    if (!this.allow(client, MSG.MOVE)) return;
    if (this.state.phase !== 'PLAYING') return; // silently ignore: inputs may arrive just after a phase change
    const sim = this.sims.get(client.sessionId);
    const batch = parseMoveBatch(msg);
    if (!sim || !batch) return;
    sim.enqueue(batch);
  }

  private async beginCountdown(): Promise<void> {
    await this.lock();
    this.respawnAll();
    this.setPhase('STARTING');
    this.state.countdown = COUNTDOWN_SECONDS;
    this.countdownTimer = this.clock.setInterval(() => {
      this.state.countdown = Math.max(0, this.state.countdown - 1);
      if (this.state.countdown === 0) {
        this.countdownTimer?.clear();
        this.countdownTimer = null;
        this.setPhase('PLAYING');
      }
    }, 1000);
  }

  private tick(): void {
    if (this.state.phase !== 'PLAYING') return;
    for (const [id, sim] of this.sims) {
      sim.tick(this.world);
      const p = this.state.players.get(id);
      if (p) this.syncPlayer(p, sim);
    }
  }

  private respawnAll(): void {
    for (const [id, sim] of this.sims) {
      const p = this.state.players.get(id);
      if (!p) continue;
      const spawn = PLAYGROUND_SPAWNS[p.slot]!;
      sim.reset(spawn.x, spawn.z, spawn.yaw);
      this.syncPlayer(p, sim);
    }
  }

  private syncPlayer(p: PlayerState, sim: PlayerSim): void {
    const s = sim.state;
    p.x = s.x;
    p.y = s.y;
    p.z = s.z;
    p.vx = s.vx;
    p.vy = s.vy;
    p.vz = s.vz;
    p.yaw = s.yaw;
    p.grounded = s.grounded;
    p.lastSeq = sim.lastProcessedSeq;
  }

  private setPhase(phase: Phase): void {
    this.state.phase = phase;
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
