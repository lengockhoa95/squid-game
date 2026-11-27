import { DOORS, DOORS_FINISH_Z, DOOR_FAKE, DOOR_REAL, doorRowZ, doorX } from '@sp/shared';
import type { NPCBot, BotIO, NpcStrategy } from '../../npc/NPCBot.ts';
import type { LuckyDoors } from './Logic.ts';

/**
 * Door bots pick a door for the next row: a revealed real one if any (SMART/HARD always, others
 * usually), otherwise a random door not known to be fake. After a bonk they re-pick.
 */
export class DoorsStrategy implements NpcStrategy {
  private readonly game: LuckyDoors;

  constructor(game: LuckyDoors) {
    this.game = game;
  }

  update(bot: NPCBot, _io: BotIO, dt: number): void {
    const s = bot.sim.state;
    const m = bot.memory;
    const row = this.game.rowsPassed(bot.id);
    if (row >= DOORS.rows) {
      bot.steerTo(s.x, DOORS_FINISH_Z - 4);
      return;
    }
    const picked = m.row === row ? (m.door as number) : -1;
    const bad = picked >= 0 && this.game.revealed(row, picked) === DOOR_FAKE;
    if (picked < 0 || bad || (bot.shouldThink(dt, 2) && this.betterKnown(row, picked))) {
      m.row = row;
      m.door = this.choose(bot, row);
    }
    const x = doorX(m.door as number);
    const z = doorRowZ(row);
    // Line up in front of the door first, then run through.
    const lined = Math.abs(s.x - x) < 0.5;
    bot.steerTo(x, lined || s.z < z + 2 ? z - 3 : z + 1.5);
  }

  private betterKnown(row: number, picked: number): boolean {
    if (this.game.revealed(row, picked) === DOOR_REAL) return false;
    return [0, 1, 2, 3].some((k) => this.game.revealed(row, k) === DOOR_REAL);
  }

  private choose(bot: NPCBot, row: number): number {
    const known = [0, 1, 2, 3].filter((k) => this.game.revealed(row, k) === DOOR_REAL);
    const followsInfo = bot.difficulty === 'HARD' || bot.difficulty === 'SMART' || !bot.chance(bot.profile.errorRate * 2);
    if (known.length > 0 && followsInfo) return known[Math.floor(bot.rng() * known.length)]!;
    const options = [0, 1, 2, 3].filter((k) => this.game.revealed(row, k) !== DOOR_FAKE);
    return options[Math.floor(bot.rng() * options.length)] ?? 0;
  }
}
