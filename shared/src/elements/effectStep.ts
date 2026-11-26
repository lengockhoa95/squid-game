import { MOVEMENT } from '../config/movement.ts';
import type { CharacterState, MoveIntent } from '../sim/kinematics.ts';
import type { StepFn } from '../sim/step.ts';
import { ELEMENT_FX } from './elements.ts';

/** Area effects that change movement. Server owns the real list; clients mirror it from the synced state. */
export interface ElementField {
  pillars: Array<{ x: number; z: number; until: number }>;
  puddles: Array<{ x: number; z: number; until: number; owner: string }>;
}

/** Timed statuses on one character (game-time seconds). PlayerState satisfies this. */
export interface ElementStatus {
  stunUntil: number;
  hasteUntil: number;
}

export function createElementField(): ElementField {
  return { pillars: [], puddles: [] };
}

/**
 * Wrap a minigame step with element effects. Pure and allocation-free per call, so the server
 * simulation and the client prediction produce the same result for the same field/status.
 */
export function effectStep(base: StepFn, field: ElementField, status: ElementStatus, selfId: string): StepFn {
  const tmp: MoveIntent = { dirX: 0, dirZ: 0, jump: false };
  return (s, intent, dt, t) => {
    let mul = 1;
    let jump = intent.jump;
    if (t < status.stunUntil) {
      mul = 0;
      jump = false;
    } else if (inPuddle(s, field, selfId, t)) {
      mul = ELEMENT_FX.puddleSlow;
    }
    tmp.dirX = intent.dirX * mul;
    tmp.dirZ = intent.dirZ * mul;
    tmp.jump = jump;
    const steps = t < status.hasteUntil && mul > 0 ? 2 : 1;
    for (let k = 0; k < steps; k++) {
      base(s, tmp, dt, t);
      resolvePillars(s, field, t);
      tmp.jump = false;
    }
  };
}

function inPuddle(s: CharacterState, field: ElementField, selfId: string, t: number): boolean {
  if (s.y > 0.5) return false;
  const r2 = ELEMENT_FX.puddleRadius * ELEMENT_FX.puddleRadius;
  for (const p of field.puddles) {
    if (t >= p.until || p.owner === selfId) continue;
    const dx = s.x - p.x;
    const dz = s.z - p.z;
    if (dx * dx + dz * dz < r2) return true;
  }
  return false;
}

/** Push the character out of every active pillar (vertical cylinders standing on y=0). */
export function resolvePillars(s: CharacterState, field: ElementField, t: number): void {
  const minD = ELEMENT_FX.pillarRadius + MOVEMENT.radius;
  for (const p of field.pillars) {
    if (t >= p.until || s.y >= ELEMENT_FX.pillarHeight) continue;
    let dx = s.x - p.x;
    let dz = s.z - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= minD * minD) continue;
    const d = Math.sqrt(d2);
    if (d < 1e-6) {
      dx = 0;
      dz = 1;
    } else {
      dx /= d;
      dz /= d;
    }
    const push = minD - d;
    s.x += dx * push;
    s.z += dz * push;
    const vn = s.vx * dx + s.vz * dz;
    if (vn < 0) {
      s.vx -= vn * dx;
      s.vz -= vn * dz;
    }
  }
}
