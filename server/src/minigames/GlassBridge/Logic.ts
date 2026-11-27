import {
  BRIDGE, BRIDGE_PLATFORM_HALF, TILE_BROKEN, TILE_SAFE, TILE_UNKNOWN,
  breakBridgeTile, bridgeFinishZ, bridgeRowsFor, bridgeSpawn, bridgeStep, bridgeTileUnder, createBridgeWorld, tileIndex,
  type BridgeWorld, type GameAction, type StepFn,
} from '@sp/shared';
import { BridgeState } from '@sp/shared/schema';
import { rankPlayers, type MinigameContext, type RoundOutcome, type ServerMinigame } from '../framework/types.ts';

/**
 * Glass Bridge (free movement): walk and jump from row to row. Each row has three tiles, one of
 * which breaks under the first player who lands on it. The breaking pattern exists only on the
 * server; tiles proven safe or broken are revealed to everyone. Falling off the bridge is out,
 * reaching the far platform passes. PlayerState.score = rows cleared.
 */
export class GlassBridge implements ServerMinigame {
  readonly id = 'GLASS_BRIDGE' as const;
  private bw: BridgeWorld = createBridgeWorld(1);
  /** Delegates to the current world (built in initialize once the row count is known). */
  readonly step: StepFn = (s, intent, dt, t) => this.stepFn(s, intent, dt, t);
  private stepFn: StepFn = bridgeStep(this.bw);
  bounds = this.bw.world.bounds;
  private ctx!: MinigameContext;
  private state!: BridgeState;
  /** Index of the tile that breaks in each row. */
  private brokenSide: number[] = [];
  private rows = 0;
  private readonly progress = new Map<string, number>();
  private readonly finishTimes = new Map<string, number>();
  private readonly fellAt = new Map<string, number>();
  private readonly lastSafe = new Map<string, { x: number; z: number }>();
  /** Mắt Thần hints: rows whose breaking tile each player knows. */
  private readonly hints = new Map<string, Set<number>>();

  initialize(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.state = new BridgeState();
    this.rows = bridgeRowsFor(ctx.players.length);
    this.state.rows = this.rows;
    for (let i = 0; i < this.rows * BRIDGE.tilesPerRow; i++) this.state.tiles.push(TILE_UNKNOWN);
    ctx.match.bridge = this.state;
    this.brokenSide = Array.from({ length: this.rows }, () => Math.floor(ctx.rng() * BRIDGE.tilesPerRow));
    this.bw = createBridgeWorld(this.rows);
    this.stepFn = bridgeStep(this.bw);
    this.bounds = this.bw.world.bounds;
    for (const p of ctx.players) {
      this.progress.set(p.id, 0);
      const s = bridgeSpawn(p.state.slot);
      p.sim.reset(s.x, s.z, s.yaw);
      p.state.score = 0;
    }
  }

  start(): void {}

  handlePlayerInput(_playerId: string, _action: GameAction): void {
    // Movement only.
  }

  update(_dt: number, gameTime: number): void {
    const finishLine = bridgeFinishZ(this.rows) + 0.4;
    for (const p of this.ctx.players) {
      if (p.state.roundState !== 'ACTIVE') continue;
      const s = p.sim.state;
      if (s.grounded && s.z <= finishLine) {
        p.state.roundState = 'FINISHED';
        this.finishTimes.set(p.id, gameTime);
        this.progress.set(p.id, this.rows);
        p.state.score = this.rows;
        continue;
      }
      const tile = bridgeTileUnder(this.bw, s);
      const broke = tile >= 0 && this.land(p.id, tile);
      // Remember solid footing as the Mạng Phụ landing spot: an intact tile or a platform —
      // never the spot of a tile that just broke (the player may not have started falling yet).
      const onPlatform = Math.abs(s.x) <= BRIDGE_PLATFORM_HALF && (s.z >= BRIDGE.startZ - 1.6 || s.z <= bridgeFinishZ(this.rows) + 1.4);
      if (!broke && s.grounded && Math.abs(s.y) < 0.05 && (tile >= 0 || onPlatform)) this.lastSafe.set(p.id, { x: s.x, z: s.z });
      if (s.y < -6) {
        const spot = this.lastSafe.get(p.id);
        if (spot && this.ctx.tryRescue?.(p.id)) {
          p.sim.reset(spot.x, spot.z, s.yaw);
          continue;
        }
        p.state.roundState = 'OUT';
        this.fellAt.set(p.id, this.progress.get(p.id) ?? 0);
      }
    }
  }

  /** Public info for bots: tile states and each player's progress (what everyone can see). */
  view(): { tiles: readonly number[]; progress: ReadonlyMap<string, number>; world: BridgeWorld } {
    return { tiles: this.state.tiles, progress: this.progress, world: this.bw };
  }

  revealFor(id: string, rows: number): Array<[number, number]> {
    const known = new Set<number>();
    const out: Array<[number, number]> = [];
    for (let row = 0; row < Math.min(rows, this.rows); row++) {
      known.add(row);
      out.push([row, this.brokenSide[row]!]);
    }
    this.hints.set(id, known);
    return out;
  }

  /** Breaking tile of `row` if this player holds a Mắt Thần hint for it (used by bots). */
  hintFor(id: string, row: number): number | null {
    return this.hints.get(id)?.has(row) ? this.brokenSide[row]! : null;
  }

  getState(): BridgeState {
    return this.state;
  }

  isFinished(): boolean {
    return this.ctx.players.every((p) => p.state.roundState !== 'ACTIVE');
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

  /** Someone stands on a tile: reveal it as safe, or break it (and its row becomes known). True = it broke. */
  private land(id: string, tile: number): boolean {
    const row = Math.floor(tile / BRIDGE.tilesPerRow);
    const side = tile % BRIDGE.tilesPerRow;
    if (this.brokenSide[row] === side) {
      this.state.tiles[tile] = TILE_BROKEN;
      breakBridgeTile(this.bw, tile);
      for (let k = 0; k < BRIDGE.tilesPerRow; k++) {
        if (k !== side) this.state.tiles[tileIndex(row, k)] = TILE_SAFE;
      }
      return true; // physics takes over: the player falls
    }
    if (this.state.tiles[tile] !== TILE_SAFE) this.state.tiles[tile] = TILE_SAFE;
    if (row + 1 > (this.progress.get(id) ?? 0)) {
      this.progress.set(id, row + 1);
      const p = this.ctx.players.find((pl) => pl.id === id);
      if (p) p.state.score = row + 1;
    }
    return false;
  }
}
