import { TUG, tugInZoneWithin, type GameAction } from '@sp/shared';
import { TugState } from '@sp/shared/schema';
import type { GamePlayer, MinigameContext, RoundOutcome, ServerMinigame } from '../framework/types.ts';

/**
 * Tug of War: two teams pull a rope. A pull timed inside the green zone of the shared timing cursor
 * is strong; off-beat pulls are weak and cause a short fatigue. Timing is judged on the server using
 * the server-measured latency. The losing team is eliminated. PlayerState.score = good pulls.
 */
export class TugOfWar implements ServerMinigame {
  readonly id = 'TUG_OF_WAR' as const;
  readonly step = null;
  private ctx!: MinigameContext;
  private state!: TugState;
  private readonly lastPull = new Map<string, number>();
  private readonly fatigueUntil = new Map<string, number>();
  private readonly goodPulls = new Map<string, number>();
  private readonly totalPulls = new Map<string, number>();
  private winner: 0 | 1 | null = null;

  initialize(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.state = new TugState();
    this.state.rope = 0;
    ctx.match.tug = this.state;
    // Shuffle then split evenly; the scheduler only picks this game for even player counts.
    const order = [...ctx.players].sort(() => ctx.rng() - 0.5);
    order.forEach((p, i) => {
      p.state.team = i % 2;
      p.state.score = 0;
      this.goodPulls.set(p.id, 0);
      this.totalPulls.set(p.id, 0);
    });
    this.layout();
  }

  start(): void {}

  handlePlayerInput(playerId: string, action: GameAction, gameTime: number): void {
    if (action.kind !== 'PULL' || this.winner !== null) return;
    const p = this.ctx.players.find((pl) => pl.id === playerId);
    if (!p || p.state.roundState !== 'ACTIVE' || p.state.team < 0) return;
    const nowMs = gameTime * 1000;
    if (nowMs - (this.lastPull.get(playerId) ?? -1e9) < TUG.minPullIntervalMs) return;
    this.lastPull.set(playerId, nowMs);
    this.totalPulls.set(playerId, (this.totalPulls.get(playerId) ?? 0) + 1);
    if (nowMs < (this.fatigueUntil.get(playerId) ?? 0)) return; // tired: this pull does nothing

    const latencyS = Math.min(this.ctx.rttOf(playerId) / 2, TUG.maxLatencyCompMs) / 1000;
    const onBeat = tugInZoneWithin(gameTime - latencyS, TUG.toleranceMs / 1000);
    const force = onBeat ? TUG.strongPull : TUG.weakPull;
    if (onBeat) {
      this.goodPulls.set(playerId, (this.goodPulls.get(playerId) ?? 0) + 1);
      p.state.score = this.goodPulls.get(playerId)!;
    } else {
      this.fatigueUntil.set(playerId, nowMs + TUG.fatigueMs);
    }
    const dir = p.state.team === 0 ? -1 : 1;
    this.state.rope = Math.max(-1, Math.min(1, this.state.rope + dir * force * TUG.ropeGain));
    if (this.state.rope <= -1) this.winner = 0;
    else if (this.state.rope >= 1) this.winner = 1;
  }

  update(): void {
    this.layout();
  }

  getState(): TugState {
    return this.state;
  }

  isFinished(): boolean {
    return this.winner !== null;
  }

  finish(): RoundOutcome {
    const rope = this.state.rope;
    const winningTeam = this.winner ?? (rope < 0 ? 0 : rope > 0 ? 1 : this.ctx.rng() < 0.5 ? 0 : 1);
    const byPulls = (a: GamePlayer, b: GamePlayer) => (this.goodPulls.get(b.id) ?? 0) - (this.goodPulls.get(a.id) ?? 0);
    const winners = this.ctx.players.filter((p) => p.state.team === winningTeam).sort(byPulls);
    const losers = this.ctx.players.filter((p) => p.state.team !== winningTeam).sort(byPulls);
    const details = new Map<string, string>();
    for (const p of this.ctx.players) {
      const good = this.goodPulls.get(p.id) ?? 0;
      const total = this.totalPulls.get(p.id) ?? 0;
      details.set(p.id, `${p.state.team === winningTeam ? 'Đội thắng' : 'Đội thua'} · ${good}/${total} cú kéo đúng nhịp`);
    }
    return { ranking: [...winners, ...losers].map((p) => p.id), passed: new Set(winners.map((p) => p.id)), details };
  }

  dispose(): void {
    this.ctx.match.tug = undefined;
  }

  /** Teams stand on either side of the centre; everyone shifts with the rope. */
  private layout(): void {
    const shift = this.state.rope * TUG.shift;
    const index = [0, 0];
    for (const p of this.ctx.players) {
      if (p.state.team < 0) continue;
      const team = p.state.team as 0 | 1;
      const side = team === 0 ? -1 : 1;
      const i = index[team]!++;
      p.state.x = shift + side * (TUG.teamGap + i * TUG.spacing);
      p.state.y = 0;
      p.state.z = 0;
      p.state.yaw = side < 0 ? Math.PI / 2 : -Math.PI / 2; // face the centre
      p.state.vx = 0;
      p.state.vz = 0;
      p.state.grounded = true;
    }
  }
}
