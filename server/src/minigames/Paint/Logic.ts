import {
  PAINT_CELL_COUNT, createPaintWorld, paintCellAt, paintSpawn, paintStep,
  type GameAction, type StepFn,
} from '@sp/shared';
import { PaintState } from '@sp/shared/schema';
import type { MinigameContext, RoundOutcome, ServerMinigame } from '../framework/types.ts';

/**
 * Sơn Lãnh Thổ: every grounded player paints the cell under them. When time runs out the player
 * with the fewest cells fails (everyone else passes). PlayerState.score = cells owned.
 */
export class Paint implements ServerMinigame {
  readonly id = 'PAINT' as const;
  private readonly world = createPaintWorld();
  readonly step: StepFn = paintStep(this.world);
  readonly bounds = this.world.bounds;
  private ctx!: MinigameContext;
  private state!: PaintState;
  private readonly counts = new Map<number, number>();

  initialize(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.state = new PaintState();
    for (let i = 0; i < PAINT_CELL_COUNT; i++) this.state.cells.push(0);
    ctx.match.paint = this.state;
    this.counts.clear();
    for (const p of ctx.players) {
      const s = paintSpawn(p.state.slot);
      p.sim.reset(s.x, s.z, s.yaw);
      p.state.score = 0;
    }
  }

  start(): void {}

  handlePlayerInput(_playerId: string, _action: GameAction): void {
    // Movement only.
  }

  update(): void {
    for (const p of this.ctx.players) {
      if (p.state.roundState !== 'ACTIVE') continue;
      const s = p.sim.state;
      if (!s.grounded) continue;
      const i = paintCellAt(s.x, s.z);
      if (i < 0) continue;
      const mine = p.state.slot + 1;
      const prev = this.state.cells[i]!;
      if (prev === mine) continue;
      this.state.cells[i] = mine;
      this.counts.set(mine, (this.counts.get(mine) ?? 0) + 1);
      if (prev) this.counts.set(prev, (this.counts.get(prev) ?? 0) - 1);
    }
    for (const p of this.ctx.players) p.state.score = this.counts.get(p.state.slot + 1) ?? 0;
  }

  /** Public for bots: owner of a cell (everyone sees the floor). */
  owner(i: number): number {
    return this.state.cells[i] ?? 0;
  }

  getState(): PaintState {
    return this.state;
  }

  isFinished(): boolean {
    return this.ctx.players.filter((p) => p.state.roundState === 'ACTIVE').length <= (this.ctx.players.length > 1 ? 1 : 0);
  }

  finish(): RoundOutcome {
    const ranking = [...this.ctx.players]
      .sort((a, b) => b.state.score - a.state.score || (a.state.roundState === 'ACTIVE' ? -1 : 1))
      .map((p) => p.id);
    const passed = new Set(ranking);
    if (ranking.length > 1) passed.delete(ranking[ranking.length - 1]!);
    const details = new Map<string, string>();
    for (const p of this.ctx.players) details.set(p.id, `Phủ ${p.state.score} ô`);
    return { ranking, passed, details };
  }

  dispose(): void {
    this.ctx.match.paint = undefined;
  }
}
