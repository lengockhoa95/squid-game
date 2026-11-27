import { staticWorldStep, type StepFn } from '../sim/step.ts';
import type { Box, SimWorld } from '../sim/kinematics.ts';

/** Zombie Lây Lan: one player turns, every touch infects. Survive until time runs out. */
export const ZOMBIE = {
  half: 17,
  /** Seconds before patient zero turns. */
  outbreakAt: 2,
  infectRadius: 0.9,
  speedMul: 0.96,
  /** Fresh zombies cannot infect for a moment (no instant chain reactions). */
  infectCooldown: 1,
} as const;

/** Team values on PlayerState.team for this game. */
export const TEAM_HUMAN = 0;
export const TEAM_ZOMBIE = 1;

export const ZOMBIE_CRATES: ReadonlyArray<{ x: number; z: number; w: number; d: number; top: number }> = [
  { x: -9, z: -9, w: 3, d: 3, top: 1.6 }, { x: 9, z: 9, w: 3, d: 3, top: 1.6 }, { x: 9, z: -9, w: 2, d: 6, top: 2.4 },
  { x: -9, z: 9, w: 6, d: 2, top: 2.4 }, { x: 0, z: 0, w: 4, d: 4, top: 0.9 }, { x: 0, z: -12, w: 6, d: 1.2, top: 1.4 },
  { x: 0, z: 12, w: 6, d: 1.2, top: 1.4 }, { x: -13, z: 0, w: 1.2, d: 5, top: 1.4 }, { x: 13, z: 0, w: 1.2, d: 5, top: 1.4 },
];

export function createZombieWorld(): SimWorld {
  const boxes: Box[] = ZOMBIE_CRATES.map((c) => ({ minX: c.x - c.w / 2, maxX: c.x + c.w / 2, minZ: c.z - c.d / 2, maxZ: c.z + c.d / 2, top: c.top }));
  const h = ZOMBIE.half;
  return { bounds: { minX: -h, maxX: h, minZ: -h, maxZ: h }, boxes, killY: -10 };
}

export function zombieStep(world: SimWorld): StepFn {
  return staticWorldStep(world);
}

/** Spread around the arena. */
export function zombieSpawn(slot: number): { x: number; z: number; yaw: number } {
  const a = (slot / 4) * Math.PI * 2 + Math.PI / 4;
  return { x: Math.cos(a) * 11, z: Math.sin(a) * 11, yaw: a + Math.PI };
}
