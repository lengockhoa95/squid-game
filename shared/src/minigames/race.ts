import type { Box, CharacterState, SimWorld } from '../sim/kinematics.ts';
import { stepCharacter } from '../sim/kinematics.ts';
import type { StepFn } from '../sim/step.ts';

export const RACE = {
  halfWidth: 6,
  startZ: 30,
  finishZ: -106,
  killY: -6,
  /** Checkpoint z values, from start to end. Respawn at the last one passed. */
  checkpoints: [30, 11, -9, -23, -50, -73.5, -88] as const,
} as const;

/** Floor segments (gaps between them must be jumped). */
const FLOOR: ReadonlyArray<[number, number]> = [
  [33, 13.6],
  [11.6, -5.6],
  [-7.4, -46],
  [-48.2, -70],
  [-72, -110],
];
const WALL_HEIGHT = 0.9;
const WALL_ZS = [20, -13, -56, -84];

export interface Pusher {
  z: number;
  depth: number;
  width: number;
  amplitude: number;
  speed: number;
  phase: number;
  top: number;
}
export const PUSHERS: readonly Pusher[] = [
  { z: 5, depth: 1.6, width: 3.2, amplitude: 3.8, speed: 1.4, phase: 0, top: 1.8 },
  { z: -0.5, depth: 1.6, width: 3.2, amplitude: 3.8, speed: 1.7, phase: Math.PI, top: 1.8 },
  { z: -18, depth: 1.6, width: 4, amplitude: 3.4, speed: 1.2, phase: 1, top: 1.8 },
  { z: -61, depth: 1.6, width: 3.6, amplitude: 3.8, speed: 1.6, phase: 2, top: 1.8 },
  { z: -65.5, depth: 1.6, width: 3.6, amplitude: 3.8, speed: 1.9, phase: 0.5, top: 1.8 },
  { z: -93, depth: 1.6, width: 4.2, amplitude: 3.4, speed: 1.4, phase: 2.5, top: 1.8 },
];

export interface Sweeper {
  x: number;
  z: number;
  length: number;
  speed: number;
  /** Bar height above its floor: characters whose feet are higher are not hit (jump over it). */
  height: number;
  /** Floor height the bar spins on (default 0). */
  y?: number;
}
export const SWEEPERS: readonly Sweeper[] = [
  { x: 0, z: -30, length: 5, speed: 1.5, height: 0.7 },
  { x: 0, z: -40, length: 4.5, speed: -1.9, height: 0.7 },
  { x: 0, z: -80, length: 5, speed: 2.1, height: 0.7 },
  { x: 0, z: -101, length: 4.5, speed: -2.3, height: 0.7 },
];
const SWEEP_KNOCKBACK = 9;

export interface RaceWorld {
  world: SimWorld;
  /** The pusher boxes inside world.boxes, updated in place by `updateRaceWorld`. */
  pushers: Box[];
}

export function createRaceWorld(): RaceWorld {
  const hw = RACE.halfWidth;
  const boxes: Box[] = FLOOR.map(([a, b]) => ({ minX: -hw, maxX: hw, minZ: b, maxZ: a, top: 0 }));
  for (const z of WALL_ZS) boxes.push({ minX: -hw, maxX: hw, minZ: z - 0.4, maxZ: z + 0.4, top: WALL_HEIGHT });
  for (const sw of SWEEPERS) boxes.push({ minX: sw.x - 0.45, maxX: sw.x + 0.45, minZ: sw.z - 0.45, maxZ: sw.z + 0.45, top: 1.2 });
  const pushers = PUSHERS.map((p) => ({ minX: 0, maxX: 0, minZ: p.z - p.depth / 2, maxZ: p.z + p.depth / 2, top: p.top }));
  boxes.push(...pushers);
  const rw: RaceWorld = {
    world: { bounds: { minX: -hw, maxX: hw, minZ: -110, maxZ: 33 }, boxes, killY: RACE.killY, noFloor: true },
    pushers,
  };
  updateRaceWorld(rw, 0);
  return rw;
}

export function pusherX(p: Pusher, t: number): number {
  return Math.sin(t * p.speed + p.phase) * p.amplitude;
}

export function updateRaceWorld(rw: RaceWorld, t: number): void {
  PUSHERS.forEach((p, i) => {
    const box = rw.pushers[i]!;
    const x = pusherX(p, t);
    box.minX = x - p.width / 2;
    box.maxX = x + p.width / 2;
  });
}

export function sweeperAngle(sw: Sweeper, t: number): number {
  return t * sw.speed;
}

/** Rotating bars knock characters back when they touch them (unless jumping over). */
export function applySweepers(s: CharacterState, t: number, radius: number, list: readonly Sweeper[] = SWEEPERS): boolean {
  let hit = false;
  for (const sw of list) {
    if (sw.y !== undefined && Math.abs(s.y - sw.y) > 1.5) continue; // bar on another level
    if (s.y > (sw.y ?? 0) + sw.height) continue;
    const a = sweeperAngle(sw, t);
    const ex = Math.cos(a);
    const ez = Math.sin(a);
    const rx = s.x - sw.x;
    const rz = s.z - sw.z;
    // Bar is a full diameter through the pivot: project onto it.
    const along = Math.max(-sw.length, Math.min(sw.length, rx * ex + rz * ez));
    const cx = rx - along * ex;
    const cz = rz - along * ez;
    const d = Math.hypot(cx, cz);
    if (d >= radius + 0.15) continue;
    // Exactly on the bar's axis: push perpendicular to it.
    const nx = d > 1e-6 ? cx / d : -ez;
    const nz = d > 1e-6 ? cz / d : ex;
    s.x += nx * (radius + 0.15 - d);
    s.z += nz * (radius + 0.15 - d);
    s.vx = nx * SWEEP_KNOCKBACK;
    s.vz = nz * SWEEP_KNOCKBACK;
    hit = true;
  }
  return hit;
}

export function raceStep(rw: RaceWorld, radius: number): StepFn {
  return (s, intent, dt, t) => {
    updateRaceWorld(rw, t);
    stepCharacter(s, intent, dt, rw.world);
    applySweepers(s, t, radius);
  };
}

export function raceSpawn(slot: number): { x: number; z: number; yaw: number } {
  return { x: -3 + slot * 2, z: RACE.startZ - 1, yaw: Math.PI };
}

/** Last checkpoint z passed for a given position (checkpoints are ordered from start to end). */
export function raceCheckpoint(z: number): number {
  let cp: number = RACE.checkpoints[0];
  for (const c of RACE.checkpoints) if (z <= c) cp = c;
  return cp;
}

export const RACE_LAYOUT = { floor: FLOOR, wallZs: WALL_ZS, wallHeight: WALL_HEIGHT } as const;
