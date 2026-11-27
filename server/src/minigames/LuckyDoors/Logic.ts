import {
  DOORS, DOORS_FINISH_Z, DOOR_FAKE, DOOR_REAL, DOOR_UNKNOWN,
  addFakeDoor, createDoorsWorld, doorIndex, doorRowZ, doorX, doorsSpawn, doorsStep,
  type GameAction, type StepFn,
} from '@sp/shared';
import { DoorsState } from '@sp/shared/schema';
import { rankPlayers, type GamePlayer, type MinigameContext, type RoundOutcome, type ServerMinigame } from '../framework/types.ts';

/**
 * Cửa Thần May Mắn: run through rows of doors; fake ones are solid and bounce you back (stunned).
 * The real/fake pattern lives only here; doors are revealed as players hit or pass them.
 * PlayerState.score = rows passed.
 */
export class LuckyDoors implements ServerMinigame {
  readonly id = 'LUCKY_DOORS' as const;
  private readonly world = createDoorsWorld();
  readonly step: StepFn = doorsStep(this.world);
  readonly bounds = this.world.bounds;
  private ctx!: MinigameContext;
  private state!: DoorsState;
  /** real[row][k] */
  private real: boolean[][] = [];
  private readonly finishTimes = new Map<string, number>();
  private readonly passed = new Map<string, number>();
  private readonly bonks = new Map<string, number>();

  initialize(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.state = new DoorsState();
    for (let i = 0; i < DOORS.rows * DOORS.perRow; i++) this.state.tiles.push(DOOR_UNKNOWN);
    ctx.match.doors = this.state;
    this.real = [];
    for (let row = 0; row < DOORS.rows; row++) {
      const order = [0, 1, 2, 3].sort(() => ctx.rng() - 0.5);
      const realSet = new Set(order.slice(0, DOORS.realPerRow));
      this.real.push([0, 1, 2, 3].map((k) => realSet.has(k)));
      for (let k = 0; k < DOORS.perRow; k++) if (!realSet.has(k)) addFakeDoor(this.world, row, k);
    }
    for (const p of ctx.players) {
      const s = doorsSpawn(p.state.slot);
      p.sim.reset(s.x, s.z, s.yaw);
      this.passed.set(p.id, 0);
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
      const next = this.passed.get(p.id) ?? 0;
      if (next < DOORS.rows) {
        const z = doorRowZ(next);
        const k = this.doorAt(s.x);
        if (k >= 0 && s.y < DOORS.wallHeight) {
          if (!this.real[next]![k] && s.z - (z + DOORS.wallDepth / 2) < 0.5 && s.z > z) this.bonk(p, next, k, gameTime);
          else if (this.real[next]![k] && s.z < z - 0.3) this.pass(p, next, k);
        }
        if (s.z < z - 0.3 && (this.passed.get(p.id) ?? 0) === next) this.passed.set(p.id, next + 1); // squeezed past
      }
      p.state.score = this.passed.get(p.id) ?? 0;
      if (s.z <= DOORS_FINISH_Z) {
        p.state.roundState = 'FINISHED';
        this.finishTimes.set(p.id, gameTime);
      }
    }
  }

  /** Public view for bots: revealed doors (same as everyone sees). */
  revealed(row: number, k: number): number {
    return this.state.tiles[doorIndex(row, k)] ?? DOOR_UNKNOWN;
  }

  rowsPassed(id: string): number {
    return this.passed.get(id) ?? 0;
  }

  getState(): DoorsState {
    return this.state;
  }

  isFinished(): boolean {
    const active = this.ctx.players.filter((p) => p.state.roundState === 'ACTIVE').length;
    return active === 0 || (active === 1 && this.finishTimes.size > 0 && this.ctx.players.length > 1);
  }

  finish(): RoundOutcome {
    const ranking = rankPlayers(this.ctx.players, this.finishTimes, (p) => this.passed.get(p.id) ?? 0);
    const passed = new Set(this.finishTimes.keys());
    if (passed.size === this.ctx.players.length && passed.size > 1) passed.delete(ranking[ranking.length - 1]!);
    const details = new Map<string, string>();
    for (const p of this.ctx.players) {
      const t = this.finishTimes.get(p.id);
      const bonks = this.bonks.get(p.id) ?? 0;
      const bonkText = bonks > 0 ? ` · đâm cửa giả ${bonks} lần` : '';
      if (t !== undefined) details.set(p.id, `Về đích sau ${t.toFixed(1)}s${bonkText}`);
      else details.set(p.id, `Qua ${this.passed.get(p.id) ?? 0}/${DOORS.rows} hàng cửa${bonkText}`);
    }
    return { ranking, passed, details };
  }

  dispose(): void {
    this.ctx.match.doors = undefined;
  }

  private doorAt(x: number): number {
    for (let k = 0; k < DOORS.perRow; k++) if (Math.abs(x - doorX(k)) <= DOORS.doorWidth / 2) return k;
    return -1;
  }

  private bonk(p: GamePlayer, row: number, k: number, t: number): void {
    if (t < p.state.stunUntil) return;
    this.state.tiles[doorIndex(row, k)] = DOOR_FAKE;
    const s = p.sim.state;
    s.vz = DOORS.bounceSpeed;
    s.vy = 4;
    s.grounded = false;
    p.state.stunUntil = t + DOORS.stunSeconds;
    this.bonks.set(p.id, (this.bonks.get(p.id) ?? 0) + 1);
  }

  private pass(p: GamePlayer, row: number, k: number): void {
    this.state.tiles[doorIndex(row, k)] = DOOR_REAL;
    this.passed.set(p.id, row + 1);
  }
}
