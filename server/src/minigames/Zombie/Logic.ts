import {
  TEAM_HUMAN, TEAM_ZOMBIE, ZOMBIE, createZombieWorld, zombieSpawn, zombieStep,
  type GameAction, type StepFn,
} from '@sp/shared';
import { type GamePlayer, type MinigameContext, type RoundOutcome, type ServerMinigame } from '../framework/types.ts';

/**
 * Zombie Lây Lan: after a short countdown one random player turns into a zombie (PlayerState.team = 1,
 * faster via moveMul). Zombies infect whoever they touch. Humans still standing at the end pass.
 * PlayerState.score = seconds survived as a human.
 */
export class ZombieInfection implements ServerMinigame {
  readonly id = 'ZOMBIE' as const;
  private readonly world = createZombieWorld();
  readonly step: StepFn = zombieStep(this.world);
  readonly bounds = this.world.bounds;
  private ctx!: MinigameContext;
  private outbreak = false;
  private readonly infectedAt = new Map<string, number>();
  private readonly immuneUntil = new Map<string, number>();
  private patientZero = '';
  private elapsed = 0;

  initialize(ctx: MinigameContext): void {
    this.ctx = ctx;
    for (const p of ctx.players) {
      const s = zombieSpawn(p.state.slot);
      p.sim.reset(s.x, s.z, s.yaw);
      p.state.team = TEAM_HUMAN;
      p.state.moveMul = 1;
      p.state.score = 0;
    }
  }

  start(): void {}

  handlePlayerInput(_playerId: string, _action: GameAction): void {
    // Movement only.
  }

  update(_dt: number, t: number): void {
    this.elapsed = t;
    if (!this.outbreak && t >= ZOMBIE.outbreakAt && this.ctx.players.length > 1) {
      this.outbreak = true;
      const first = this.ctx.players[Math.floor(this.ctx.rng() * this.ctx.players.length)]!;
      this.patientZero = first.id;
      this.infect(first, t);
    }
    const zombies = this.ctx.players.filter((p) => p.state.team === TEAM_ZOMBIE && t >= (this.infectedAt.get(p.id) ?? 0) + ZOMBIE.infectCooldown);
    for (const h of this.ctx.players) {
      if (h.state.team !== TEAM_HUMAN || h.state.roundState !== 'ACTIVE') continue;
      h.state.score = Math.floor(t);
      if (t < (this.immuneUntil.get(h.id) ?? 0)) continue;
      const hs = h.sim.state;
      const caught = zombies.some((z) => Math.hypot(z.sim.state.x - hs.x, z.sim.state.z - hs.z) < ZOMBIE.infectRadius && Math.abs(z.sim.state.y - hs.y) < 1.2);
      if (!caught) continue;
      if (this.ctx.tryRescue?.(h.id)) {
        this.immuneUntil.set(h.id, t + 2);
        continue;
      }
      this.infect(h, t);
    }
  }

  /** Public for bots: who is a zombie (everyone sees it). */
  isZombie(id: string): boolean {
    return this.ctx.players.find((p) => p.id === id)?.state.team === TEAM_ZOMBIE;
  }

  get players(): readonly GamePlayer[] {
    return this.ctx.players;
  }

  getState(): null {
    return null;
  }

  isFinished(): boolean {
    return this.outbreak && this.ctx.players.every((p) => p.state.team === TEAM_ZOMBIE || p.state.roundState !== 'ACTIVE');
  }

  finish(): RoundOutcome {
    const humans = this.ctx.players.filter((p) => p.state.team === TEAM_HUMAN && p.state.roundState === 'ACTIVE');
    const zombies = this.ctx.players
      .filter((p) => !humans.includes(p))
      .sort((a, b) => (this.infectedAt.get(b.id) ?? 0) - (this.infectedAt.get(a.id) ?? 0));
    const ranking = [...humans, ...zombies].map((p) => p.id);
    const passed = new Set(humans.map((p) => p.id));
    const details = new Map<string, string>();
    for (const p of humans) details.set(p.id, `Sống sót tới cuối (${Math.floor(this.elapsed)}s)`);
    for (const p of zombies) {
      details.set(p.id, p.id === this.patientZero ? 'Zombie số 0' : `Bị lây sau ${(this.infectedAt.get(p.id) ?? 0).toFixed(1)}s`);
    }
    return { ranking, passed, details };
  }

  dispose(): void {
    for (const p of this.ctx.players) {
      p.state.moveMul = 1;
      p.state.team = -1;
    }
  }

  private infect(p: GamePlayer, t: number): void {
    p.state.team = TEAM_ZOMBIE;
    p.state.moveMul = ZOMBIE.speedMul;
    this.infectedAt.set(p.id, t);
  }
}
