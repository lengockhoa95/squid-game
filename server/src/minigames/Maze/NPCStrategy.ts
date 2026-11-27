import { MAZE, MAZE_EXIT_COL, MAZE_EXIT_Z, cellAt, cellCenter, mazeDistances, mazeOpen, nextStep, type Difficulty } from '@sp/shared';

const WRONG_TURN: Record<Difficulty, number> = { EASY: 0.35, NORMAL: 0.25, HARD: 0.15, SMART: 0.08 };
import type { NPCBot, BotIO, NpcStrategy } from '../../npc/NPCBot.ts';
import type { MazeRun } from './Logic.ts';

/**
 * Maze bots walk the shortest path to the exit. HARD/SMART bots route around the minotaur (cells near
 * it count as blocked when another way exists); EASY/NORMAL bots sometimes take a wrong turn.
 */
export class MazeStrategy implements NpcStrategy {
  private readonly game: MazeRun;

  constructor(game: MazeRun) {
    this.game = game;
  }

  update(bot: NPCBot, _io: BotIO, dt: number): void {
    const s = bot.sim.state;
    const m = bot.memory;
    m.clock = ((m.clock as number | undefined) ?? 0) + dt;
    const here = cellAt(s.x, s.z);
    if (here.r === 0 && here.c === MAZE_EXIT_COL) {
      bot.steerTo(s.x, MAZE_EXIT_Z - 3); // through the gate
      return;
    }
    if (!bot.shouldThink(dt, 5) && m.wx !== undefined) {
      bot.steerTo(m.wx as number, m.wz as number);
      return;
    }
    const careful = bot.difficulty === 'HARD' || bot.difficulty === 'SMART';
    const mino = this.game.minotaurCell();
    let field = this.game.exitDist;
    if (careful && mino) {
      const avoid = bot.difficulty === 'SMART' ? 2 : 1;
      const blocked = (r: number, c: number) => Math.abs(r - mino.r) + Math.abs(c - mino.c) <= avoid;
      const detour = mazeDistances(this.game.maze, 0, MAZE_EXIT_COL, blocked);
      if (detour[here.r * MAZE.cols + here.c]! > 0) field = detour;
    }
    let next = nextStep(this.game.maze, field, here.r, here.c);
    const options = ([[-1, 0], [1, 0], [0, -1], [0, 1]] as const)
      .filter(([dr, dc]) => mazeOpen(this.game.maze, here.r, here.c, dr, dc))
      .map(([dr, dc]) => ({ r: here.r + dr, c: here.c + dc }));
    const cellKey = here.r * MAZE.cols + here.c;
    if (m.wrongR === here.r && m.wrongC === here.c) m.wrongR = -1; // explored the wrong way: back on track
    const chased = mino !== null && Math.abs(mino.r - here.r) + Math.abs(mino.c - here.c) <= 3;
    if (options.length >= 3 && m.junction !== cellKey) {
      // New junction: hesitate a moment (nobody knows the maze), maybe pick a wrong way — unless chased.
      m.junction = cellKey;
      m.pauseUntil = chased ? 0 : ((m.clock as number | undefined) ?? 0) + bot.reactionDelay(1.2);
      const wrong = options.filter((o) => !next || o.r !== next.r || o.c !== next.c);
      const pick = bot.chance(WRONG_TURN[bot.difficulty]) ? wrong[Math.floor(bot.rng() * wrong.length)] : undefined;
      m.wrongR = pick ? pick.r : -1;
      m.wrongC = pick ? pick.c : -1;
    }
    if (m.wrongR !== undefined && (m.wrongR as number) >= 0) next = { r: m.wrongR as number, c: m.wrongC as number };
    if (((m.clock as number | undefined) ?? 0) < ((m.pauseUntil as number | undefined) ?? 0)) {
      bot.stopMoving();
      delete m.wx;
      return;
    }
    const c = next ? cellCenter(next.r, next.c) : cellCenter(here.r, here.c);
    m.wx = c.x + bot.noise(0.3);
    m.wz = c.z + bot.noise(0.3);
    bot.steerTo(m.wx as number, m.wz as number);
  }
}

