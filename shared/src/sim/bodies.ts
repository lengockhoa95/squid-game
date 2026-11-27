import type { CharacterState } from './kinematics.ts';

/** Player-vs-player contact. */
export const BODY = {
  /** Centre distance at which two characters touch (≈ 2 × radius + a little). */
  contact: 0.7,
  /** Characters further apart vertically than this pass over each other (jumping over heads). */
  height: 1,
  /** Share of the closing speed handed to the character being bumped. */
  impulse: 0.6,
} as const;

export interface BodyProps {
  /** Higher = harder to move. */
  mass: number;
  /** Multiplier for the speed this body hands to others when bumping them. */
  push: number;
}

const NEUTRAL: BodyProps = { mass: 1, push: 1 };

/**
 * Separate two overlapping characters (server: both move, weighted by mass) and transfer part of
 * the closing speed to whoever got bumped. Returns the closing speed (0 when not touching).
 */
export function collideBodies(a: CharacterState, b: CharacterState, pa: BodyProps = NEUTRAL, pb: BodyProps = NEUTRAL): number {
  if (Math.abs(a.y - b.y) >= BODY.height) return 0;
  let nx = b.x - a.x;
  let nz = b.z - a.z;
  const d2 = nx * nx + nz * nz;
  if (d2 >= BODY.contact * BODY.contact) return 0;
  const d = Math.sqrt(d2);
  if (d < 1e-6) {
    nx = 1;
    nz = 0;
  } else {
    nx /= d;
    nz /= d;
  }
  const overlap = BODY.contact - d;
  const total = pa.mass + pb.mass;
  const shareA = pb.mass / total; // the lighter one moves more
  const shareB = pa.mass / total;
  a.x -= nx * overlap * shareA;
  a.z -= nz * overlap * shareA;
  b.x += nx * overlap * shareB;
  b.z += nz * overlap * shareB;

  // Closing speed along the normal (positive = moving into each other).
  const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (closing <= 0) return 0;
  const toB = closing * BODY.impulse * pa.push * (2 * pa.mass) / total;
  const toA = closing * BODY.impulse * pb.push * (2 * pb.mass) / total;
  b.vx += nx * toB;
  b.vz += nz * toB;
  a.vx -= nx * toA;
  a.vz -= nz * toA;
  return closing;
}

/** Client prediction: push only `s` out of other characters (treated as static obstacles). */
export function pushOutOfBodies(s: CharacterState, bodies: ReadonlyArray<{ x: number; y: number; z: number }>): void {
  for (const o of bodies) {
    if (Math.abs(s.y - o.y) >= BODY.height) continue;
    const dx = s.x - o.x;
    const dz = s.z - o.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= BODY.contact * BODY.contact || d2 < 1e-12) continue;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const nz = dz / d;
    const push = BODY.contact - d;
    s.x += nx * push;
    s.z += nz * push;
    const vn = s.vx * nx + s.vz * nz;
    if (vn < 0) {
      s.vx -= vn * nx;
      s.vz -= vn * nz;
    }
  }
}
