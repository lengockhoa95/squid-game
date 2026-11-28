import { SEA, inWater, type Difficulty } from '@sp/shared';
import type { NPCBot, BotIO, NpcStrategy } from '../../npc/NPCBot.ts';
import type { SharkSwim } from './Logic.ts';

/** How far ahead (seconds) bots predict sharks, and how close they notice them. */
const FORESIGHT: Record<Difficulty, number> = { EASY: 0, NORMAL: 0.4, HARD: 0.8, SMART: 1.1 };
const SENSE: Record<Difficulty, number> = { EASY: 3, NORMAL: 4.5, HARD: 6, SMART: 7 };

/**
 * Swim bots head for the island and dodge sideways away from sharks near their path; HARD/SMART
 * predict where sharks will be and hop over lunging ones.
 */
export class SharkStrategy implements NpcStrategy {
  private readonly game: SharkSwim;

  constructor(game: SharkSwim) {
    this.game = game;
  }

  update(bot: NPCBot, _io: BotIO, dt: number): void {
    const s = bot.sim.state;
    const m = bot.memory;
    if (!bot.shouldThink(dt, 10) && m.aimX !== undefined) {
      bot.steerTo(m.aimX as number, m.aimZ as number);
      return;
    }
    let dodgeX = 0;
    let hold = false;
    if (inWater(s.y)) {
      for (const sh of this.game.sharkViews()) {
        const look = FORESIGHT[bot.difficulty];
        const px = sh.x + sh.vx * look;
        const pz = sh.z + sh.vz * look;
        const dx = s.x - px;
        const dz = s.z - pz;
        const d = Math.hypot(dx, dz);
        if (d > SENSE[bot.difficulty]) continue;
        // Shark in the lane just ahead: wait for it to pass; beside us: move away.
        if (dz > 0 && dz < 3.5 && Math.abs(dx) < 3) hold = true;
        dodgeX += (dx >= 0 ? 1 : -1) * (SENSE[bot.difficulty] - d);
        if (sh.lunging && d < 2.6 && s.grounded && bot.difficulty !== 'EASY') bot.intent.jump = true;
      }
    }
    const targetZ = hold ? s.z + 1 : SEA.islandZ - 4;
    const x = Math.max(-SEA.halfWidth + 1, Math.min(SEA.halfWidth - 1, s.x + dodgeX * 0.8 + bot.noise(0.5)));
    m.aimX = x;
    m.aimZ = targetZ;
    bot.steerTo(x, targetZ);
  }
}
