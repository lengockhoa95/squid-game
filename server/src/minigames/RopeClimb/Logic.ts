import {
  ROPE, ROPE_FINISH_Z, createRopeWorld, ropeSpawn, ropeStep, stationCenter, stationUnder,
  type GameAction, type RopeWorld, type StepFn,
} from '@sp/shared';
import { rankPlayers, type MinigameContext, type RoundOutcome, type ServerMinigame } from '../framework/types.ts';

/**
 * Leo Dây Nhện: cross swaying plank bridges between rising stations, fighting wind gusts.
 * Falling respawns on the highest station reached (Mạng Phụ: where you last stood).
 * PlayerState.score = stations reached.
 */
export class RopeClimb implements ServerMinigame {
  readonly id = 'ROPE_CLIMB' as const;
  readonly rw: RopeWorld = createRopeWorld();
  readonly step: StepFn = ropeStep(this.rw);
  readonly bounds = this.rw.world.bounds;
  private ctx!: MinigameContext;
  private readonly finishTimes = new Map<string, number>();
  private readonly station = new Map<string, number>();
  private readonly falls = new Map<string, number>();
  private readonly lastGround = new Map<string, { x: number; y: number; z: number }>();
  private readonly bestZ = new Map<string, number>();

  initialize(ctx: MinigameContext): void {
    this.ctx = ctx;
    for (const p of ctx.players) {
      const s = ropeSpawn(p.state.slot);
      p.sim.reset(s.x, s.z, s.yaw);
      this.station.set(p.id, 0);
      this.bestZ.set(p.id, s.z);
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
      if (s.y < ROPE.killY) {
        const spot = this.lastGround.get(p.id);
        if (spot && this.ctx.tryRescue?.(p.id)) {
          p.sim.reset(spot.x, spot.z, s.yaw);
          p.sim.state.y = spot.y;
          continue;
        }
        const c = stationCenter(this.station.get(p.id) ?? 0);
        p.sim.reset(c.x - 1.5 + p.state.slot, c.z, Math.PI);
        p.sim.state.y = c.y;
        this.falls.set(p.id, (this.falls.get(p.id) ?? 0) + 1);
        continue;
      }
      if (s.grounded) {
        const st = stationUnder(s.x, s.y, s.z);
        if (st > (this.station.get(p.id) ?? 0)) this.station.set(p.id, st);
        if (st >= 0) this.lastGround.set(p.id, { x: s.x, y: s.y, z: s.z });
        if (s.z < (this.bestZ.get(p.id) ?? 0)) this.bestZ.set(p.id, s.z);
        if (s.z <= ROPE_FINISH_Z && st === ROPE.stations - 1) {
          p.state.roundState = 'FINISHED';
          this.finishTimes.set(p.id, gameTime);
        }
      }
      p.state.score = this.station.get(p.id) ?? 0;
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
    const ranking = rankPlayers(this.ctx.players, this.finishTimes, (p) => -(this.bestZ.get(p.id) ?? 0));
    const passed = new Set(this.finishTimes.keys());
    if (passed.size === this.ctx.players.length && passed.size > 1) passed.delete(ranking[ranking.length - 1]!);
    const details = new Map<string, string>();
    for (const p of this.ctx.players) {
      const t = this.finishTimes.get(p.id);
      const falls = this.falls.get(p.id) ?? 0;
      const fallText = falls > 0 ? ` · rơi ${falls} lần` : '';
      if (t !== undefined) details.set(p.id, `Lên đỉnh sau ${t.toFixed(1)}s${fallText}`);
      else details.set(p.id, `Tới bệ ${(this.station.get(p.id) ?? 0) + 1}/${ROPE.stations}${fallText}`);
    }
    return { ranking, passed, details };
  }

  dispose(): void {}
}
