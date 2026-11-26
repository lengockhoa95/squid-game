import type { NPCBot, BotIO, NpcStrategy } from '../../npc/NPCBot.ts';
import type { QuickReaction } from './Logic.ts';

/** Reaction bots press after a sampled reaction time; they sometimes jump the gun during WAIT. */
export class ReactionStrategy implements NpcStrategy {
  private readonly game: QuickReaction;

  constructor(game: QuickReaction) {
    this.game = game;
  }

  update(bot: NPCBot, io: BotIO, dt: number): void {
    const { stage, attempt, pressed } = this.game.publicStage;
    const m = bot.memory;
    if (m.attempt !== attempt) {
      m.attempt = attempt;
      m.waitElapsed = 0;
      // Decide once per attempt whether this bot will false-start, and when.
      m.falseStartAt = bot.chance(bot.profile.errorRate * 0.5) ? 0.6 + bot.rng() * 1.2 : -1;
      m.pressIn = -1;
    }
    if (pressed(bot.id)) return;
    if (stage === 'WAIT') {
      m.waitElapsed = (m.waitElapsed as number) + dt;
      if ((m.falseStartAt as number) >= 0 && (m.waitElapsed as number) >= (m.falseStartAt as number)) io.act({ kind: 'REACT' });
      return;
    }
    if (stage !== 'GO') return;
    if ((m.pressIn as number) < 0) m.pressIn = bot.reactionDelay(0.8);
    m.pressIn = (m.pressIn as number) - dt;
    if ((m.pressIn as number) <= 0) io.act({ kind: 'REACT' });
  }
}
