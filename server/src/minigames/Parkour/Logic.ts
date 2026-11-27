import {
  MOVEMENT, PARKOUR, createParkourWorld, parkourCheckpoint, parkourSpawn, parkourStep,
  type GameAction, type ParkourWorld, type StepFn,
} from '@sp/shared';
import { rankPlayers, type MinigameContext, type RoundOutcome, type ServerMinigame } from '../framework/types.ts';

/**
 * Parkour: a mixed obstacle course. Falling respawns at the last checkpoint; Mạng Phụ puts you back
 * where you last stood instead. Not finishing — or finishing last when everyone finishes — fails.
 */
export class Parkour implements ServerMinigame {
  readonly id = 'PARKOUR' as const;
  readonly pw: ParkourWorld = createParkourWorld();
  readonly step: StepFn = parkourStep(this.pw, MOVEMENT.radius);
  readonly bounds = this.pw.world.bounds;
  private ctx!: MinigameContext;
  private readonly finishTimes = new Map<string, number>();
  private readonly best = new Map<string, number>();
  private readonly falls = new Map<string, number>();
  private readonly lastGround = new Map<string, { x: number; y: number; z: number }>();

  initialize(ctx: MinigameContext): void {
    this.ctx = ctx;
    for (const p of ctx.players) {
      const s = parkourSpawn(p.state.slot);
      p.sim.reset(s.x, s.z, s.yaw);
      this.best.set(p.id, s.z);
    }
  }

  start(): void {}

  handlePlayerInput(_playerId: string, _action: GameAction): void {
    // Movement only.
  }

  update(_dt: number, gameTime: number): void {
    for (const p of this.ctx.players) {
      if (p.state.roundState !== 'ACTIVE') continue;
      const s = p.sim.state;
      if (s.y < PARKOUR.killY) {
        const spot = this.lastGround.get(p.id);
        if (spot && this.ctx.tryRescue?.(p.id)) {
          p.sim.reset(spot.x, spot.z, Math.PI);
          p.sim.state.y = spot.y;
          continue;
        }
        const cp = parkourCheckpoint(this.best.get(p.id) ?? PARKOUR.startZ);
        p.sim.reset(-1.5 + p.state.slot, cp.z, Math.PI);
        p.sim.state.y = cp.y;
        this.falls.set(p.id, (this.falls.get(p.id) ?? 0) + 1);
        continue;
      }
      if (s.grounded) {
        const g = this.lastGround.get(p.id) ?? { x: 0, y: 0, z: 0 };
        g.x = s.x;
        g.y = s.y;
        g.z = s.z;
        this.lastGround.set(p.id, g);
        if (s.z < (this.best.get(p.id) ?? PARKOUR.startZ)) this.best.set(p.id, s.z);
      }
      if (s.z <= PARKOUR.finishZ) {
        p.state.roundState = 'FINISHED';
        this.finishTimes.set(p.id, gameTime);
      }
      p.state.score = Math.max(0, PARKOUR.startZ - (this.best.get(p.id) ?? PARKOUR.startZ));
    }
  }

  getState(): null {
    return null;
  }

  isFinished(): boolean {
    const active = this.ctx.players.filter((p) => p.state.roundState === 'ACTIVE').length;
    return active === 0 || (active === 1 && this.finishTimes.size > 0 && this.ctx.players.length > 1);
  }

  finish(): RoundOutcome {
    const ranking = rankPlayers(this.ctx.players, this.finishTimes, (p) => -(this.best.get(p.id) ?? PARKOUR.startZ));
    const passed = new Set(this.finishTimes.keys());
    if (passed.size === this.ctx.players.length && passed.size > 1) passed.delete(ranking[ranking.length - 1]!);
    const details = new Map<string, string>();
    for (const p of this.ctx.players) {
      const t = this.finishTimes.get(p.id);
      const falls = this.falls.get(p.id) ?? 0;
      const fallText = falls > 0 ? ` · rơi ${falls} lần` : '';
      if (t !== undefined) details.set(p.id, `Về đích sau ${t.toFixed(1)}s${fallText}`);
      else details.set(p.id, `Chưa về đích (còn ${Math.max(0, (this.best.get(p.id) ?? 0) - PARKOUR.finishZ).toFixed(0)}m)${fallText}`);
    }
    if (passed.size < this.finishTimes.size) {
      const last = ranking[ranking.length - 1]!;
      details.set(last, `${details.get(last)} · về chót`);
    }
    return { ranking, passed, details };
  }

  dispose(): void {}
}
