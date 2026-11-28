import { NPC_IDENTITIES, createRng, type Difficulty, type GameAction, type MinigameId, type MoveBatch } from '@sp/shared';
import type { PlayerState } from '@sp/shared/schema';
import type { PlayerSim } from '../players/PlayerSim.ts';
import { NPCBot, type BotIO, type NpcStrategy } from './NPCBot.ts';
import { updateBotElement, type ElementBotView } from '../elements/ElementBrain.ts';

export interface BotSpec {
  id: string;
  nickname: string;
  difficulty: Difficulty;
}

/** Owns all bots of a room: identity assignment and per-tick driving through the strategy of the current game. */
export class NPCManager {
  private readonly bots = new Map<string, NPCBot>();
  private readonly batch: MoveBatch = { s: 0, i: [0, 0, 0] };
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  /** Pick unused identities for `count` bots. */
  static planBots(count: number, difficulties: readonly Difficulty[], usedNames: ReadonlySet<string>, rng: () => number): BotSpec[] {
    const pool = NPC_IDENTITIES.filter((n) => !usedNames.has(n.name));
    const specs: BotSpec[] = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const pick = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
      specs.push({ id: `bot-${i + 1}-${pick.name.replace(/\s+/g, '').toLowerCase()}`, nickname: pick.name, difficulty: difficulties[i] ?? 'NORMAL' });
    }
    return specs;
  }

  add(spec: BotSpec, state: PlayerState, sim: PlayerSim): NPCBot {
    const identity = NPC_IDENTITIES.find((n) => n.name === spec.nickname);
    const bot = new NPCBot(spec.id, spec.difficulty, identity?.personality ?? 'FOLLOWER', createRng(this.seed++), state, sim);
    this.bots.set(spec.id, bot);
    return bot;
  }

  has(id: string): boolean {
    return this.bots.has(id);
  }

  get count(): number {
    return this.bots.size;
  }

  clear(): void {
    this.bots.clear();
  }

  resetRound(): void {
    for (const bot of this.bots.values()) bot.resetRound();
  }

  /** Let every active bot consider using its element this tick. */
  updateElements(dt: number, gameTime: number, view: ElementBotView): void {
    for (const bot of this.bots.values()) {
      if (!bot.state.alive || bot.state.roundState !== 'ACTIVE') continue;
      updateBotElement(bot, dt, gameTime, view);
    }
  }

  /**
   * Drive every active bot for one tick.
   * @param movement whether the current game uses walking (inputs go through PlayerSim like a human's)
   * @param act routes actions through the same handler as human ACTION messages
   */
  update(
    strategy: NpcStrategy | null,
    movement: boolean,
    dt: number,
    gameTime: number,
    act: (id: string, action: GameAction) => void,
    attack: (id: string, yaw?: number, pitch?: number) => void = () => {},
  ): void {
    if (!strategy) return;
    for (const bot of this.bots.values()) {
      if (!bot.state.alive || bot.state.roundState !== 'ACTIVE') continue;
      const io: BotIO = {
        move: (intent) => {
          if (!movement) return;
          this.batch.s = bot.sim.nextSeq;
          this.batch.i[0] = intent.dirX;
          this.batch.i[1] = intent.dirZ;
          this.batch.i[2] = intent.jump ? 1 : 0;
          bot.sim.enqueue(this.batch);
        },
        act: (action) => act(bot.id, action),
        attack: (yaw?: number, pitch?: number) => attack(bot.id, yaw, pitch),
      };
      strategy.update(bot, io, dt, gameTime);
      if (movement) {
        io.move(bot.intent);
        bot.intent.jump = false; // jumps are one-shot
      }
    }
  }
}
