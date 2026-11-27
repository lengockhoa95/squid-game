import { BRIDGE, TILE_BROKEN, TILE_SAFE, tileIndex, type BridgeSide } from '@sp/shared';
import type { MatchState } from '@sp/shared/schema';
import type { NPCBot, BotIO, NpcStrategy } from '../../npc/NPCBot.ts';
import type { GlassBridge } from './Logic.ts';

/**
 * Bridge bots: if the next row is already solved, jump to the safe tile after a reaction delay.
 * Otherwise wait for someone else to test it — patience depends on personality — unless time is
 * running out. SMART bots compute exactly how long they can afford to wait. EASY bots sometimes
 * ignore what has been revealed (errorRate).
 */
const SIDES: readonly BridgeSide[] = [0, 1, 2];

export class BridgeStrategy implements NpcStrategy {
  private readonly game: GlassBridge;
  private readonly match: MatchState;

  constructor(game: GlassBridge, match: MatchState) {
    this.game = game;
    this.match = match;
  }

  update(bot: NPCBot, io: BotIO, dt: number): void {
    const view = this.game.view();
    if (view.jumping(bot.id)) return;
    const m = bot.memory;
    const row = view.progress.get(bot.id) ?? 0;
    if (m.row !== row) {
      m.row = row;
      m.waited = 0;
      m.delay = bot.reactionDelay(1.6);
      m.patience = this.patience(bot);
    }
    m.waited = (m.waited as number) + dt;
    if ((m.waited as number) < (m.delay as number)) return;

    const rows = this.game.getState().rows;
    if (row >= rows) {
      io.act({ kind: 'JUMP_TILE', side: 0 });
      return;
    }
    const known = this.knownSafe(view.tiles, row);
    if (known !== null && !bot.chance(bot.profile.errorRate * (bot.difficulty === 'EASY' ? 2 : 0.5))) {
      io.act({ kind: 'JUMP_TILE', side: known });
      return;
    }
    // Someone is already testing this row: watch where they land first.
    if (view.someoneJumpingTo(row)) return;
    const rowsLeft = rows - row + 1;
    const timeNeeded = rowsLeft * (BRIDGE.jumpTime + BRIDGE.cooldown + 0.6) + 1.5;
    const hurry = this.match.timer <= timeNeeded;
    const someoneBehindOrLevel = [...view.progress.entries()].some(
      ([id, r]) => id !== bot.id && r <= row && !view.jumping(id) && this.isActive(id),
    );
    // Wait while patient, unless nobody else can test this row for us.
    if (!hurry && someoneBehindOrLevel && (m.waited as number) < (m.patience as number)) return;
    const side = known ?? this.preferredSide(view.tiles, row, bot);
    io.act({ kind: 'JUMP_TILE', side });
  }

  private patience(bot: NPCBot): number {
    if (bot.profile.situational) {
      const rowsLeft = this.game.getState().rows - ((bot.memory.row as number) ?? 0) + 1;
      // Waiting is the smart play on a glass bridge, but never perfectly patient.
      return (Math.max(0, this.match.timer - rowsLeft * 1.6 - 4) / 2) * (0.35 + bot.rng() * 0.45);
    }
    const range = { BOLD: [0.3, 1.5], CAUTIOUS: [3, 7], FOLLOWER: [2, 5] }[bot.personality];
    return range[0]! + bot.rng() * (range[1]! - range[0]!);
  }

  private knownSafe(tiles: readonly number[], row: number): BridgeSide | null {
    for (const side of SIDES) if (tiles[tileIndex(row, side)] === TILE_SAFE) return side;
    return null;
  }

  /** Random among tiles not known to be broken. */
  private preferredSide(tiles: readonly number[], row: number, bot: NPCBot): BridgeSide {
    const options = SIDES.filter((side) => tiles[tileIndex(row, side)] !== TILE_BROKEN);
    return options[Math.floor(bot.rng() * options.length)] ?? 0;
  }

  private isActive(id: string): boolean {
    return this.match.players.get(id)?.roundState === 'ACTIVE';
  }
}
