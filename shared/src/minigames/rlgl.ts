import type { SimWorld } from '../sim/kinematics.ts';

export const RLGL = {
  halfWidth: 13,
  startZ: 56,
  finishZ: -24,
  dollZ: -30,
  greenMinS: 2.2,
  greenMaxS: 5,
  redMinS: 2,
  redMaxS: 3.5,
  /** Time after the light turns red before movement is punished (reaction + braking). */
  graceMs: 450,
  /** Extra grace for high-latency players: half their RTT, capped. */
  maxLatencyCompMs: 100,
  /** Horizontal speed (m/s) above which a player counts as moving. */
  moveThreshold: 0.6,
} as const;

export type LightColor = 'GREEN' | 'RED';

export function createRlglWorld(): SimWorld {
  return {
    bounds: { minX: -RLGL.halfWidth, maxX: RLGL.halfWidth, minZ: RLGL.dollZ + 2, maxZ: RLGL.startZ + 2 },
    boxes: [],
    killY: -10,
  };
}

export function rlglSpawn(slot: number): { x: number; z: number; yaw: number } {
  return { x: -4.5 + slot * 3, z: RLGL.startZ, yaw: Math.PI };
}
