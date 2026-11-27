import {
  BRIDGE, BRIDGE_PLATFORM_HALF, TILE_BROKEN, TILE_SAFE, bridgeFinishZ, bridgeRowZ, bridgeTileUnder, tileIndex,
  type BridgeSide,
} from '@sp/shared';
import type { MatchState } from '@sp/shared/schema';
import type { NPCBot, BotIO, NpcStrategy } from '../../npc/NPCBot.ts';
import type { GlassBridge } from './Logic.ts';

const SIDES: readonly BridgeSide[] = [0, 1, 2];
/** Jump when this close (horizontally) to the target tile's centre. */
const JUMP_DIST = 2.6;
const SECONDS_PER_ROW = 1.4;

/**
 * Bridge bots walk and jump like players. If the next row is solved they hop onto a safe tile;
 * otherwise they wait for someone else to test it — patience depends on personality, SMART bots
 * work out how long they can afford — unless time is running out. EASY bots sometimes ignore
 * what has been revealed.
 */
export class BridgeStrategy implements NpcStrategy {
  private readonly game: GlassBridge;
  private readonly match: MatchState;

  constructor(game: GlassBridge, match: MatchState) {
    this.game = game;
    this.match = match;
  }

  update(bot: NPCBot, _io: BotIO, dt: number): void {
    const s = bot.sim.state;
    const m = bot.memory;
    const view = this.game.view();
    const rows = view.world.rows;
    // Where am I? Start platform = row 0 next; on a tile of row r = row r+1 next.
    const under = bridgeTileUnder(view.world, s);
    if (s.grounded && Math.abs(s.y) < 0.05) {
      if (under >= 0) m.next = Math.floor(under / BRIDGE.tilesPerRow) + 1;
      else if (s.z > BRIDGE.startZ - 2) m.next = 0;
    }
    const next = (m.next as number | undefined) ?? 0;
    if (m.planned !== next) {
      m.planned = next;
      m.waited = 0;
      m.delay = bot.reactionDelay(1.4);
      m.patience = this.patience(bot, next);
      delete m.side;
    }
    m.waited = (m.waited as number) + dt;

    if (next >= rows) {
      // Last row behind us: run onto the finish platform.
      bot.steerTo(s.x * 0.5, bridgeFinishZ(rows) - 2);
      this.jumpWhenClose(bot, s.x, bridgeFinishZ(rows) - 0.5);
      return;
    }
    if (m.side === undefined && (m.waited as number) >= (m.delay as number)) {
      const side = this.chooseSide(bot, next, (m.waited as number) >= (m.patience as number));
      if (side !== null) m.side = side;
    }
    if (m.side === undefined) {
      this.holdPosition(bot, next);
      return;
    }
    const x = BRIDGE.tileX[m.side as BridgeSide];
    const z = bridgeRowZ(next);
    bot.steerTo(x, z);
    this.jumpWhenClose(bot, x, z);
  }

  /** Pick a tile for `row`, or null to keep waiting. */
  private chooseSide(bot: NPCBot, row: number, impatient: boolean): BridgeSide | null {
    const tiles = this.game.view().tiles;
    const ignoresInfo = bot.chance(bot.profile.errorRate * (bot.difficulty === 'EASY' ? 1.5 : 0.3));
    const safe = SIDES.filter((k) => tiles[tileIndex(row, k)] === TILE_SAFE);
    if (safe.length > 0 && !ignoresInfo) return safe[Math.floor(bot.rng() * safe.length)]!;
    const hinted = this.game.hintFor(bot.id, row);
    const options = SIDES.filter((k) => tiles[tileIndex(row, k)] !== TILE_BROKEN && k !== hinted);
    if (hinted !== null) return options[Math.floor(bot.rng() * options.length)] ?? null;
    const rowsLeft = this.game.view().world.rows - row;
    const hurry = this.match.timer <= rowsLeft * SECONDS_PER_ROW + 3;
    const someoneElseCanTest = [...this.game.view().progress.entries()].some(
      ([id, r]) => id !== bot.id && r <= row && this.isActive(id),
    );
    if (!hurry && !impatient && someoneElseCanTest) return null;
    return options[Math.floor(bot.rng() * options.length)] ?? null;
  }

  /** Wait near the front edge of where we stand (start platform or current tile). */
  private holdPosition(bot: NPCBot, next: number): void {
    const s = bot.sim.state;
    if (next === 0) {
      const x = Math.max(-BRIDGE_PLATFORM_HALF + 1, Math.min(BRIDGE_PLATFORM_HALF - 1, s.x));
      bot.steerTo(x, BRIDGE.startZ - 0.8);
      return;
    }
    const under = bridgeTileUnder(this.game.view().world, s);
    if (under >= 0) bot.steerTo(BRIDGE.tileX[(under % BRIDGE.tilesPerRow) as BridgeSide], bridgeRowZ(next - 1));
    else bot.stopMoving();
  }

  private jumpWhenClose(bot: NPCBot, x: number, z: number): void {
    const s = bot.sim.state;
    const d = Math.hypot(x - s.x, z - s.z);
    const sloppy = bot.difficulty === 'EASY' ? (bot.rng() - 0.5) * 0.8 : 0;
    if (s.grounded && z < s.z - 0.6 && d < JUMP_DIST + sloppy && d > 0.9) bot.intent.jump = true;
    // About to step off an edge while heading for the target: jump now.
    const speed = Math.hypot(s.vx, s.vz);
    if (s.grounded && speed > 1.5 && z < s.z - 0.6) {
      const ax = s.x + (s.vx / speed) * 0.45;
      const az = s.z + (s.vz / speed) * 0.45;
      if (!this.groundAt(ax, az)) bot.intent.jump = true;
    }
  }

  private groundAt(x: number, z: number): boolean {
    for (const b of this.game.view().world.world.boxes) {
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && Math.abs(b.top) < 0.1) return true;
    }
    return false;
  }

  private patience(bot: NPCBot, row: number): number {
    if (bot.profile.situational) {
      const rowsLeft = this.game.view().world.rows - row;
      // Waiting is the smart play on a glass bridge, but never perfectly patient.
      return (Math.max(0, this.match.timer - rowsLeft * SECONDS_PER_ROW - 4) / 2) * (0.35 + bot.rng() * 0.45);
    }
    const range = { BOLD: [0.3, 1.5], CAUTIOUS: [3, 7], FOLLOWER: [2, 5] }[bot.personality];
    return range[0]! + bot.rng() * (range[1]! - range[0]!);
  }

  private isActive(id: string): boolean {
    return this.match.players.get(id)?.roundState === 'ACTIVE';
  }
}
