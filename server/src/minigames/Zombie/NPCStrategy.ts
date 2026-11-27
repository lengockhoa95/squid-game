import { TEAM_HUMAN, TEAM_ZOMBIE, ZOMBIE } from '@sp/shared';
import type { NPCBot, BotIO, NpcStrategy } from '../../npc/NPCBot.ts';
import type { ZombieInfection } from './Logic.ts';

/**
 * Zombie bots chase the nearest human (SMART/HARD lead the target). Human bots flee: away from
 * nearby zombies, pushed back from the walls, with a little wander; they hop when blocked.
 */
export class ZombieStrategy implements NpcStrategy {
  private readonly game: ZombieInfection;

  constructor(game: ZombieInfection) {
    this.game = game;
  }

  update(bot: NPCBot, _io: BotIO, dt: number): void {
    const s = bot.sim.state;
    const m = bot.memory;
    const stuck = s.grounded && Math.hypot(s.vx, s.vz) < 0.8 && Math.hypot(bot.intent.dirX, bot.intent.dirZ) > 0.3;
    m.stuck = stuck ? ((m.stuck as number | undefined) ?? 0) + dt : 0;
    if ((m.stuck as number) > 0.35) {
      bot.intent.jump = true;
      m.stuck = 0;
    }
    if (!bot.shouldThink(dt, 8)) return;
    const others = this.game.players.filter((p) => p.id !== bot.id && p.state.roundState === 'ACTIVE');
    if (bot.state.team === TEAM_ZOMBIE) {
      const prey = others.filter((p) => p.state.team === TEAM_HUMAN);
      if (prey.length === 0) return bot.stopMoving();
      const target = prey.reduce((a, b) => (dist(a.sim.state, s) < dist(b.sim.state, s) ? a : b)).sim.state;
      const lead = bot.difficulty === 'SMART' ? 0.5 : bot.difficulty === 'HARD' ? 0.3 : 0;
      bot.steerTo(target.x + target.vx * lead + bot.noise(0.5), target.z + target.vz * lead + bot.noise(0.5));
      return;
    }
    // Human: flee.
    let fx = 0;
    let fz = 0;
    const sense = bot.difficulty === 'EASY' ? 6 : 10;
    for (const z of others) {
      if (z.state.team !== TEAM_ZOMBIE) continue;
      const dx = s.x - z.sim.state.x;
      const dz = s.z - z.sim.state.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > sense * sense) continue;
      fx += dx / (d2 + 0.5);
      fz += dz / (d2 + 0.5);
    }
    const threat = Math.hypot(fx, fz);
    if (threat > 1e-3 && bot.difficulty !== 'EASY') {
      // Run in an arc (perpendicular component) instead of straight into a wall.
      const side = (m.side as number | undefined) ?? (bot.rng() < 0.5 ? -1 : 1);
      m.side = side;
      fx += (-fz / threat) * threat * 0.6 * side;
      fz += (fx / threat) * threat * 0.6 * side;
    }
    // Walls push you back toward the middle, harder the closer you get (cornered = caught).
    const h = ZOMBIE.half;
    const wall = (d: number) => (d < 5 ? (5 - d) * 0.08 : 0);
    fx += wall(h - s.x) * -1 + wall(s.x + h);
    fz += wall(h - s.z) * -1 + wall(s.z + h);
    if (Math.hypot(fx, fz) < 1e-3) {
      // Nobody close: drift around, away from the walls.
      fx = -s.x * 0.02 + (bot.rng() - 0.5) * 0.3;
      fz = -s.z * 0.02 + (bot.rng() - 0.5) * 0.3;
    }
    const len = Math.hypot(fx, fz) || 1;
    bot.steerTo(s.x + (fx / len) * 4 + bot.noise(0.5), s.z + (fz / len) * 4 + bot.noise(0.5));
  }
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
