import { MOVEMENT, type MovementParams } from '../config/movement.ts';
import { stepCharacter, type Box, type SimWorld } from '../sim/kinematics.ts';
import type { StepFn } from '../sim/step.ts';

/** Vượt Biển Cá Mập: swim from the beach to the island; sharks patrol lanes and lunge at swimmers. */
export const SEA = {
  halfWidth: 14,
  beachZ: 6,
  islandZ: -66,
  /** Swimmers float at this height (the seabed collider). */
  swimY: -0.9,
  sharks: 6,
  biteRadius: 1.15,
  patrolSpeed: 2.6,
  lungeSpeed: 5.6,
  lungeSeconds: 1.3,
  lungeRestSeconds: 2.6,
  /** Lunge when a swimmer is within this distance in front of the shark. */
  senseRadius: 6.5,
} as const;

/** Slower, floatier movement in the water (jump = a weaker hop out of the water). */
export const SWIM_MOVEMENT: Readonly<MovementParams> = { ...MOVEMENT, walkSpeed: 4.4, accel: 22, decel: 16, jumpVelocity: 7.5, airControl: 0.6 };

/** Shark lanes (z) from the beach to the island. */
export const SHARK_LANES: readonly number[] = Array.from({ length: SEA.sharks }, (_, i) => -8 - i * ((SEA.beachZ - SEA.islandZ - 24) / (SEA.sharks - 1)));

export function inWater(y: number): boolean {
  return y < -0.45;
}

export function createSeaWorld(): SimWorld {
  const hw = SEA.halfWidth;
  const boxes: Box[] = [
    { minX: -hw, maxX: hw, minZ: SEA.beachZ, maxZ: SEA.beachZ + 8, top: 0, bottom: -3 }, // beach
    { minX: -hw, maxX: hw, minZ: SEA.islandZ - 12, maxZ: SEA.islandZ, top: 0, bottom: -3 }, // island
    // Shallow steps out of the water onto the island (climbable without jumping).
    { minX: -hw, maxX: hw, minZ: SEA.islandZ, maxZ: SEA.islandZ + 1.2, top: -0.3, bottom: -3 },
    { minX: -hw, maxX: hw, minZ: SEA.islandZ + 1.2, maxZ: SEA.islandZ + 2.4, top: -0.6, bottom: -3 },
    // Seabed: swimmers rest on it at swimY.
    { minX: -hw, maxX: hw, minZ: SEA.islandZ, maxZ: SEA.beachZ, top: SEA.swimY, bottom: -3 },
  ];
  return { bounds: { minX: -hw, maxX: hw, minZ: SEA.islandZ - 12, maxZ: SEA.beachZ + 8 }, boxes, killY: -20, noFloor: true };
}

/** Walking on land, swimming (slower) in the water. */
export function seaStep(world: SimWorld): StepFn {
  return (s, intent, dt) => stepCharacter(s, intent, dt, world, inWater(s.y) && s.grounded ? SWIM_MOVEMENT : MOVEMENT);
}

export function seaSpawn(slot: number): { x: number; z: number; yaw: number } {
  return { x: -4.5 + slot * 3, z: SEA.beachZ + 3, yaw: Math.PI };
}

/** Reached the island (standing on it). */
export function onIsland(z: number, y: number): boolean {
  return z <= SEA.islandZ - 0.5 && y > -0.1;
}
