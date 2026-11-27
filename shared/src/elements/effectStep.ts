import { MOVEMENT } from '../config/movement.ts';
import { cardMods, parseCards, type CardMods } from '../cards/cards.ts';
import { pushOutOfBodies } from '../sim/bodies.ts';
import type { CharacterState, MoveIntent } from '../sim/kinematics.ts';
import type { StepFn } from '../sim/step.ts';
import { ELEMENT_FX } from './elements.ts';

/** Area effects that change movement. Server owns the real list; clients mirror it from the synced state. */
export interface ElementField {
  /** `y` = height of the floor the effect was placed on (multi-level maps). */
  pillars: Array<{ x: number; y: number; z: number; until: number }>;
  puddles: Array<{ x: number; y: number; z: number; until: number; owner: string }>;
  /** Client prediction only: other characters as static obstacles (the server collides pairs itself). */
  bodies: Array<{ x: number; y: number; z: number }>;
}

/** Timed statuses on one character (game-time seconds). PlayerState satisfies this. */
export interface ElementStatus {
  stunUntil: number;
  hasteUntil: number;
  /** Card levels, synced as "BUNNY:2,SPEED:1" (movement cards apply in the step). */
  cards: string;
}

export function createElementField(): ElementField {
  return { pillars: [], puddles: [], bodies: [] };
}

/**
 * Wrap a minigame step with element effects. Pure and allocation-free per call, so the server
 * simulation and the client prediction produce the same result for the same field/status.
 */
export function effectStep(base: StepFn, field: ElementField, status: ElementStatus, selfId: string): StepFn {
  const tmp: MoveIntent = { dirX: 0, dirZ: 0, jump: false };
  let cardsKey = '';
  let mods: CardMods = cardMods({});
  return (s, intent, dt, t) => {
    if (status.cards !== cardsKey) {
      cardsKey = status.cards;
      mods = cardMods(parseCards(cardsKey));
    }
    let mul = 1;
    let jump = intent.jump;
    if (t < status.stunUntil) {
      mul = 0;
      jump = false;
    } else if (!mods.slowImmune && inPuddle(s, field, selfId, t)) {
      mul = ELEMENT_FX.puddleSlow;
    }
    tmp.dirX = intent.dirX * mul;
    tmp.dirZ = intent.dirZ * mul;
    tmp.jump = jump;
    const steps = t < status.hasteUntil && mul > 0 ? 2 : 1;
    for (let k = 0; k < steps; k++) {
      const wasGrounded = s.grounded;
      base(s, tmp, dt, t);
      if (tmp.jump) {
        if (wasGrounded && !s.grounded && s.vy > 0) {
          s.vy *= mods.jumpMul; // higher normal jump
        } else if (!wasGrounded && mods.doubleJump && !s.airJumped) {
          s.vy = MOVEMENT.jumpVelocity * mods.jumpMul; // double jump
          s.airJumped = true;
        }
      }
      if (mods.speedMul !== 1 && mul > 0) {
        s.x += s.vx * dt * (mods.speedMul - 1);
        s.z += s.vz * dt * (mods.speedMul - 1);
      }
      resolvePillars(s, field, t);
      if (field.bodies.length > 0) pushOutOfBodies(s, field.bodies);
      if (s.grounded) s.airJumped = false;
      tmp.jump = false;
    }
  };
}

function inPuddle(s: CharacterState, field: ElementField, selfId: string, t: number): boolean {
  const r2 = ELEMENT_FX.puddleRadius * ELEMENT_FX.puddleRadius;
  for (const p of field.puddles) {
    if (t >= p.until || p.owner === selfId || Math.abs(s.y - p.y) > 0.5) continue;
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
    if (t >= p.until || s.y >= p.y + ELEMENT_FX.pillarHeight || s.y < p.y - 1) continue;
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
