import { RLGL } from '@sp/shared';
import type { MatchState } from '@sp/shared/schema';
import type { NPCBot, BotIO, NpcStrategy } from '../../npc/NPCBot.ts';
import type { RedLightGreenLight } from './Logic.ts';

/**
 * RLGL bot FSM: ADVANCE (green) → BRAKE (react to red / anticipate the end of the song) → HOLD (red).
 * - All bots may stop early when the song bar is nearly full (chance depends on difficulty).
 * - SMART bots read the time left and take more risk when they would otherwise not finish.
 * - Mistakes (errorRate) add an extra delay before braking — which usually gets the bot caught.
 */
export class RlglStrategy implements NpcStrategy {
  private readonly game: RedLightGreenLight;
  private readonly match: MatchState;

  constructor(game: RedLightGreenLight, match: MatchState) {
    this.game = game;
    this.match = match;
  }

  update(bot: NPCBot, _io: BotIO, dt: number): void {
    const m = bot.memory;
    const { light, songProgress } = this.game.publicLight;
    if (m.lane === undefined) {
      m.lane = bot.sim.state.x + bot.noise(0.5);
      m.anticipate = this.anticipationThreshold(bot);
    }

    if (light === 'RED') {
      if (m.sawRed !== true) {
        m.sawRed = true;
        m.brakeIn = m.braking === true ? 0 : bot.reactionDelay() + (bot.chance(bot.profile.errorRate) ? 0.35 : 0);
      }
      m.brakeIn = (m.brakeIn as number) - dt;
      if ((m.brakeIn as number) <= 0) bot.stopMoving();
      return;
    }

    // Green light.
    if (m.sawRed === true) {
      // New green cycle: wait a reaction before starting again and re-roll anticipation.
      m.sawRed = false;
      m.braking = false;
      // Situational bots watch the light closely and restart sooner.
      m.goIn = bot.reactionDelay(bot.profile.situational ? 0.5 : 0.8);
      m.anticipate = this.anticipationThreshold(bot);
    }
    if (typeof m.goIn === 'number' && m.goIn > 0) {
      m.goIn -= dt;
      bot.stopMoving();
      return;
    }
    if (songProgress >= (m.anticipate as number)) {
      m.braking = true;
      bot.stopMoving();
      return;
    }
    if (bot.shouldThink(dt)) bot.steerTo(m.lane as number, RLGL.finishZ - 3);
  }

  /** Song progress at which the bot stops before the light turns red (>1 = never anticipates). */
  private anticipationThreshold(bot: NPCBot): number {
    const base = { EASY: 0.3, NORMAL: 0.65, HARD: 0.5, SMART: 0 }[bot.difficulty];
    const personality = bot.personality === 'BOLD' ? 0.06 : bot.personality === 'CAUTIOUS' ? -0.06 : 0;
    if (bot.profile.situational) {
      // Fast reactions make pre-emptive stops unnecessary, except when the bot knows it is
      // prone to a slip (rolled an error this cycle) and is not short on time.
      const remaining = Math.max(0, bot.sim.state.z - RLGL.finishZ);
      const timeNeeded = remaining / 4;
      const relaxed = this.match.timer > timeNeeded * 1.5;
      return relaxed && bot.chance(bot.profile.errorRate * 3) ? 0.9 + personality : 2;
    }
    return bot.chance(base) ? 0.8 + personality + bot.rng() * 0.08 : 2;
  }
}
