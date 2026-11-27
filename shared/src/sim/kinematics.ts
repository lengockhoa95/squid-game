import { MOVEMENT, type MovementParams } from '../config/movement.ts';

export interface CharacterState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Facing angle in radians; 0 = +Z, PI/2 = +X. */
  yaw: number;
  grounded: boolean;
  /** Double-jump already used since leaving the ground (card "Chân Thỏ" level 3). */
  airJumped?: boolean;
}

export interface MoveIntent {
  /** Desired horizontal direction. Magnitude is clamped to 1; non-finite values are ignored. */
  dirX: number;
  dirZ: number;
  jump: boolean;
}

/** Axis-aligned box with its top at `top`. Without `bottom` it stands on the ground (solid all the way down). */
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number;
  /** Underside of a floating box (e.g. an upper floor): characters fully below it pass underneath. */
  bottom?: number;
}

/** Character height used to decide whether a floating box is overhead. */
export const CHARACTER_HEIGHT = 1.2;

export interface SimWorld {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  boxes: readonly Box[];
  /** Characters below this height are considered fallen out of the world. */
  killY: number;
  /** When true there is no ground plane at y = 0 (e.g. bridges over a pit). */
  noFloor?: boolean;
}

export function createCharacterState(x: number, z: number): CharacterState {
  return { x, y: 0, z, vx: 0, vy: 0, vz: 0, yaw: 0, grounded: true, airJumped: false };
}

const EPS = 1e-9;

/**
 * Advance a character by `dt` seconds. Mutates `s` in place and allocates nothing,
 * so it is safe to call every tick on both server and client (prediction).
 */
export function stepCharacter(
  s: CharacterState,
  intent: MoveIntent,
  dt: number,
  world: SimWorld,
  p: MovementParams = MOVEMENT,
): void {
  // 1. Sanitize input direction.
  let dx = Number.isFinite(intent.dirX) ? intent.dirX : 0;
  let dz = Number.isFinite(intent.dirZ) ? intent.dirZ : 0;
  const len = Math.hypot(dx, dz);
  if (len > 1) {
    dx /= len;
    dz /= len;
  }
  const hasInput = len > EPS;

  // 2. Horizontal velocity: move toward desired velocity at accel/decel rate.
  const control = s.grounded ? 1 : p.airControl;
  const targetVx = dx * p.walkSpeed;
  const targetVz = dz * p.walkSpeed;
  const diffX = targetVx - s.vx;
  const diffZ = targetVz - s.vz;
  const diffLen = Math.hypot(diffX, diffZ);
  const maxDelta = (hasInput ? p.accel : p.decel) * control * dt;
  if (diffLen <= maxDelta || diffLen < EPS) {
    s.vx = targetVx;
    s.vz = targetVz;
  } else {
    s.vx += (diffX / diffLen) * maxDelta;
    s.vz += (diffZ / diffLen) * maxDelta;
  }

  // 3. Jump + gravity.
  if (intent.jump && s.grounded) {
    s.vy = p.jumpVelocity;
    s.grounded = false;
  }
  if (!s.grounded) s.vy -= p.gravity * dt;

  // 4. Horizontal move + collision against blocking boxes.
  s.x += s.vx * dt;
  s.z += s.vz * dt;
  resolveBoxes(s, world.boxes, p);

  // 5. World bounds.
  const b = world.bounds;
  const r = p.radius;
  if (s.x < b.minX + r) { s.x = b.minX + r; if (s.vx < 0) s.vx = 0; }
  if (s.x > b.maxX - r) { s.x = b.maxX - r; if (s.vx > 0) s.vx = 0; }
  if (s.z < b.minZ + r) { s.z = b.minZ + r; if (s.vz < 0) s.vz = 0; }
  if (s.z > b.maxZ - r) { s.z = b.maxZ - r; if (s.vz > 0) s.vz = 0; }

  // 6. Vertical move + ground snapping (supports stepping up low boxes).
  const ground = groundHeightAt(s, world, p);
  const nextY = s.y + s.vy * dt;
  if (ground !== null && nextY <= ground && s.vy <= 0) {
    s.y = ground;
    s.vy = 0;
    s.grounded = true;
  } else if (s.grounded && ground !== null && s.y - ground <= p.stepHeight && s.vy <= 0) {
    // Walking off a small ledge: stay glued instead of micro-falling.
    s.y = ground;
    s.vy = 0;
  } else {
    if (s.grounded) s.vy = Math.min(s.vy, 0);
    s.y = nextY;
    s.grounded = false;
  }

  // 7. Face direction of travel.
  if (s.vx * s.vx + s.vz * s.vz > 0.01) s.yaw = Math.atan2(s.vx, s.vz);
}

/** Highest walkable surface under the character, or null if there is none. */
function groundHeightAt(s: CharacterState, world: SimWorld, p: MovementParams): number | null {
  let ground: number | null = world.noFloor ? null : 0;
  for (const box of world.boxes) {
    if (s.x < box.minX || s.x > box.maxX || s.z < box.minZ || s.z > box.maxZ) continue;
    if (box.top > s.y + p.stepHeight) continue;
    if (ground === null || box.top > ground) ground = box.top;
  }
  return ground;
}

function resolveBoxes(s: CharacterState, boxes: readonly Box[], p: MovementParams): void {
  const r = p.radius;
  for (const box of boxes) {
    if (box.top <= s.y + p.stepHeight) continue; // walkable, not blocking
    if (box.bottom !== undefined && s.y + CHARACTER_HEIGHT <= box.bottom) continue; // overhead
    const cx = Math.max(box.minX, Math.min(s.x, box.maxX));
    const cz = Math.max(box.minZ, Math.min(s.z, box.maxZ));
    let nx = s.x - cx;
    let nz = s.z - cz;
    const d2 = nx * nx + nz * nz;
    if (d2 >= r * r) continue;

    let push: number;
    if (d2 > EPS) {
      const d = Math.sqrt(d2);
      nx /= d;
      nz /= d;
      push = r - d;
    } else {
      // Center is inside the box: exit along the axis with the least penetration.
      const left = s.x - box.minX;
      const right = box.maxX - s.x;
      const back = s.z - box.minZ;
      const front = box.maxZ - s.z;
      const m = Math.min(left, right, back, front);
      nx = m === left ? -1 : m === right ? 1 : 0;
      nz = m === back ? -1 : m === front ? 1 : 0;
      if (nx !== 0) nz = 0;
      push = m + r;
    }
    s.x += nx * push;
    s.z += nz * push;
    const vn = s.vx * nx + s.vz * nz;
    if (vn < 0) {
      s.vx -= vn * nx;
      s.vz -= vn * nz;
    }
  }
}
