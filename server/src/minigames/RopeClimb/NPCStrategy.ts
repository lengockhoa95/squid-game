import { ROPE, ROPE_FINISH_Z, plankCenter, stationCenter, windAt } from '@sp/shared';
import type { NPCBot, BotIO, NpcStrategy } from '../../npc/NPCBot.ts';

/**
 * Rope bots walk plank to plank, aiming at where the next plank is (SMART/HARD a moment ahead)
 * and leaning into the wind; EASY bots ignore the wind.
 */
export class RopeStrategy implements NpcStrategy {
  update(bot: NPCBot, _io: BotIO, _dt: number, t: number): void {
    const s = bot.sim.state;
    const careful = bot.difficulty === 'HARD' || bot.difficulty === 'SMART';
    const target = this.nextPoint(s.z, t + (careful ? 0.15 : 0));
    bot.steerTo(target.x + bot.noise(0.15), target.z);
    // Lean against the gust a little (EASY bots do not notice it).
    if (bot.difficulty !== 'EASY') bot.intent.dirX -= (windAt(t) / ROPE.gustSpeed) * (careful ? 0.35 : 0.2);
    // Fast bots overshoot planks: slow down on bridges.
    const onBridge = target.plank;
    const scale = onBridge ? (careful ? 0.75 : 0.85) : 1;
    bot.intent.dirX *= scale;
    bot.intent.dirZ *= scale;
  }

  /** The next point ahead along the route (plank centres and station centres). */
  private nextPoint(z: number, t: number): { x: number; z: number; plank: boolean } {
    for (let i = 0; i < ROPE.stations - 1; i++) {
      for (let k = 0; k < ROPE.planks; k++) {
        const p = plankCenter(i, k, t);
        if (p.z < z - 0.5) return { x: p.x, z: p.z, plank: true };
      }
      const st = stationCenter(i + 1);
      if (st.z < z - 0.5) return { x: st.x, z: st.z, plank: false };
    }
    return { x: 0, z: ROPE_FINISH_Z - 2, plank: false };
  }
}
