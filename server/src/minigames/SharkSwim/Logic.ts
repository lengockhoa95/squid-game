import {
  SEA, SHARK_LANES, createSeaWorld, inWater, onIsland, seaSpawn, seaStep,
  type GameAction, type StepFn,
} from '@sp/shared';
import { SeaState, SharkFin } from '@sp/shared/schema';
import { rankPlayers, type GamePlayer, type MinigameContext, type RoundOutcome, type ServerMinigame } from '../framework/types.ts';

interface Shark {
  fin: SharkFin;
  dir: number;
  laneZ: number;
  speed: number;
  /** Lunge: velocity until `until`, then rest until `restUntil`. */
  vx: number;
  vz: number;
  until: number;
  restUntil: number;
}

/**
 * Vượt Biển Cá Mập: swim across to the island. Sharks patrol lanes and lunge at swimmers in front
 * of them; a bite is out (Mạng Phụ: back to the beach, briefly safe). Island = passed.
 * PlayerState.score = metres swum.
 */
export class SharkSwim implements ServerMinigame {
  readonly id = 'SHARK_SWIM' as const;
  private readonly world = createSeaWorld();
  readonly step: StepFn = seaStep(this.world);
  readonly bounds = this.world.bounds;
  private ctx!: MinigameContext;
  private state!: SeaState;
  private sharks: Shark[] = [];
  private readonly finishTimes = new Map<string, number>();
  private readonly bitten = new Set<string>();
  private readonly safeUntil = new Map<string, number>();
  private readonly best = new Map<string, number>();

  initialize(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.state = new SeaState();
    ctx.match.sea = this.state;
    this.sharks = SHARK_LANES.map((z, i) => {
      const fin = new SharkFin();
      fin.x = (ctx.rng() * 2 - 1) * (SEA.halfWidth - 2);
      fin.z = z;
      this.state.sharks.push(fin);
      return { fin, dir: i % 2 === 0 ? 1 : -1, laneZ: z, speed: SEA.patrolSpeed * (0.8 + ctx.rng() * 0.5), vx: 0, vz: 0, until: 0, restUntil: 0 };
    });
    for (const p of ctx.players) {
      const s = seaSpawn(p.state.slot);
      p.sim.reset(s.x, s.z, s.yaw);
      this.best.set(p.id, 0);
    }
  }

  start(): void {}

  handlePlayerInput(_playerId: string, _action: GameAction): void {
    // Movement only.
  }

  update(dt: number, t: number): void {
    const swimmers = this.ctx.players.filter((p) => p.state.roundState === 'ACTIVE' && inWater(p.sim.state.y));
    for (const sh of this.sharks) this.moveShark(sh, swimmers, dt, t);
    for (const p of this.ctx.players) {
      if (p.state.roundState !== 'ACTIVE') continue;
      const s = p.sim.state;
      const swum = Math.max(0, SEA.beachZ - s.z);
      if (swum > (this.best.get(p.id) ?? 0)) this.best.set(p.id, swum);
      p.state.score = Math.floor(this.best.get(p.id) ?? 0);
      if (s.grounded && onIsland(s.z, s.y)) {
        p.state.roundState = 'FINISHED';
        this.finishTimes.set(p.id, t);
        continue;
      }
      // Bite: a shark at the surface next to a swimmer (jumping over it is safe).
      if (!inWater(s.y) || s.y > SEA.swimY + 0.6 || t < (this.safeUntil.get(p.id) ?? 0)) continue;
      const bite = this.sharks.some((sh) => Math.hypot(sh.fin.x - s.x, sh.fin.z - s.z) < SEA.biteRadius);
      if (!bite) continue;
      if (this.ctx.tryRescue?.(p.id)) {
        const sp = seaSpawn(p.state.slot);
        p.sim.reset(sp.x, sp.z, sp.yaw);
        this.safeUntil.set(p.id, t + 2);
        continue;
      }
      p.state.roundState = 'OUT';
      this.bitten.add(p.id);
    }
  }

  getState(): SeaState {
    return this.state;
  }

  /** Public for bots: shark positions/velocities (everyone sees the fins). */
  sharkViews(): ReadonlyArray<{ x: number; z: number; vx: number; vz: number; lunging: boolean }> {
    return this.sharks.map((s) => ({ x: s.fin.x, z: s.fin.z, vx: s.fin.lunge ? s.vx : s.dir * s.speed, vz: s.fin.lunge ? s.vz : 0, lunging: s.fin.lunge }));
  }

  isFinished(): boolean {
    return this.ctx.players.every((p) => p.state.roundState !== 'ACTIVE');
  }

  finish(): RoundOutcome {
    const ranking = rankPlayers(this.ctx.players, this.finishTimes, (p) => this.best.get(p.id) ?? 0);
    const passed = new Set(this.finishTimes.keys());
    const details = new Map<string, string>();
    for (const p of this.ctx.players) {
      const t = this.finishTimes.get(p.id);
      if (t !== undefined) details.set(p.id, `Lên đảo sau ${t.toFixed(1)}s`);
      else if (this.bitten.has(p.id)) details.set(p.id, `Bị cá mập đớp (bơi được ${Math.floor(this.best.get(p.id) ?? 0)}m)`);
      else details.set(p.id, `Chưa tới đảo (${Math.floor(this.best.get(p.id) ?? 0)}m)`);
    }
    return { ranking, passed, details };
  }

  dispose(): void {
    this.ctx.match.sea = undefined;
  }

  private moveShark(sh: Shark, swimmers: readonly GamePlayer[], dt: number, t: number): void {
    const f = sh.fin;
    if (t < sh.until) {
      f.x += sh.vx * dt;
      f.z += sh.vz * dt;
    } else {
      if (f.lunge) {
        f.lunge = false;
        sh.restUntil = t + SEA.lungeRestSeconds;
      }
      // Patrol along the lane, drifting back to it after a lunge.
      f.x += sh.dir * sh.speed * dt;
      f.z += (sh.laneZ - f.z) * Math.min(1, dt * 0.8);
      if (Math.abs(f.x) > SEA.halfWidth - 1) {
        sh.dir = -Math.sign(f.x);
        f.x = Math.sign(f.x) * (SEA.halfWidth - 1);
      }
      if (t >= sh.restUntil) {
        // Lunge at the nearest swimmer in front of the shark.
        let prey: GamePlayer | null = null;
        let best: number = SEA.senseRadius;
        for (const p of swimmers) {
          const dx = p.sim.state.x - f.x;
          const dz = p.sim.state.z - f.z;
          const d = Math.hypot(dx, dz);
          const ahead = dx * sh.dir > -1 || Math.abs(dz) > 1.5;
          if (d < best && ahead) {
            best = d;
            prey = p;
          }
        }
        if (prey) {
          const dx = prey.sim.state.x - f.x;
          const dz = prey.sim.state.z - f.z;
          const d = Math.hypot(dx, dz) || 1;
          sh.vx = (dx / d) * SEA.lungeSpeed;
          sh.vz = (dz / d) * SEA.lungeSpeed;
          sh.until = t + SEA.lungeSeconds;
          f.lunge = true;
        }
      }
    }
    f.x = Math.max(-SEA.halfWidth + 0.5, Math.min(SEA.halfWidth - 0.5, f.x));
    f.yaw = f.lunge ? Math.atan2(sh.vx, sh.vz) : Math.atan2(sh.dir, 0);
  }
}
