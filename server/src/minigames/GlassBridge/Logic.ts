import {
  BRIDGE, TILE_BROKEN, TILE_SAFE, TILE_UNKNOWN, bridgeFinishZ, bridgeRowZ, bridgeRowsFor, bridgeSlotOffset, tileIndex,
  type GameAction,
} from '@sp/shared';
import { BridgeState } from '@sp/shared/schema';
import { rankPlayers, type GamePlayer, type MinigameContext, type RoundOutcome, type ServerMinigame } from '../framework/types.ts';

interface Jump {
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  elapsed: number;
  row: number; // target row; rows = finish platform
  side: number;
}

interface Fall {
  elapsed: number;
}

const FALL_SECONDS = 1.2;

/**
 * Glass Bridge (simultaneous): every player jumps forward row by row. Each row has one safe tile;
 * the safe pattern exists only on the server. Broken and proven-safe tiles are revealed to everyone.
 * Player positions are set by the server (no walking). PlayerState.score = rows cleared.
 */
export class GlassBridge implements ServerMinigame {
  readonly id = 'GLASS_BRIDGE' as const;
  readonly step = null;
  private ctx!: MinigameContext;
  private state!: BridgeState;
  private safeSide: number[] = [];
  private rows: number = BRIDGE.maxRows;
  private readonly progress = new Map<string, number>(); // rows cleared (0 = on start platform)
  private readonly jumps = new Map<string, Jump>();
  private readonly falls = new Map<string, Fall>();
  private readonly cooldown = new Map<string, number>();
  private readonly finishTimes = new Map<string, number>();
  private readonly fellAt = new Map<string, number>();

  initialize(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.state = new BridgeState();
    this.rows = bridgeRowsFor(ctx.players.length);
    this.state.rows = this.rows;
    for (let i = 0; i < this.rows * 2; i++) this.state.tiles.push(TILE_UNKNOWN);
    ctx.match.bridge = this.state;
    this.safeSide = Array.from({ length: this.rows }, () => (ctx.rng() < 0.5 ? 0 : 1));
    for (const p of ctx.players) {
      this.progress.set(p.id, 0);
      const o = bridgeSlotOffset(p.state.slot);
      this.place(p, o.dx * 3, BRIDGE.startZ + o.dz * 2, 0);
      p.state.score = 0;
    }
  }

  start(): void {}

  handlePlayerInput(playerId: string, action: GameAction, gameTime: number): void {
    if (action.kind !== 'JUMP_TILE') return;
    const p = this.ctx.players.find((pl) => pl.id === playerId);
    if (!p || p.state.roundState !== 'ACTIVE' || this.jumps.has(playerId)) return;
    if (gameTime < (this.cooldown.get(playerId) ?? 0)) return;
    const row = this.progress.get(playerId) ?? 0;
    const o = bridgeSlotOffset(p.state.slot);
    if (row >= this.rows) {
      this.startJump(p, 0, bridgeFinishZ(this.rows) - 1.5 + o.dz, this.rows, 0);
      return;
    }
    if (this.state.tiles[tileIndex(row, action.side)] === TILE_BROKEN) return; // cannot pick a broken tile
    this.startJump(p, BRIDGE.tileX[action.side] + o.dx, bridgeRowZ(row) + o.dz, row, action.side);
  }

  update(dt: number, gameTime: number): void {
    for (const p of this.ctx.players) {
      const jump = this.jumps.get(p.id);
      if (jump) this.advanceJump(p, jump, dt, gameTime);
      const fall = this.falls.get(p.id);
      if (fall) {
        fall.elapsed += dt;
        const f = Math.min(1, fall.elapsed / FALL_SECONDS);
        p.state.y = BRIDGE.fallDepth * f * f;
        p.state.vy = -20 * f;
        p.state.grounded = false;
      }
    }
  }

  /** Public info for bots: tile states and each player's progress (what everyone can see). */
  view(): {
    tiles: readonly number[];
    progress: ReadonlyMap<string, number>;
    jumping: (id: string) => boolean;
    /** True if someone is mid-air towards `row` (everyone can see them jumping). */
    someoneJumpingTo: (row: number) => boolean;
  } {
    return {
      tiles: this.state.tiles,
      progress: this.progress,
      jumping: (id) => this.jumps.has(id),
      someoneJumpingTo: (row) => [...this.jumps.values()].some((j) => j.row === row),
    };
  }

  /** SWAP element: two standing players exchange places and progress. */
  swapPlayers(a: string, b: string): boolean {
    const pa = this.ctx.players.find((p) => p.id === a);
    const pb = this.ctx.players.find((p) => p.id === b);
    if (!pa || !pb || a === b) return false;
    for (const p of [pa, pb]) {
      if (p.state.roundState !== 'ACTIVE' || this.jumps.has(p.id) || this.falls.has(p.id)) return false;
    }
    const ax = pa.state.x, az = pa.state.z, ay = pa.state.y;
    this.place(pa, pb.state.x, pb.state.z, pb.state.y);
    this.place(pb, ax, az, ay);
    const progA = this.progress.get(a) ?? 0;
    this.progress.set(a, this.progress.get(b) ?? 0);
    this.progress.set(b, progA);
    pa.state.score = this.progress.get(a)!;
    pb.state.score = progA;
    return true;
  }

  getState(): BridgeState {
    return this.state;
  }

  isFinished(): boolean {
    return this.ctx.players.every((p) => p.state.roundState !== 'ACTIVE' && !this.jumps.has(p.id));
  }

  finish(): RoundOutcome {
    const ranking = rankPlayers(this.ctx.players, this.finishTimes, (p) => this.progress.get(p.id) ?? 0);
    const passed = new Set(this.finishTimes.keys());
    const details = new Map<string, string>();
    for (const p of this.ctx.players) {
      const t = this.finishTimes.get(p.id);
      if (t !== undefined) details.set(p.id, `Qua cầu sau ${t.toFixed(1)}s`);
      else if (this.fellAt.has(p.id)) details.set(p.id, `Rơi ở hàng ${this.fellAt.get(p.id)! + 1}`);
      else details.set(p.id, `Hết giờ ở hàng ${this.progress.get(p.id) ?? 0}/${this.rows}`);
    }
    return { ranking, passed, details };
  }

  dispose(): void {
    this.ctx.match.bridge = undefined;
  }

  private startJump(p: GamePlayer, toX: number, toZ: number, row: number, side: number): void {
    this.jumps.set(p.id, { fromX: p.state.x, fromZ: p.state.z, toX, toZ, elapsed: 0, row, side });
    p.state.yaw = Math.atan2(toX - p.state.x, toZ - p.state.z);
  }

  private advanceJump(p: GamePlayer, jump: Jump, dt: number, gameTime: number): void {
    jump.elapsed += dt;
    const f = Math.min(1, jump.elapsed / BRIDGE.jumpTime);
    const x = jump.fromX + (jump.toX - jump.fromX) * f;
    const z = jump.fromZ + (jump.toZ - jump.fromZ) * f;
    this.place(p, x, z, 4 * 1.1 * f * (1 - f));
    p.state.vz = (jump.toZ - jump.fromZ) / BRIDGE.jumpTime;
    p.state.grounded = false;
    if (f < 1) return;

    this.jumps.delete(p.id);
    p.state.vz = 0;
    p.state.grounded = true;
    this.cooldown.set(p.id, gameTime + BRIDGE.cooldown);
    if (jump.row >= this.rows) {
      p.state.roundState = 'FINISHED';
      this.finishTimes.set(p.id, gameTime);
      this.progress.set(p.id, this.rows + 1);
      p.state.score = this.rows + 1;
      return;
    }
    const idx = tileIndex(jump.row, jump.side);
    if (this.safeSide[jump.row] === jump.side) {
      this.state.tiles[idx] = TILE_SAFE;
      this.progress.set(p.id, jump.row + 1);
      p.state.score = jump.row + 1;
    } else {
      this.state.tiles[idx] = TILE_BROKEN;
      // The other tile of this row is now known to be safe.
      this.state.tiles[tileIndex(jump.row, 1 - jump.side)] = TILE_SAFE;
      p.state.roundState = 'OUT';
      this.fellAt.set(p.id, jump.row);
      this.falls.set(p.id, { elapsed: 0 });
    }
  }

  private place(p: GamePlayer, x: number, z: number, y: number): void {
    p.state.x = x;
    p.state.z = z;
    p.state.y = y;
    p.state.vx = 0;
  }
}
