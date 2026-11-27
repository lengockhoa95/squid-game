import { ICE_LENGTH, iceProgress, icePointAt, type Difficulty } from '@sp/shared';
import type { NPCBot, BotIO, NpcStrategy } from '../../npc/NPCBot.ts';

/** How far ahead along the track a bot aims (longer = brakes/turns earlier on the ice). */
const LOOKAHEAD: Record<Difficulty, number> = { EASY: 5, NORMAL: 6, HARD: 8.5, SMART: 10 };

/**
 * Ice bots aim at a point ahead on the centre line. Better bots look further ahead, so they start
 * turning before the corner instead of sliding off it. SMART bots also ease off near corners.
 */
export class IceStrategy implements NpcStrategy {
  update(bot: NPCBot, _io: BotIO, dt: number): void {
    if (!bot.shouldThink(dt, 10) && bot.memory.aimX !== undefined) {
      bot.steerTo(bot.memory.aimX as number, bot.memory.aimZ as number);
      this.ease(bot);
      return;
    }
    const s = bot.sim.state;
    const progress = Math.min(ICE_LENGTH, iceProgress(s.x, s.z));
    const target = icePointAt(progress + LOOKAHEAD[bot.difficulty]);
    bot.memory.aimX = target.x + bot.noise(0.4);
    bot.memory.aimZ = target.z + bot.noise(0.4);
    bot.steerTo(bot.memory.aimX as number, bot.memory.aimZ as number);
    this.ease(bot);
  }

  /** SMART: lift off when the track ahead turns sharply relative to our velocity. */
  private ease(bot: NPCBot): void {
    if (bot.difficulty !== 'SMART') return;
    const s = bot.sim.state;
    const speed = Math.hypot(s.vx, s.vz);
    if (speed < 5) return;
    const ahead = icePointAt(iceProgress(s.x, s.z) + 5);
    const dx = ahead.x - s.x;
    const dz = ahead.z - s.z;
    const cos = (dx * s.vx + dz * s.vz) / (Math.hypot(dx, dz) * speed || 1);
    if (cos < 0.35) {
      bot.intent.dirX *= 0.6;
      bot.intent.dirZ *= 0.6;
    }
  }
}
