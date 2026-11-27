import { PAINT, PAINT_CELL_COUNT, paintCellAt, paintCellCenter } from '@sp/shared';
import type { NPCBot, BotIO, NpcStrategy } from '../../npc/NPCBot.ts';
import type { Paint } from './Logic.ts';

const SEARCH = 6; // cells around the bot

/**
 * Paint bots head for nearby cells that are not theirs. SMART/HARD prefer stealing rivals' cells
 * and keep a direction (long strokes cover more); EASY bots wander with lots of noise.
 */
export class PaintStrategy implements NpcStrategy {
  private readonly game: Paint;

  constructor(game: Paint) {
    this.game = game;
  }

  update(bot: NPCBot, _io: BotIO, dt: number): void {
    const s = bot.sim.state;
    const m = bot.memory;
    const target = m.target as number | undefined;
    const reached = target !== undefined && paintCellAt(s.x, s.z) === target;
    if (target === undefined || reached || this.game.owner(target) === bot.state.slot + 1 || bot.shouldThink(dt, 1.5)) {
      m.target = this.pick(bot);
    }
    const c = paintCellCenter(m.target as number);
    const stuck = Math.hypot(s.vx, s.vz) < 0.5;
    if (stuck && s.grounded && bot.chance(0.05)) bot.intent.jump = true;
    bot.steerTo(c.x + bot.noise(0.5), c.z + bot.noise(0.5));
  }

  private pick(bot: NPCBot): number {
    const s = bot.sim.state;
    const here = paintCellAt(s.x, s.z);
    const r0 = Math.floor(Math.max(0, here) / PAINT.cells);
    const c0 = Math.max(0, here) % PAINT.cells;
    const mine = bot.state.slot + 1;
    const greedy = bot.difficulty === 'SMART' || bot.difficulty === 'HARD';
    const speed = Math.hypot(s.vx, s.vz) || 1;
    let best = -1;
    let bestScore = -Infinity;
    for (let r = r0 - SEARCH; r <= r0 + SEARCH; r++) {
      for (let c = c0 - SEARCH; c <= c0 + SEARCH; c++) {
        if (r < 0 || c < 0 || r >= PAINT.cells || c >= PAINT.cells) continue;
        const i = r * PAINT.cells + c;
        if (i === here || i >= PAINT_CELL_COUNT) continue;
        const owner = this.game.owner(i);
        if (owner === mine) continue;
        const dist = Math.hypot(r - r0, c - c0);
        let score = -dist + bot.rng() * (greedy ? 1 : 4);
        if (owner !== 0 && greedy) score += 2; // steal
        // Keep going roughly the same way (fewer turns = more ground covered).
        const p = paintCellCenter(i);
        const along = ((p.x - s.x) * s.vx + (p.z - s.z) * s.vz) / (speed * (Math.hypot(p.x - s.x, p.z - s.z) || 1));
        if (greedy) score += along * 1.5;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
    }
    if (best < 0) best = Math.floor(bot.rng() * PAINT_CELL_COUNT);
    return best;
  }
}
