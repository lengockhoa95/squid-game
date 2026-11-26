import { ELEMENT_FX, type Difficulty, type ElementId } from '@sp/shared';
import type { NPCBot } from '../npc/NPCBot.ts';
import type { GamePlayer } from '../minigames/framework/types.ts';

/** Chance per decision (2 per second) that a ready bot uses its element. */
const CAST_CHANCE: Record<Difficulty, number> = { EASY: 0.15, NORMAL: 0.3, HARD: 0.45, SMART: 0.6 };
const THINK_SECONDS = 0.5;

export interface ElementBotView {
  movement: boolean;
  /** Active participants other than the bot. */
  others(botId: string): readonly GamePlayer[];
  cast(botId: string, x: number, z: number): void;
}

/**
 * Rule-based element use for bots. Uses only what a human sees: positions and progress.
 * Movement games progress toward -Z, so the "leader" is the opponent with the lowest z.
 */
export function updateBotElement(bot: NPCBot, dt: number, t: number, view: ElementBotView): void {
  const s = bot.state;
  if (!s.element || t < s.elementReadyAt || t < s.stunUntil) return;
  const timer = ((bot.memory.elementThink as number | undefined) ?? bot.rng() * THINK_SECONDS) - dt;
  bot.memory.elementThink = timer > 0 ? timer : THINK_SECONDS;
  if (timer > 0 || !bot.chance(CAST_CHANCE[bot.difficulty])) return;

  const others = view.others(bot.id);
  if (others.length === 0) return;
  if (!view.movement) {
    view.cast(bot.id, 0, 0); // server picks the target in non-movement games
    return;
  }
  const me = bot.sim.state;
  const leader = [...others].sort((a, b) => a.sim.state.z - b.sim.state.z)[0]!.sim.state;
  const nearest = [...others].sort((a, b) => dist(a.sim.state, me) - dist(b.sim.state, me))[0]!.sim.state;
  const speed = Math.hypot(me.vx, me.vz);

  switch (s.element as ElementId) {
    case 'EARTH':
      view.cast(bot.id, leader.x, leader.z - 1.5); // wall in front of the leader
      break;
    case 'WATER':
    case 'DARK':
      view.cast(bot.id, leader.x, leader.z);
      break;
    case 'THUNDER':
      if (dist(nearest, me) < 13) view.cast(bot.id, nearest.x, nearest.z);
      break;
    case 'WIND':
      if (dist(nearest, me) < ELEMENT_FX.windRadius - 0.5) view.cast(bot.id, me.x, me.z);
      break;
    case 'FIRE':
    case 'CLONE':
      if (speed > 2) view.cast(bot.id, me.x, me.z);
      break;
    case 'SWAP':
      if (leader.z < me.z - 3) view.cast(bot.id, leader.x, leader.z);
      break;
    case 'BLINK':
      if (speed > 2) view.cast(bot.id, me.x + (me.vx / speed) * 5, me.z + (me.vz / speed) * 5);
      break;
  }
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
