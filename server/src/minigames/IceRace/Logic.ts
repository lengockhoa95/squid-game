import {
  ICE, ICE_LENGTH, createIceWorld, iceCheckpoint, iceProgress, iceSpawn, iceStep,
  type GameAction, type StepFn,
} from '@sp/shared';
import { rankPlayers, type MinigameContext, type RoundOutcome, type ServerMinigame } from '../framework/types.ts';

/**
 * Đua Băng Trơn: race along a winding ice track. Little grip: you slide wide in corners and off
 * the edge (respawn at the last checkpoint). Finishing last — or not at all — fails.
 * PlayerState.score = metres along the track.
 */
export class IceRace implements ServerMinigame {
  readonly id = 'ICE_RACE' as const;
  private readonly world = createIceWorld();
  readonly step: StepFn = iceStep(this.world);
  readonly bounds = this.world.bounds;
  private ctx!: MinigameContext;
  private readonly finishTimes = new Map<string, number>();
  private readonly best = new Map<string, number>();
  private readonly falls = new Map<string, number>();
  private readonly lastGround = new Map<string, { x: number; z: number }>();

  initialize(ctx: MinigameContext): void {
    this.ctx = ctx;
    for (const p of ctx.players) {
      const s = iceSpawn(p.state.slot);
      p.sim.reset(s.x, s.z, s.yaw);
      this.best.set(p.id, 0);
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
      if (s.y < ICE.killY) {
        const spot = this.lastGround.get(p.id);
        if (spot && this.ctx.tryRescue?.(p.id)) {
          p.sim.reset(spot.x, spot.z, s.yaw);
          continue;
        }
        const cp = iceCheckpoint(this.best.get(p.id) ?? 0);
        p.sim.reset(cp.x - 1.5 + p.state.slot, cp.z, s.yaw);
        this.falls.set(p.id, (this.falls.get(p.id) ?? 0) + 1);
        continue;
      }
      if (s.grounded && s.y > -0.05) {
        const g = this.lastGround.get(p.id) ?? { x: 0, z: 0 };
        g.x = s.x;
        g.z = s.z;
        this.lastGround.set(p.id, g);
        const progress = iceProgress(s.x, s.z);
        // Only count forward progress made on the track (no shortcuts across the void).
        if (progress > (this.best.get(p.id) ?? 0) && progress < (this.best.get(p.id) ?? 0) + 6) this.best.set(p.id, progress);
      }
      const best = this.best.get(p.id) ?? 0;
      p.state.score = Math.floor(best);
      if (best >= ICE_LENGTH - ICE.finishMargin) {
        p.state.roundState = 'FINISHED';
        this.finishTimes.set(p.id, gameTime);
      }
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
    const ranking = rankPlayers(this.ctx.players, this.finishTimes, (p) => this.best.get(p.id) ?? 0);
    const passed = new Set(this.finishTimes.keys());
    if (passed.size === this.ctx.players.length && passed.size > 1) passed.delete(ranking[ranking.length - 1]!);
    const details = new Map<string, string>();
    for (const p of this.ctx.players) {
      const t = this.finishTimes.get(p.id);
      const falls = this.falls.get(p.id) ?? 0;
      const fallText = falls > 0 ? ` · trượt ra ngoài ${falls} lần` : '';
      if (t !== undefined) details.set(p.id, `Về đích sau ${t.toFixed(1)}s${fallText}`);
      else details.set(p.id, `Chưa về đích (còn ${Math.max(0, ICE_LENGTH - (this.best.get(p.id) ?? 0)).toFixed(0)}m)${fallText}`);
    }
    return { ranking, passed, details };
  }

  dispose(): void {}
}
