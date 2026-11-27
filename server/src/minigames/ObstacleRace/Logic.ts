import { MOVEMENT, RACE, createRaceWorld, raceCheckpoint, raceSpawn, raceStep, type GameAction, type StepFn } from '@sp/shared';
import { rankPlayers, type MinigameContext, type RoundOutcome, type ServerMinigame } from '../framework/types.ts';

/**
 * Obstacle Race: run to the finish past gaps, low walls, pushers and sweepers.
 * Falling respawns at the last checkpoint. Not finishing — or finishing last when everyone
 * finishes — fails the round.
 */
export class ObstacleRace implements ServerMinigame {
  readonly id = 'OBSTACLE_RACE' as const;
  private readonly raceWorld = createRaceWorld();
  readonly step: StepFn = raceStep(this.raceWorld, MOVEMENT.radius);
  readonly bounds = this.raceWorld.world.bounds;
  private ctx!: MinigameContext;
  private readonly finishTimes = new Map<string, number>();
  private readonly best = new Map<string, number>(); // furthest z reached (lower = further)
  private readonly falls = new Map<string, number>();
  /** Last spot each runner stood on (rescue respawn point). */
  private readonly lastGround = new Map<string, { x: number; z: number }>();

  initialize(ctx: MinigameContext): void {
    this.ctx = ctx;
    for (const p of ctx.players) {
      const s = raceSpawn(p.state.slot);
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
      if (s.y < RACE.killY) {
        const spot = this.lastGround.get(p.id);
        if (spot && this.ctx.tryRescue?.(p.id)) {
          p.sim.reset(spot.x, spot.z, Math.PI); // Mạng Phụ: back where you last stood
          continue;
        }
        const cp = raceCheckpoint(this.best.get(p.id) ?? RACE.startZ);
        p.sim.reset(-3 + p.state.slot * 2, cp - 0.5, Math.PI);
        this.falls.set(p.id, (this.falls.get(p.id) ?? 0) + 1);
        continue;
      }
      if (s.grounded && s.y > -0.05) {
        const g = this.lastGround.get(p.id);
        if (g) {
          g.x = s.x;
          g.z = s.z;
        } else {
          this.lastGround.set(p.id, { x: s.x, z: s.z });
        }
      }
      if (s.z < (this.best.get(p.id) ?? RACE.startZ)) this.best.set(p.id, s.z);
      if (s.z <= RACE.finishZ) {
        p.state.roundState = 'FINISHED';
        this.finishTimes.set(p.id, gameTime);
      }
      p.state.score = Math.max(0, RACE.startZ - (this.best.get(p.id) ?? RACE.startZ));
    }
  }

  getState(): null {
    return null;
  }

  isFinished(): boolean {
    const active = this.ctx.players.filter((p) => p.state.roundState === 'ACTIVE').length;
    // Once only one runner is left and someone finished, that runner is last anyway.
    return active === 0 || (active === 1 && this.finishTimes.size > 0 && this.ctx.players.length > 1);
  }

  finish(): RoundOutcome {
    const ranking = rankPlayers(this.ctx.players, this.finishTimes, (p) => -(this.best.get(p.id) ?? RACE.startZ));
    const passed = new Set(this.finishTimes.keys());
    const details = new Map<string, string>();
    // If everyone finished, the slowest finisher fails.
    if (passed.size === this.ctx.players.length && this.ctx.players.length > 1) {
      const last = ranking[ranking.length - 1]!;
      passed.delete(last);
      details.set(last, `Về đích chậm nhất (${this.finishTimes.get(last)!.toFixed(1)}s)`);
    }
    for (const p of this.ctx.players) {
      if (details.has(p.id)) continue;
      const t = this.finishTimes.get(p.id);
      const falls = this.falls.get(p.id) ?? 0;
      const fallText = falls > 0 ? ` · rơi ${falls} lần` : '';
      if (t !== undefined) details.set(p.id, `Về đích sau ${t.toFixed(1)}s${fallText}`);
      else details.set(p.id, `Chưa về đích (còn ${Math.max(0, (this.best.get(p.id) ?? 0) - RACE.finishZ).toFixed(0)}m)${fallText}`);
    }
    return { ranking, passed, details };
  }

  dispose(): void {}
}
