import {
  MAZE, MAZE_EXIT_COL, MAZE_EXIT_Z, MAZE_START_ROW, MOVEMENT,
  cellAt, cellCenter, createCharacterState, createMazeWorld, generateMaze, intentTowardTarget, mazeDistances, mazeSpawn,
  minotaurSpeed, nextStep, staticWorldStep, stepCharacter,
  type CharacterState, type GameAction, type Maze, type MoveIntent, type MovementParams, type SimWorld, type StepFn,
} from '@sp/shared';
import { MazeState } from '@sp/shared/schema';
import { rankPlayers, type GamePlayer, type MinigameContext, type RoundOutcome, type ServerMinigame } from '../framework/types.ts';

const REPATH_SECONDS = 0.25;
const RESCUE_STUN = 2;

/**
 * Mê Cung: escape a random maze through the exit gate while a minotaur (server-driven, BFS path)
 * chases the nearest player. Caught = out; through the gate = passed.
 * PlayerState.score = cells closer to the exit than the start.
 */
export class MazeRun implements ServerMinigame {
  readonly id = 'MAZE' as const;
  private world!: SimWorld;
  step: StepFn = () => {};
  bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  maze!: Maze;
  /** BFS distance (cells) from every cell to the exit cell. */
  exitDist!: Int16Array;
  private ctx!: MinigameContext;
  private state!: MazeState;
  readonly minotaur: CharacterState = createCharacterState(0, 0);
  private readonly intent: MoveIntent = { dirX: 0, dirZ: 0, jump: false };
  private readonly params: MovementParams = { ...MOVEMENT };
  private target: { x: number; z: number } | null = null;
  private repath = 0;
  private stunnedUntil = 0;
  private readonly finishTimes = new Map<string, number>();
  private readonly caught = new Set<string>();

  initialize(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.state = new MazeState();
    this.state.seed = Math.floor(ctx.rng() * 0xffffffff) >>> 0;
    this.maze = generateMaze(this.state.seed);
    this.world = createMazeWorld(this.maze);
    this.step = staticWorldStep(this.world);
    this.bounds = this.world.bounds;
    this.exitDist = mazeDistances(this.maze, 0, MAZE_EXIT_COL);
    const lair = cellCenter(MAZE_START_ROW, MAZE_EXIT_COL);
    this.minotaur.x = lair.x;
    this.minotaur.z = lair.z + 1;
    this.syncMinotaur();
    ctx.match.maze = this.state;
    for (const p of ctx.players) {
      const s = mazeSpawn(p.state.slot);
      p.sim.reset(s.x, s.z, s.yaw);
    }
  }

  start(): void {}

  handlePlayerInput(_playerId: string, _action: GameAction): void {
    // Movement only.
  }

  update(dt: number, t: number): void {
    for (const p of this.ctx.players) {
      if (p.state.roundState !== 'ACTIVE') continue;
      const s = p.sim.state;
      if (s.z < MAZE_EXIT_Z) {
        p.state.roundState = 'FINISHED';
        this.finishTimes.set(p.id, t);
        continue;
      }
      const { r, c } = cellAt(s.x, s.z);
      p.state.score = Math.max(0, this.exitDist[MAZE_START_ROW * MAZE.cols + MAZE_EXIT_COL]! - this.exitDist[r * MAZE.cols + c]!);
    }
    if (t < MAZE.minotaurDelay) return;
    this.state.active = true;
    this.moveMinotaur(dt, t);
    // Catch.
    for (const p of this.ctx.players) {
      if (p.state.roundState !== 'ACTIVE' || t < this.stunnedUntil) continue;
      const s = p.sim.state;
      if (Math.hypot(s.x - this.minotaur.x, s.z - this.minotaur.z) > MAZE.catchRadius) continue;
      if (this.ctx.tryRescue?.(p.id)) {
        this.stunnedUntil = t + RESCUE_STUN; // the minotaur is dazed, run!
        continue;
      }
      p.state.roundState = 'OUT';
      this.caught.add(p.id);
    }
  }

  /** Public for bots: where the minotaur is (everyone can see it). */
  minotaurCell(): { r: number; c: number } | null {
    return this.state.active ? cellAt(this.minotaur.x, this.minotaur.z) : null;
  }

  getState(): MazeState {
    return this.state;
  }

  isFinished(): boolean {
    return this.ctx.players.every((p) => p.state.roundState !== 'ACTIVE');
  }

  finish(): RoundOutcome {
    const ranking = rankPlayers(this.ctx.players, this.finishTimes, (p) => p.state.score);
    const passed = new Set(this.finishTimes.keys());
    const details = new Map<string, string>();
    for (const p of this.ctx.players) {
      const t = this.finishTimes.get(p.id);
      if (t !== undefined) details.set(p.id, `Thoát sau ${t.toFixed(1)}s`);
      else if (this.caught.has(p.id)) details.set(p.id, 'Bị Minotaur bắt');
      else details.set(p.id, 'Chưa tìm được lối ra');
    }
    return { ranking, passed, details };
  }

  dispose(): void {
    this.ctx.match.maze = undefined;
  }

  private moveMinotaur(dt: number, t: number): void {
    this.params.walkSpeed = t < this.stunnedUntil ? 0 : minotaurSpeed(t);
    this.repath -= dt;
    if (this.repath <= 0 || !this.target) {
      this.repath = REPATH_SECONDS;
      this.target = this.chaseTarget();
    }
    if (this.target) intentTowardTarget(this.minotaur, this.target.x, this.target.z, this.intent, this.params);
    else this.intent.dirX = this.intent.dirZ = 0;
    stepCharacter(this.minotaur, this.intent, dt, this.world, this.params);
    this.syncMinotaur();
  }

  /** Next waypoint toward the nearest (by path) active player. */
  private chaseTarget(): { x: number; z: number } | null {
    const m = cellAt(this.minotaur.x, this.minotaur.z);
    const dist = mazeDistances(this.maze, m.r, m.c);
    let prey: GamePlayer | null = null;
    let best = Infinity;
    for (const p of this.ctx.players) {
      if (p.state.roundState !== 'ACTIVE') continue;
      const { r, c } = cellAt(p.sim.state.x, p.sim.state.z);
      const d = dist[r * MAZE.cols + c]!;
      if (d >= 0 && d < best) {
        best = d;
        prey = p;
      }
    }
    if (!prey) return null;
    if (best <= 0) return { x: prey.sim.state.x, z: prey.sim.state.z }; // same cell: lunge
    // Walk the path back from the prey to find the minotaur's next cell.
    let { r, c } = cellAt(prey.sim.state.x, prey.sim.state.z);
    for (;;) {
      const step = nextStep(this.maze, dist, r, c);
      if (!step) break;
      if (step.r === m.r && step.c === m.c) break;
      r = step.r;
      c = step.c;
    }
    return cellCenter(r, c);
  }

  private syncMinotaur(): void {
    this.state.mx = this.minotaur.x;
    this.state.mz = this.minotaur.z;
    this.state.myaw = this.minotaur.yaw;
  }
}
