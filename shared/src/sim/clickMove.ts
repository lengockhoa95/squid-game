import { MOVEMENT, type MovementParams } from '../config/movement.ts';
import type { CharacterState, MoveIntent } from './kinematics.ts';

/**
 * Fill `out` with the direction needed to walk toward a clicked target.
 * Slows down inside the braking distance so the character does not overshoot.
 * Returns true once the target is reached (direction is zeroed).
 */
export function intentTowardTarget(
  s: CharacterState,
  targetX: number,
  targetZ: number,
  out: MoveIntent,
  p: MovementParams = MOVEMENT,
): boolean {
  const dx = targetX - s.x;
  const dz = targetZ - s.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= p.arriveRadius) {
    out.dirX = 0;
    out.dirZ = 0;
    return true;
  }
  const brakeDist = (p.walkSpeed * p.walkSpeed) / (2 * p.decel);
  const scale = Math.min(1, dist / brakeDist) / dist;
  out.dirX = dx * scale;
  out.dirZ = dz * scale;
  return false;
}
