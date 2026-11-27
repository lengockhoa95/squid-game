import { COLLAPSE, TILE_SOLID, collapseCoords, collapseIndex, tileAt, tileCenter } from '@sp/shared';
import type { NPCBot, BotIO, NpcStrategy } from '../../npc/NPCBot.ts';
import type { FloorCollapse } from './Logic.ts';

const SEARCH = 3; // tiles around the bot considered as the next stop

/**
 * Floor-collapse bots never stand still: they keep heading for a solid tile nearby, preferring
 * areas with many solid neighbours (SMART/HARD weigh that heavily, EASY wanders), and hop over
 * holes in front of them.
 */
export class CollapseStrategy implements NpcStrategy {
  private readonly game: FloorCollapse;

  constructor(game: FloorCollapse) {
    this.game = game;
  }

  update(bot: NPCBot, _io: BotIO, dt: number): void {
    const s = bot.sim.state;
    const m = bot.memory;
    if (!bot.shouldThink(dt, 8)) return;
    const here = tileAt(s.x, s.y, s.z);
    const target = m.target as number | undefined;
    // "Reached" a bit before the centre so the bot never brakes on a tile (standing still = falling).
    const reached = target !== undefined && target >= 0 && Math.hypot(tileCenter(target).x - s.x, tileCenter(target).z - s.z) < 0.9;
    const targetBad = target === undefined || this.game.tileState(target) !== TILE_SOLID;
    if (here >= 0 && (reached || targetBad || bot.chance(0.04))) m.target = this.pickTarget(bot, here);
    const t = m.target as number | undefined;
    if (t === undefined || t < 0) {
      bot.steerTo(s.x + bot.noise(3), s.z + bot.noise(3)); // nothing solid nearby: keep moving
      return;
    }
    const c = tileCenter(t);
    // Aim past the tile centre: intentTowardTarget brakes near its target, we want to keep running.
    const dx = c.x - s.x;
    const dz = c.z - s.z;
    const d = Math.hypot(dx, dz) || 1;
    bot.steerTo(c.x + (dx / d) * 3 + bot.noise(0.3), c.z + (dz / d) * 3 + bot.noise(0.3));
    // Careful bots hop: tiles only crack when you land on them, so jumping saves floor.
    const hopChance = bot.difficulty === 'SMART' ? 0.5 : bot.difficulty === 'HARD' ? 0.3 : 0;
    if (s.grounded && bot.chance(hopChance)) bot.intent.jump = true;
    // Hole right ahead on this floor: jump it.
    const speed = Math.hypot(s.vx, s.vz);
    if (s.grounded && speed > 1) {
      const ahead = tileAt(s.x + (s.vx / speed) * 1.2, s.y, s.z + (s.vz / speed) * 1.2);
      if (ahead >= 0 && this.game.tileState(ahead) !== TILE_SOLID && ahead !== here) {
        const careful = bot.difficulty !== 'EASY' || bot.chance(0.5);
        if (careful) bot.intent.jump = true;
      }
    }
  }

  private pickTarget(bot: NPCBot, here: number): number {
    const { layer, row, col } = collapseCoords(here);
    const weightNeighbours = bot.difficulty === 'EASY' ? 0.3 : bot.difficulty === 'NORMAL' ? 1 : 2;
    let best = -1;
    let bestScore = -Infinity;
    for (let r = row - SEARCH; r <= row + SEARCH; r++) {
      for (let c = col - SEARCH; c <= col + SEARCH; c++) {
        if (r < 0 || c < 0 || r >= COLLAPSE.rows || c >= COLLAPSE.cols || (r === row && c === col)) continue;
        const i = collapseIndex(layer, r, c);
        if (this.game.tileState(i) !== TILE_SOLID) continue;
        const dist = Math.abs(r - row) + Math.abs(c - col);
        let score = this.solidNeighbours(layer, r, c) * weightNeighbours - Math.abs(dist - 2) + bot.rng() * 2;
        // Stay away from the edge a little.
        if (r === 0 || c === 0 || r === COLLAPSE.rows - 1 || c === COLLAPSE.cols - 1) score -= weightNeighbours;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
    }
    return best;
  }

  private solidNeighbours(layer: number, row: number, col: number): number {
    let n = 0;
    for (let r = row - 1; r <= row + 1; r++) {
      for (let c = col - 1; c <= col + 1; c++) {
        if (r < 0 || c < 0 || r >= COLLAPSE.rows || c >= COLLAPSE.cols || (r === row && c === col)) continue;
        if (this.game.tileState(collapseIndex(layer, r, c)) === TILE_SOLID) n++;
      }
    }
    return n;
  }
}
