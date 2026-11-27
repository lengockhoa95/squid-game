import {
  TOWER, TOWER_PLATFORMS, createTowerWorld, ghostIsSolid, lavaHeight, platformCenter, platformUnder, towerSpawn, towerStep,
  type GameAction, type StepFn, type TowerWorld,
} from '@sp/shared';
import { rankPlayers, type MinigameContext, type RoundOutcome, type ServerMinigame } from '../framework/types.ts';

/**
 * Tháp Leo: climb a spiral of platforms (some slide, some vanish) to the top before the rising
 * lava catches you. Reaching the top platform passes; touching lava is out.
 * PlayerState.score = highest platform reached.
 */
export class TowerClimb implements ServerMinigame {
  readonly id = 'TOWER_CLIMB' as const;
  readonly tw: TowerWorld = createTowerWorld();
  readonly step: StepFn = towerStep(this.tw);
  readonly bounds = this.tw.world.bounds;
  private ctx!: MinigameContext;
  private readonly finishTimes = new Map<string, number>();
  private readonly best = new Map<string, number>();
  private readonly burned = new Map<string, number>();

  initialize(ctx: MinigameContext): void {
    this.ctx = ctx;
    for (const p of ctx.players) {
      const s = towerSpawn(p.state.slot);
      p.sim.reset(s.x, s.z, s.yaw);
      this.best.set(p.id, -1);
    }
  }

  start(): void {}

  handlePlayerInput(_playerId: string, _action: GameAction): void {
    // Movement only.
  }

  update(_dt: number, gameTime: number): void {
    const lava = lavaHeight(gameTime);
    for (const p of this.ctx.players) {
      if (p.state.roundState !== 'ACTIVE') continue;
      const s = p.sim.state;
      const on = platformUnder(this.tw, s);
      if (on >= 0 && on > (this.best.get(p.id) ?? -1)) this.best.set(p.id, on);
      p.state.score = (this.best.get(p.id) ?? -1) + 1;
      if (on === TOWER.platforms - 1) {
        p.state.roundState = 'FINISHED';
        this.finishTimes.set(p.id, gameTime);
        continue;
      }
      if (s.y < lava) {
        const safe = this.safePlatform(lava, gameTime);
        if (safe >= 0 && this.ctx.tryRescue?.(p.id)) {
          const c = platformCenter(TOWER_PLATFORMS[safe]!, gameTime);
          p.sim.reset(c.x, c.z, s.yaw);
          p.sim.state.y = TOWER_PLATFORMS[safe]!.y;
          continue;
        }
        p.state.roundState = 'OUT';
        this.burned.set(p.id, gameTime);
      }
    }
  }

  getState(): null {
    return null;
  }

  isFinished(): boolean {
    return this.ctx.players.every((p) => p.state.roundState !== 'ACTIVE');
  }

  finish(): RoundOutcome {
    const ranking = rankPlayers(this.ctx.players, this.finishTimes, (p) => this.best.get(p.id) ?? -1);
    const passed = new Set(this.finishTimes.keys());
    // Everyone made it: the slowest climber still fails (like the race).
    if (passed.size === this.ctx.players.length && passed.size > 1) passed.delete(ranking[ranking.length - 1]!);
    const details = new Map<string, string>();
    for (const p of this.ctx.players) {
      const t = this.finishTimes.get(p.id);
      const reached = (this.best.get(p.id) ?? -1) + 1;
      if (t !== undefined) details.set(p.id, `Lên đỉnh sau ${t.toFixed(1)}s`);
      else if (this.burned.has(p.id)) details.set(p.id, `Rơi vào dung nham ở bục ${reached}/${TOWER.platforms}`);
      else details.set(p.id, `Chưa lên đỉnh (bục ${reached}/${TOWER.platforms})`);
    }
    return { ranking, passed, details };
  }

  dispose(): void {}

  /** Lowest solid platform comfortably above the lava (rescue landing spot). */
  private safePlatform(lava: number, t: number): number {
    for (const p of TOWER_PLATFORMS) {
      if (p.y > lava + 3 && (p.kind !== 'ghost' || ghostIsSolid(p, t)) && p.kind !== 'moving') return p.index;
    }
    return -1;
  }
}
