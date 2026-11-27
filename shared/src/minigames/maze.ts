import { createRng } from '../sim/rng.ts';
import type { Box, SimWorld } from '../sim/kinematics.ts';

/** Mê Cung: a random maze (same on server and clients from a seed); a minotaur chases the players. */
export const MAZE = {
  cols: 15,
  rows: 15,
  cell: 4,
  wallHeight: 3,
  wallThickness: 0.6,
  /** Share of the remaining inner walls knocked down after generation (loops make escapes possible). */
  braid: 0.12,
  minotaurDelay: 5,
  minotaurSpeed: 5,
  /** Extra speed per second of game time. */
  minotaurAccel: 0.03,
  minotaurMaxSpeed: 7.2,
  catchRadius: 1.1,
} as const;

export const MAZE_HALF_W = (MAZE.cols * MAZE.cell) / 2;
export const MAZE_HALF_D = (MAZE.rows * MAZE.cell) / 2;
/** Exit opening: top edge (row 0, middle column). Crossing this z finishes. */
export const MAZE_EXIT_COL = Math.floor(MAZE.cols / 2);
export const MAZE_EXIT_Z = -MAZE_HALF_D - 1;
export const MAZE_START_ROW = MAZE.rows - 1;

export interface Maze {
  /** Wall on the north side of cell (r, c): index r * cols + c, r in [0, rows] (row `rows` = south border). */
  north: boolean[];
  /** Wall on the west side of cell (r, c): index r * (cols + 1) + c, c in [0, cols] (col `cols` = east border). */
  west: boolean[];
}

const nIdx = (r: number, c: number) => r * MAZE.cols + c;
const wIdx = (r: number, c: number) => r * (MAZE.cols + 1) + c;

/** Recursive-backtracker maze plus braiding. Deterministic for a seed. */
export function generateMaze(seed: number): Maze {
  const rng = createRng(seed);
  const north = new Array<boolean>((MAZE.rows + 1) * MAZE.cols).fill(true);
  const west = new Array<boolean>(MAZE.rows * (MAZE.cols + 1)).fill(true);
  const seen = new Array<boolean>(MAZE.rows * MAZE.cols).fill(false);
  const stack: Array<[number, number]> = [[MAZE_START_ROW, MAZE_EXIT_COL]];
  seen[nIdx(MAZE_START_ROW, MAZE_EXIT_COL)] = true;
  while (stack.length > 0) {
    const [r, c] = stack[stack.length - 1]!;
    const options: Array<[number, number]> = [];
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nc >= 0 && nr < MAZE.rows && nc < MAZE.cols && !seen[nIdx(nr, nc)]) options.push([nr, nc]);
    }
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const [nr, nc] = options[Math.floor(rng() * options.length)]!;
    openBetween(north, west, r, c, nr, nc);
    seen[nIdx(nr, nc)] = true;
    stack.push([nr, nc]);
  }
  // Braid: knock down some inner walls to create loops.
  for (let r = 1; r < MAZE.rows; r++) for (let c = 0; c < MAZE.cols; c++) if (north[nIdx(r, c)] && rng() < MAZE.braid) north[nIdx(r, c)] = false;
  for (let r = 0; r < MAZE.rows; r++) for (let c = 1; c < MAZE.cols; c++) if (west[wIdx(r, c)] && rng() < MAZE.braid) west[wIdx(r, c)] = false;
  north[nIdx(0, MAZE_EXIT_COL)] = false; // exit gate
  // Open start area: the whole bottom row is one corridor so everyone spawns together.
  for (let c = 1; c < MAZE.cols; c++) west[wIdx(MAZE_START_ROW, c)] = false;
  return { north, west };
}

function openBetween(north: boolean[], west: boolean[], r: number, c: number, nr: number, nc: number): void {
  if (nr < r) north[nIdx(r, c)] = false;
  else if (nr > r) north[nIdx(nr, c)] = false;
  else if (nc < c) west[wIdx(r, c)] = false;
  else west[wIdx(r, nc)] = false;
}

export function cellCenter(r: number, c: number): { x: number; z: number } {
  return { x: -MAZE_HALF_W + (c + 0.5) * MAZE.cell, z: -MAZE_HALF_D + (r + 0.5) * MAZE.cell };
}

/** Cell containing a point (clamped to the grid). */
export function cellAt(x: number, z: number): { r: number; c: number } {
  const c = Math.max(0, Math.min(MAZE.cols - 1, Math.floor((x + MAZE_HALF_W) / MAZE.cell)));
  const r = Math.max(0, Math.min(MAZE.rows - 1, Math.floor((z + MAZE_HALF_D) / MAZE.cell)));
  return { r, c };
}

export function mazeOpen(m: Maze, r: number, c: number, dr: number, dc: number): boolean {
  const nr = r + dr;
  const nc = c + dc;
  if (nr < 0 || nc < 0 || nr >= MAZE.rows || nc >= MAZE.cols) return false;
  if (dr === -1) return !m.north[nIdx(r, c)];
  if (dr === 1) return !m.north[nIdx(nr, c)];
  if (dc === -1) return !m.west[wIdx(r, c)];
  return !m.west[wIdx(r, nc)];
}

/** BFS distances (in cells) from a cell to every cell; -1 = unreachable. `blocked` cells are avoided. */
export function mazeDistances(m: Maze, r0: number, c0: number, blocked?: (r: number, c: number) => boolean): Int16Array {
  const dist = new Int16Array(MAZE.rows * MAZE.cols).fill(-1);
  const queue: number[] = [nIdx(r0, c0)];
  dist[nIdx(r0, c0)] = 0;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    const r = Math.floor(i / MAZE.cols);
    const c = i % MAZE.cols;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      if (!mazeOpen(m, r, c, dr, dc)) continue;
      const j = nIdx(r + dr, c + dc);
      if (dist[j] !== -1 || blocked?.(r + dr, c + dc)) continue;
      dist[j] = dist[i]! + 1;
      queue.push(j);
    }
  }
  return dist;
}

/** Next cell to step into when walking from (r, c) down a distance field toward its origin. */
export function nextStep(m: Maze, dist: Int16Array, r: number, c: number): { r: number; c: number } | null {
  const here = dist[nIdx(r, c)]!;
  if (here <= 0) return null;
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    if (!mazeOpen(m, r, c, dr, dc)) continue;
    const d = dist[nIdx(r + dr, c + dc)]!;
    if (d >= 0 && d < here) return { r: r + dr, c: c + dc };
  }
  return null;
}

/** Wall boxes for collision and rendering. */
export function mazeWalls(m: Maze): Box[] {
  const boxes: Box[] = [];
  const t = MAZE.wallThickness / 2;
  const top = MAZE.wallHeight;
  for (let r = 0; r <= MAZE.rows; r++) {
    for (let c = 0; c < MAZE.cols; c++) {
      if (!m.north[nIdx(r, c)]) continue;
      const z = -MAZE_HALF_D + r * MAZE.cell;
      const x0 = -MAZE_HALF_W + c * MAZE.cell;
      boxes.push({ minX: x0 - t, maxX: x0 + MAZE.cell + t, minZ: z - t, maxZ: z + t, top });
    }
  }
  for (let r = 0; r < MAZE.rows; r++) {
    for (let c = 0; c <= MAZE.cols; c++) {
      if (!m.west[wIdx(r, c)]) continue;
      const x = -MAZE_HALF_W + c * MAZE.cell;
      const z0 = -MAZE_HALF_D + r * MAZE.cell;
      boxes.push({ minX: x - t, maxX: x + t, minZ: z0 - t, maxZ: z0 + MAZE.cell + t, top });
    }
  }
  return boxes;
}

export function createMazeWorld(m: Maze): SimWorld {
  return {
    bounds: { minX: -MAZE_HALF_W - 2, maxX: MAZE_HALF_W + 2, minZ: MAZE_EXIT_Z - 4, maxZ: MAZE_HALF_D + 2 },
    boxes: mazeWalls(m),
    killY: -10,
  };
}

export function minotaurSpeed(t: number): number {
  return Math.min(MAZE.minotaurMaxSpeed, MAZE.minotaurSpeed + MAZE.minotaurAccel * Math.max(0, t - MAZE.minotaurDelay));
}

export function mazeSpawn(slot: number): { x: number; z: number; yaw: number } {
  const c = cellCenter(MAZE_START_ROW, MAZE_EXIT_COL - 1 + (slot % 3));
  return { x: c.x + (slot === 3 ? 1 : 0), z: c.z, yaw: Math.PI };
}
