import { REACTION, type GameAction, type ReactionStage } from '@sp/shared';
import { ReactionState } from '@sp/shared/schema';
import type { MinigameContext, RoundOutcome, ServerMinigame } from '../framework/types.ts';

/**
 * Quick Reaction: 3 attempts of READY → (random wait) → GO. Reaction time is measured by the server
 * from when GO was sent, minus half the server-measured RTT. Pressing before GO (or impossibly fast)
 * counts as a false start. Total time ranks players; the slowest fails. PlayerState.score = total ms.
 */
export class QuickReaction implements ServerMinigame {
  readonly id = 'QUICK_REACTION' as const;
  readonly step = null;
  private ctx!: MinigameContext;
  private state!: ReactionState;
  private stage: ReactionStage = 'WAIT';
  private stageElapsed = 0;
  private stageDuration = 0;
  private goAt = 0;
  private readonly times = new Map<string, number[]>();
  private readonly pressedThisAttempt = new Set<string>();
  private readonly falseStarts = new Map<string, number>();

  initialize(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.state = new ReactionState();
    ctx.match.reaction = this.state;
    const n = ctx.players.length;
    ctx.players.forEach((p, i) => {
      p.state.x = (i - (n - 1) / 2) * 2.2;
      p.state.y = 0;
      p.state.z = 0;
      p.state.yaw = Math.PI;
      p.state.vx = 0;
      p.state.vz = 0;
      p.state.grounded = true;
      p.state.score = 0;
      this.times.set(p.id, []);
    });
    this.state.attempt = 1;
    this.setStage('WAIT');
  }

  start(): void {
    this.setStage('WAIT');
  }

  handlePlayerInput(playerId: string, action: GameAction, gameTime: number): void {
    if (action.kind !== 'REACT' || this.pressedThisAttempt.has(playerId)) return;
    const p = this.ctx.players.find((pl) => pl.id === playerId);
    if (!p || p.state.roundState !== 'ACTIVE') return;
    if (this.stage === 'WAIT') {
      this.record(playerId, REACTION.falseStartMs, true);
    } else if (this.stage === 'GO') {
      const latency = Math.min(this.ctx.rttOf(playerId) / 2, REACTION.maxLatencyCompMs);
      const ms = (gameTime - this.goAt) * 1000 - latency;
      this.record(playerId, ms < REACTION.minHumanMs ? REACTION.falseStartMs : Math.round(ms), ms < REACTION.minHumanMs);
    }
  }

  update(dt: number, gameTime: number): void {
    if (this.stage === 'DONE') return;
    this.stageElapsed += dt;
    if (this.stage === 'GO' && this.everyonePressed()) this.stageElapsed = this.stageDuration;
    if (this.stageElapsed < this.stageDuration) return;
    if (this.stage === 'WAIT') {
      this.goAt = gameTime;
      this.setStage('GO');
    } else if (this.stage === 'GO') {
      for (const p of this.ctx.players) if (!this.pressedThisAttempt.has(p.id)) this.record(p.id, REACTION.missMs, false);
      this.setStage(this.state.attempt >= REACTION.attempts ? 'DONE' : 'BREAK');
    } else if (this.stage === 'BREAK') {
      this.state.attempt += 1;
      this.setStage('WAIT');
    }
  }

  /** Public info for bots: the stage they can see on the big screen. */
  get publicStage(): { stage: ReactionStage; attempt: number; pressed: (id: string) => boolean } {
    return { stage: this.stage, attempt: this.state.attempt, pressed: (id) => this.pressedThisAttempt.has(id) };
  }

  getState(): ReactionState {
    return this.state;
  }

  isFinished(): boolean {
    return this.stage === 'DONE';
  }

  finish(): RoundOutcome {
    const total = (id: string) => {
      const list = this.times.get(id) ?? [];
      let sum = 0;
      for (let k = 0; k < REACTION.attempts; k++) sum += list[k] ?? REACTION.missMs;
      return sum;
    };
    const ranking = [...this.ctx.players].sort((a, b) => total(a.id) - total(b.id)).map((p) => p.id);
    const slowest = ranking[ranking.length - 1];
    const passed = new Set(ranking.filter((id) => id !== slowest || ranking.length === 1));
    const details = new Map<string, string>();
    for (const p of this.ctx.players) {
      const fs = this.falseStarts.get(p.id) ?? 0;
      details.set(p.id, `Tổng ${total(p.id)}ms${fs > 0 ? ` · bấm sớm ${fs} lần` : ''}${p.id === slowest ? ' · chậm nhất' : ''}`);
    }
    return { ranking, passed, details };
  }

  dispose(): void {
    this.ctx.match.reaction = undefined;
  }

  private record(id: string, ms: number, falseStart: boolean): void {
    this.pressedThisAttempt.add(id);
    const list = this.times.get(id) ?? [];
    list.push(ms);
    this.times.set(id, list);
    if (falseStart) this.falseStarts.set(id, (this.falseStarts.get(id) ?? 0) + 1);
    const p = this.ctx.players.find((pl) => pl.id === id);
    if (p) p.state.score = list.reduce((a, b) => a + b, 0);
  }

  private everyonePressed(): boolean {
    return this.ctx.players.every((p) => this.pressedThisAttempt.has(p.id) || p.state.roundState !== 'ACTIVE');
  }

  private setStage(stage: ReactionStage): void {
    this.stage = stage;
    this.state.stage = stage;
    this.stageElapsed = 0;
    if (stage === 'WAIT') {
      this.pressedThisAttempt.clear();
      this.stageDuration = REACTION.waitMinS + this.ctx.rng() * (REACTION.waitMaxS - REACTION.waitMinS);
    } else if (stage === 'GO') {
      this.stageDuration = REACTION.goWindowS;
    } else if (stage === 'BREAK') {
      this.stageDuration = REACTION.gapS;
    } else {
      this.stageDuration = 0;
    }
  }
}
