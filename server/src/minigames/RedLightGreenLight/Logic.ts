import { RLGL, createRlglWorld, rlglSpawn, staticWorldStep, type GameAction, type LightColor, type StepFn } from '@sp/shared';
import { RlglState } from '@sp/shared/schema';
import { rankPlayers, type GamePlayer, type MinigameContext, type RoundOutcome, type ServerMinigame } from '../framework/types.ts';

/**
 * Red Light Green Light: walk to the finish while the light is green; anyone still moving
 * after the grace period of a red light is caught (OUT). Reaching the finish line passes.
 */
export class RedLightGreenLight implements ServerMinigame {
  readonly id = 'RLGL' as const;
  readonly step: StepFn = staticWorldStep(createRlglWorld());
  private ctx!: MinigameContext;
  private state!: RlglState;
  private light: LightColor = 'GREEN';
  private lightElapsed = 0;
  private lightDuration = 0;
  private readonly finishTimes = new Map<string, number>();
  private readonly caught = new Set<string>();

  initialize(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.state = new RlglState();
    ctx.match.rlgl = this.state;
    for (const p of ctx.players) {
      const spawn = rlglSpawn(p.state.slot);
      p.sim.reset(spawn.x, spawn.z, spawn.yaw);
    }
    this.setLight('GREEN');
  }

  start(): void {
    this.setLight('GREEN');
  }

  handlePlayerInput(_playerId: string, _action: GameAction): void {
    // Movement only: inputs arrive through MOVE messages / PlayerSim.
  }

  update(dt: number, gameTime: number): void {
    this.lightElapsed += dt;
    if (this.lightElapsed >= this.lightDuration) this.setLight(this.light === 'GREEN' ? 'RED' : 'GREEN');
    this.state.songProgress = this.light === 'GREEN' ? Math.min(1, this.lightElapsed / this.lightDuration) : 1;

    for (const p of this.ctx.players) {
      if (p.state.roundState !== 'ACTIVE') continue;
      const s = p.sim.state;
      if (s.z <= RLGL.finishZ) {
        p.state.roundState = 'FINISHED';
        this.finishTimes.set(p.id, gameTime);
        continue;
      }
      if (this.light === 'RED' && this.isCaught(p)) {
        p.state.roundState = 'OUT';
        this.caught.add(p.id);
      }
      p.state.score = Math.max(0, RLGL.startZ - s.z);
    }
  }

  getState(): RlglState {
    return this.state;
  }

  /** Public view for NPCs: what a player sees on screen. */
  get publicLight(): { light: LightColor; songProgress: number; redElapsed: number } {
    return { light: this.light, songProgress: this.state.songProgress, redElapsed: this.light === 'RED' ? this.lightElapsed : 0 };
  }

  isFinished(): boolean {
    return this.ctx.players.every((p) => p.state.roundState !== 'ACTIVE');
  }

  finish(): RoundOutcome {
    const ranking = rankPlayers(this.ctx.players, this.finishTimes, (p) => -p.sim.state.z);
    const details = new Map<string, string>();
    const passed = new Set<string>();
    for (const p of this.ctx.players) {
      const t = this.finishTimes.get(p.id);
      if (t !== undefined) {
        passed.add(p.id);
        details.set(p.id, `Về đích sau ${t.toFixed(1)}s`);
      } else if (this.caught.has(p.id)) {
        details.set(p.id, 'Bị phát hiện khi đèn đỏ');
      } else {
        details.set(p.id, `Chưa về đích (còn ${Math.max(0, p.sim.state.z - RLGL.finishZ).toFixed(1)}m)`);
      }
    }
    return { ranking, passed, details };
  }

  dispose(): void {
    this.ctx.match.rlgl = undefined;
  }

  private isCaught(p: GamePlayer): boolean {
    const latencyComp = Math.min(this.ctx.rttOf(p.id) / 2, RLGL.maxLatencyCompMs);
    if (this.lightElapsed * 1000 < RLGL.graceMs + latencyComp) return false;
    const s = p.sim.state;
    return Math.hypot(s.vx, s.vz) > RLGL.moveThreshold;
  }

  private setLight(light: LightColor): void {
    this.light = light;
    this.state.light = light;
    this.lightElapsed = 0;
    const [min, max] = light === 'GREEN' ? [RLGL.greenMinS, RLGL.greenMaxS] : [RLGL.redMinS, RLGL.redMaxS];
    this.lightDuration = min + this.ctx.rng() * (max - min);
  }
}
