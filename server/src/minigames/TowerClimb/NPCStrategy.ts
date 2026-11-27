import { TOWER, TOWER_PLATFORMS, ghostIsSolid, lavaHeight, platformCenter, platformUnder } from '@sp/shared';
import type { NPCBot, BotIO, NpcStrategy } from '../../npc/NPCBot.ts';
import type { TowerClimb } from './Logic.ts';

/**
 * Tower bots hop from platform to platform: steer to the next one, jump when close enough.
 * They wait for vanished ghost platforms to come back (unless the lava is close) and SMART bots
 * lead moving platforms. EASY bots mistime jumps more often.
 */
export class TowerStrategy implements NpcStrategy {
  private readonly game: TowerClimb;

  constructor(game: TowerClimb) {
    this.game = game;
  }

  update(bot: NPCBot, _io: BotIO, dt: number, t: number): void {
    const s = bot.sim.state;
    const m = bot.memory;
    const on = platformUnder(this.game.tw, s);
    if (on >= -1) m.on = on; // -2 = airborne: keep the previous platform
    const current = (m.on as number | undefined) ?? -1;
    const next = Math.min(TOWER.platforms - 1, current + 1);
    const p = TOWER_PLATFORMS[next]!;
    const lead = bot.difficulty === 'SMART' ? 0.35 : 0;
    const c = platformCenter(p, t + lead);
    const danger = s.y - lavaHeight(t) < 2.5;

    if (p.kind === 'ghost' && !danger) {
      // Wait on the current platform until the ghost is solid now and for the next ~0.8s.
      if (!ghostIsSolid(p, t) || !ghostIsSolid(p, t + 0.8)) {
        if (current >= 0) {
          const here = platformCenter(TOWER_PLATFORMS[current]!, t);
          bot.steerTo(here.x, here.z);
        }
        return;
      }
    }
    if (bot.shouldThink(dt, 12) || m.aimX === undefined) {
      m.aimX = c.x + bot.noise(0.3);
      m.aimZ = c.z + bot.noise(0.3);
    }
    bot.steerTo(m.aimX as number, m.aimZ as number);
    const dist = Math.hypot(c.x - s.x, c.z - s.z);
    const sloppy = bot.difficulty === 'EASY' ? (bot.rng() - 0.5) * 1.2 : bot.difficulty === 'NORMAL' ? (bot.rng() - 0.5) * 0.5 : 0;
    const higher = p.y > s.y + 0.2;
    if (s.grounded && higher && dist < 3.1 + sloppy && dist > 0.8) {
      bot.intent.jump = true;
      // Occasional botched jump: aim off to the side for a moment (usually a fall).
      if (bot.chance(bot.profile.errorRate * 0.6)) {
        m.aimX = c.x + (bot.rng() - 0.5) * 6;
        m.aimZ = c.z + (bot.rng() - 0.5) * 6;
      }
    }
  }
}
