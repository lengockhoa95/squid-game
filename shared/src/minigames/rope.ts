import { stepCharacter, type Box, type SimWorld } from '../sim/kinematics.ts';
import type { StepFn } from '../sim/step.ts';

/**
 * Leo Dây Nhện: stations climbing upward, linked by swaying plank bridges (a travelling wave,
 * strongest mid-span). Gusts of wind push everyone sideways now and then.
 */
export const ROPE = {
  stations: 6,
  stationSize: 5,
  bridgeLen: 10,
  planks: 8,
  plankWidth: 1.3,
  rise: 1.6,
  sway: 1.3,
  killY: -10,
  gustPeriod: 6,
  gustLength: 1.6,
  gustSpeed: 2.4,
} as const;

const SPAN = ROPE.stationSize + ROPE.bridgeLen;

export function stationCenter(i: number): { x: number; y: number; z: number } {
  return { x: 0, y: i * ROPE.rise, z: -i * SPAN };
}

export const ROPE_FINISH_Z = stationCenter(ROPE.stations - 1).z + ROPE.stationSize / 2 - 1;

/** Sideways offset of plank k on bridge i at time t. */
export function plankOffset(i: number, k: number, t: number): number {
  return ROPE.sway * Math.sin((Math.PI * (k + 0.5)) / ROPE.planks) * Math.sin(t * 1.3 + i * 1.7 + k * 0.45);
}

export function plankCenter(i: number, k: number, t: number): { x: number; y: number; z: number } {
  const a = stationCenter(i);
  const step = ROPE.bridgeLen / ROPE.planks;
  return { x: plankOffset(i, k, t), y: a.y + ((k + 1) / (ROPE.planks + 1)) * ROPE.rise, z: a.z - ROPE.stationSize / 2 - (k + 0.5) * step };
}

/** Wind (m/s along x) at time t: short gusts, alternating direction. */
export function windAt(t: number): number {
  const phase = t % ROPE.gustPeriod;
  const start = ROPE.gustPeriod - ROPE.gustLength;
  if (phase < start) return 0;
  const n = Math.floor(t / ROPE.gustPeriod);
  const ramp = Math.sin(((phase - start) / ROPE.gustLength) * Math.PI);
  return (n % 2 === 0 ? 1 : -1) * ROPE.gustSpeed * ramp;
}

export interface RopeWorld {
  world: SimWorld;
  planks: Box[];
}

export function createRopeWorld(): RopeWorld {
  const boxes: Box[] = [];
  const h = ROPE.stationSize / 2;
  for (let i = 0; i < ROPE.stations; i++) {
    const c = stationCenter(i);
    boxes.push({ minX: c.x - h, maxX: c.x + h, minZ: c.z - h, maxZ: c.z + h, top: c.y, bottom: c.y - 1 });
  }
  const planks: Box[] = [];
  for (let i = 0; i < ROPE.stations - 1; i++) {
    for (let k = 0; k < ROPE.planks; k++) {
      const p = plankCenter(i, k, 0);
      planks.push({ minX: 0, maxX: 0, minZ: p.z - 0.6, maxZ: p.z + 0.6, top: p.y, bottom: p.y - 0.25 });
    }
  }
  boxes.push(...planks);
  const last = stationCenter(ROPE.stations - 1);
  const rw: RopeWorld = {
    world: { bounds: { minX: -12, maxX: 12, minZ: last.z - 8, maxZ: 8 }, boxes, killY: ROPE.killY, noFloor: true },
    planks,
  };
  updateRopeWorld(rw, 0);
  return rw;
}

export function updateRopeWorld(rw: RopeWorld, t: number): void {
  const hw = ROPE.plankWidth / 2;
  for (let i = 0; i < ROPE.stations - 1; i++) {
    for (let k = 0; k < ROPE.planks; k++) {
      const box = rw.planks[i * ROPE.planks + k]!;
      const x = plankOffset(i, k, t);
      box.minX = x - hw;
      box.maxX = x + hw;
    }
  }
}

export function ropeStep(rw: RopeWorld): StepFn {
  return (s, intent, dt, t) => {
    updateRopeWorld(rw, t);
    stepCharacter(s, intent, dt, rw.world);
    s.x += windAt(t) * dt; // the gust drags you sideways
  };
}

/** Highest station a standing character is on (-1 if none). */
export function stationUnder(x: number, y: number, z: number): number {
  for (let i = ROPE.stations - 1; i >= 0; i--) {
    const c = stationCenter(i);
    const h = ROPE.stationSize / 2;
    if (Math.abs(y - c.y) < 0.2 && Math.abs(x - c.x) <= h && Math.abs(z - c.z) <= h) return i;
  }
  return -1;
}

export function ropeSpawn(slot: number): { x: number; z: number; yaw: number } {
  return { x: -1.8 + slot * 1.2, z: 1.5, yaw: Math.PI };
}
