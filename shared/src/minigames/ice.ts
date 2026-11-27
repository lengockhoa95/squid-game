import { MOVEMENT, type MovementParams } from '../config/movement.ts';
import { stepCharacter, type Box, type SimWorld } from '../sim/kinematics.ts';
import type { StepFn } from '../sim/step.ts';

/** Đua Băng Trơn: a winding track of ice. Slow to speed up, slower to stop; corners throw you off. */
export const ICE = {
  width: 6,
  killY: -8,
  /** Distance before the end of the path that counts as finished. */
  finishMargin: 3,
} as const;

/** Centre line of the track (axis-aligned segments). */
export const ICE_PATH: ReadonlyArray<{ x: number; z: number }> = [
  { x: 0, z: 34 },
  { x: 0, z: 2 },
  { x: 24, z: 2 },
  { x: 24, z: -30 },
  { x: -4, z: -30 },
  { x: -4, z: -66 },
];

/** Ice: same top speed a bit higher, but very little grip. */
export const ICE_MOVEMENT: Readonly<MovementParams> = { ...MOVEMENT, walkSpeed: 9, accel: 5.5, decel: 1.2, airControl: 0.5 };

/** Bumpers (pillars) on the straights. */
export const ICE_BUMPERS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -1.5, z: 20 }, { x: 1.8, z: 12 }, { x: 12, z: 3.2 }, { x: 22.5, z: -10 }, { x: 25.5, z: -18 },
  { x: 10, z: -29 }, { x: -4, z: -44 }, { x: -2, z: -52 },
];

const SEGMENTS = ICE_PATH.slice(1).map((b, i) => {
  const a = ICE_PATH[i]!;
  return { a, b, length: Math.hypot(b.x - a.x, b.z - a.z) };
});
export const ICE_LENGTH = SEGMENTS.reduce((s, seg) => s + seg.length, 0);

/** Distance travelled along the centre line for the point closest to (x, z). */
export function iceProgress(x: number, z: number): number {
  let best = Infinity;
  let progress = 0;
  let acc = 0;
  for (const seg of SEGMENTS) {
    const dx = seg.b.x - seg.a.x;
    const dz = seg.b.z - seg.a.z;
    const t = Math.max(0, Math.min(1, ((x - seg.a.x) * dx + (z - seg.a.z) * dz) / (seg.length * seg.length)));
    const px = seg.a.x + dx * t;
    const pz = seg.a.z + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best - 1e-6) {
      best = d;
      progress = acc + t * seg.length;
    }
    acc += seg.length;
  }
  return progress;
}

/** Point on the centre line at a given distance along it. */
export function icePointAt(distance: number): { x: number; z: number } {
  let left = Math.max(0, Math.min(ICE_LENGTH, distance));
  for (const seg of SEGMENTS) {
    if (left <= seg.length) {
      const t = left / seg.length;
      return { x: seg.a.x + (seg.b.x - seg.a.x) * t, z: seg.a.z + (seg.b.z - seg.a.z) * t };
    }
    left -= seg.length;
  }
  return ICE_PATH[ICE_PATH.length - 1]!;
}

/** Respawn spots: every 12 m along the track. */
export function iceCheckpoint(bestProgress: number): { x: number; z: number; progress: number } {
  const progress = Math.max(2, Math.floor(bestProgress / 12) * 12);
  return { ...icePointAt(progress), progress };
}

export function createIceWorld(): SimWorld {
  const h = ICE.width / 2;
  const boxes: Box[] = SEGMENTS.map(({ a, b }) => ({
    minX: Math.min(a.x, b.x) - h,
    maxX: Math.max(a.x, b.x) + h,
    minZ: Math.min(a.z, b.z) - h,
    maxZ: Math.max(a.z, b.z) + h,
    top: 0,
    bottom: -1,
  }));
  for (const p of ICE_BUMPERS) boxes.push({ minX: p.x - 0.6, maxX: p.x + 0.6, minZ: p.z - 0.6, maxZ: p.z + 0.6, top: 1.6, bottom: -1 });
  return { bounds: { minX: -20, maxX: 40, minZ: -72, maxZ: 40 }, boxes, killY: ICE.killY, noFloor: true };
}

export function iceStep(world: SimWorld): StepFn {
  return (s, intent, dt) => stepCharacter(s, intent, dt, world, ICE_MOVEMENT);
}

export function iceSpawn(slot: number): { x: number; z: number; yaw: number } {
  return { x: -2.4 + slot * 1.6, z: ICE_PATH[0]!.z - 1, yaw: Math.PI };
}
