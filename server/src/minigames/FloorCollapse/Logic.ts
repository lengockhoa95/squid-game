import {
  COLLAPSE, COLLAPSE_TILE_COUNT, TILE_CRACKING, TILE_GONE, TILE_SOLID,
  collapseSpawn, collapseStep, createCollapseWorld, dropTile, tileAt, tileCenter,
  type GameAction, type StepFn,
} from '@sp/shared';
import { CollapseState } from '@sp/shared/schema';
import type { MinigameContext, RoundOutcome, ServerMinigame } from '../framework/types.ts';

/**
 * Sàn Sụp: three stacked floors of tiles. A tile someone stands on cracks and drops shortly after.
 * Falling through the last floor is out; the last one standing (or everyone still up when time
 * runs out) passes. PlayerState.score = seconds survived.
 */
export class FloorCollapse implements ServerMinigame {
  readonly id = 'FLOOR_COLLAPSE' as const;
  private readonly cw = createCollapseWorld();
  readonly step: StepFn = collapseStep(this.cw);
  readonly bounds = this.cw.world.bounds;
  private ctx!: MinigameContext;
  private state!: CollapseState;
  /** Game time each cracking tile drops at. */
  private readonly dropAt = new Map<number, number>();
  private readonly fellAt = new Map<string, number>();
  private elapsed = 0;

  initialize(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.state = new CollapseState();
    for (let i = 0; i < COLLAPSE_TILE_COUNT; i++) this.state.tiles.push(TILE_SOLID);
    ctx.match.collapse = this.state;
    for (const p of ctx.players) {
      const s = collapseSpawn(p.state.slot);
      p.sim.reset(s.x, s.z, s.yaw);
    }
  }

  start(): void {}

  handlePlayerInput(_playerId: string, _action: GameAction): void {
    // Movement only.
  }

  update(dt: number, gameTime: number): void {
    this.elapsed = gameTime;
    // Tiles under active players start cracking.
    for (const p of this.ctx.players) {
      if (p.state.roundState !== 'ACTIVE') continue;
      const s = p.sim.state;
      if (s.grounded) {
        const i = tileAt(s.x, s.y, s.z);
        if (i >= 0 && this.state.tiles[i] === TILE_SOLID) this.crack(i, gameTime);
      }
    }
    for (const [i, at] of this.dropAt) {
      if (gameTime < at) continue;
      this.dropAt.delete(i);
      this.state.tiles[i] = TILE_GONE;
      dropTile(this.cw, i);
    }
    for (const p of this.ctx.players) {
      if (p.state.roundState !== 'ACTIVE') continue;
      const s = p.sim.state;
      if (s.y < COLLAPSE.killY) {
        if (this.ctx.tryRescue?.(p.id)) {
          const spot = this.safeTile();
          if (spot >= 0) {
            const c = tileCenter(spot);
            p.sim.reset(c.x, c.z, s.yaw);
            p.sim.state.y = c.y;
            continue;
          }
        }
        p.state.roundState = 'OUT';
        this.fellAt.set(p.id, gameTime);
        continue;
      }
      p.state.score = Math.floor(gameTime);
    }
    void dt;
  }

  /** Public view for bots (what everyone sees). */
  tileState(i: number): number {
    return this.state.tiles[i] ?? TILE_GONE;
  }

  getState(): CollapseState {
    return this.state;
  }

  isFinished(): boolean {
    const active = this.ctx.players.filter((p) => p.state.roundState === 'ACTIVE').length;
    return active === 0 || (active === 1 && this.ctx.players.length > 1);
  }

  finish(): RoundOutcome {
    const survivors = this.ctx.players.filter((p) => p.state.roundState === 'ACTIVE');
    const fallen = this.ctx.players
      .filter((p) => p.state.roundState !== 'ACTIVE')
      .sort((a, b) => (this.fellAt.get(b.id) ?? 0) - (this.fellAt.get(a.id) ?? 0));
    const ranking = [...survivors, ...fallen].map((p) => p.id);
    const passed = new Set(survivors.map((p) => p.id));
    const details = new Map<string, string>();
    for (const p of survivors) details.set(p.id, `Trụ đến cuối (${Math.floor(this.elapsed)}s)`);
    for (const p of fallen) details.set(p.id, `Rơi sau ${(this.fellAt.get(p.id) ?? 0).toFixed(1)}s`);
    return { ranking, passed, details };
  }

  dispose(): void {
    this.ctx.match.collapse = undefined;
  }

  private crack(i: number, t: number): void {
    this.state.tiles[i] = TILE_CRACKING;
    this.dropAt.set(i, t + COLLAPSE.crackSeconds);
  }

  /** A solid tile on the highest floor that still has one (rescue landing spot). */
  private safeTile(): number {
    const solid: number[] = [];
    for (let i = 0; i < COLLAPSE_TILE_COUNT; i++) if (this.state.tiles[i] === TILE_SOLID) solid.push(i);
    return solid.length === 0 ? -1 : solid[Math.floor(this.ctx.rng() * Math.min(solid.length, 40))]!;
  }
}
