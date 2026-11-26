import { TUG, tugCursor, tugInZone } from '@sp/shared';
import type { MatchState } from '@sp/shared/schema';
import type { NPCBot, BotIO, NpcStrategy } from '../../npc/NPCBot.ts';
import type { TugOfWar } from './Logic.ts';

/**
 * Tug bots watch the same timing cursor players see. They pull when they expect the cursor to be in
 * the zone after their reaction delay (prediction quality depends on difficulty). EASY bots also
 * mash off-beat. SMART bots pull more often when their team is losing.
 */
export class TugStrategy implements NpcStrategy {
  private readonly game: TugOfWar;
  private readonly match: MatchState;

  constructor(game: TugOfWar, match: MatchState) {
    this.game = game;
    this.match = match;
  }

  update(bot: NPCBot, io: BotIO, dt: number, gameTime: number): void {
    const m = bot.memory;
    m.cooldown = ((m.cooldown as number | undefined) ?? 0) - dt;
    if ((m.cooldown as number) > 0) return;

    const losing = (bot.state.team === 0 ? this.game.getState().rope : -this.game.getState().rope) > 0.2;
    const urgency = bot.profile.situational && losing ? 0.7 : 1;
    if (bot.difficulty === 'EASY' && bot.chance(0.08)) {
      io.act({ kind: 'PULL' }); // mashing
      m.cooldown = 0.25;
      return;
    }
    // Predict where the cursor will be when the pull lands (reaction delay of a "decision").
    const lead = bot.reactionDelay(0.25);
    const hit = tugInZone(gameTime + lead) && Math.abs(tugCursor(gameTime + lead) - 0.5) < 0.09;
    if (hit && !bot.chance(bot.profile.errorRate * 2)) {
      io.act({ kind: 'PULL' });
      m.cooldown = (TUG.cursorPeriodS / 2 - 0.12) * urgency;
    } else if (!hit && bot.chance(bot.profile.errorRate * 0.5)) {
      io.act({ kind: 'PULL' }); // off-beat mistake
      m.cooldown = 0.3;
    }
    void this.match;
  }
}
