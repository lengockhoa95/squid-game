import { PUSHERS, RACE, RACE_LAYOUT, SWEEPERS, pusherX, sweeperAngle } from '@sp/shared';
import type { NPCBot, BotIO, NpcStrategy } from '../../npc/NPCBot.ts';

const JUMP_LEAD = 1.2; // metres before an edge/wall to jump

/**
 * Race bots run down their lane and jump at gap edges and walls. HARD/SMART bots also time pushers
 * (wait if one is sliding into their lane) and hop over sweeper bars; EASY bots jump with sloppy timing.
 */
export class RaceStrategy implements NpcStrategy {
  private readonly jumpZs: number[];

  constructor() {
    const gapEdges = RACE_LAYOUT.floor.slice(0, -1).map(([, end]) => end); // z where each floor segment ends
    this.jumpZs = [...gapEdges.map((z) => z + JUMP_LEAD), ...RACE_LAYOUT.wallZs.map((z) => z + 0.4 + JUMP_LEAD)];
  }

  update(bot: NPCBot, _io: BotIO, dt: number, gameTime: number): void {
    const s = bot.sim.state;
    const m = bot.memory;
    const careful = bot.difficulty === 'HARD' || bot.difficulty === 'SMART';
    if (m.lane === undefined) {
      // Careful bots pick an outer lane, away from the sweeper pivots in the middle.
      const lane = careful ? (bot.rng() < 0.5 ? -1 : 1) * (2.2 + bot.rng() * 2.3) : s.x + bot.noise();
      m.lane = Math.max(-RACE.halfWidth + 0.8, Math.min(RACE.halfWidth - 0.8, lane));
    }

    // Jump at edges/walls (EASY jumps with a random timing error).
    const sloppy = bot.difficulty === 'EASY' ? (bot.rng() - 0.5) * 1.0 : bot.difficulty === 'NORMAL' ? (bot.rng() - 0.5) * 0.6 : 0;
    for (const jz of this.jumpZs) {
      const trigger = jz + sloppy;
      if (s.grounded && s.z <= trigger && s.z > trigger - JUMP_LEAD) bot.intent.jump = true;
    }
    // Stuck (blocked by a wall, a pillar or another player) while trying to run: hop.
    const trying = Math.hypot(bot.intent.dirX, bot.intent.dirZ) > 0.3;
    m.stuck = trying && s.grounded && Math.hypot(s.vx, s.vz) < 1 ? ((m.stuck as number | undefined) ?? 0) + dt : 0;
    if ((m.stuck as number) > 0.4) {
      bot.intent.jump = true;
      m.stuck = 0;
    }

    if (careful) {
      // Sweepers: hop when the bar is about to reach us.
      for (const sw of SWEEPERS) {
        if (Math.abs(s.z - sw.z) > sw.length + 0.5) continue;
        const a = sweeperAngle(sw, gameTime + 0.15);
        const along = (s.x - sw.x) * Math.cos(a) + (s.z - sw.z) * Math.sin(a);
        const perp = Math.abs(-(s.x - sw.x) * Math.sin(a) + (s.z - sw.z) * Math.cos(a));
        if (perp < 0.9 && Math.abs(along) < sw.length && s.grounded) bot.intent.jump = true;
      }
      // Pushers: wait before entering if one is sliding across our lane.
      for (const p of PUSHERS) {
        const ahead = s.z - p.z;
        if (ahead < 1 || ahead > 3.2) continue;
        const px = pusherX(p, gameTime + 0.6);
        if (Math.abs(px - (m.lane as number)) < p.width / 2 + 1) {
          bot.stopMoving();
          return;
        }
      }
    }
    if (bot.shouldThink(dt, 8)) bot.steerTo(m.lane as number, s.z - 5);
  }
}
