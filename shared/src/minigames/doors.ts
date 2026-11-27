import { stepCharacter, type Box, type SimWorld } from '../sim/kinematics.ts';
import type { StepFn } from '../sim/step.ts';

/**
 * Cửa Thần May Mắn: rows of identical-looking doors. In each row some doors are real (open),
 * the others are fake walls you bounce off. Which is which exists only on the server until revealed.
 */
export const DOORS = {
  rows: 8,
  perRow: 4,
  realPerRow: 2,
  halfWidth: 6,
  doorWidth: 2.4,
  wallHeight: 3.5,
  wallDepth: 0.5,
  firstRowZ: -6,
  rowSpacing: 9,
  startZ: 8,
  bounceSpeed: 9,
  stunSeconds: 0.6,
} as const;

export const DOOR_UNKNOWN = 0;
export const DOOR_FAKE = 1;
export const DOOR_REAL = 2;

export const DOORS_FINISH_Z = DOORS.firstRowZ - DOORS.rows * DOORS.rowSpacing + 2;

export function doorRowZ(row: number): number {
  return DOORS.firstRowZ - row * DOORS.rowSpacing;
}

/** Centre x of door `k` in a row. */
export function doorX(k: number): number {
  const pitch = (DOORS.halfWidth * 2) / DOORS.perRow;
  return -DOORS.halfWidth + pitch * (k + 0.5);
}

export function doorIndex(row: number, k: number): number {
  return row * DOORS.perRow + k;
}

/** The solid box a fake door becomes. */
export function doorBox(row: number, k: number): Box {
  const z = doorRowZ(row);
  const hw = DOORS.doorWidth / 2;
  const hd = DOORS.wallDepth / 2;
  return { minX: doorX(k) - hw, maxX: doorX(k) + hw, minZ: z - hd, maxZ: z + hd, top: DOORS.wallHeight };
}

/** Floor + the wall posts between doors (always solid). Fake doors are added separately. */
export function createDoorsWorld(): SimWorld {
  const boxes: Box[] = [];
  const hw = DOORS.halfWidth;
  boxes.push({ minX: -hw, maxX: hw, minZ: DOORS_FINISH_Z - 8, maxZ: DOORS.startZ + 4, top: 0, bottom: -1 });
  const pitch = (hw * 2) / DOORS.perRow;
  const post = (pitch - DOORS.doorWidth) / 2;
  for (let row = 0; row < DOORS.rows; row++) {
    const z = doorRowZ(row);
    const hd = DOORS.wallDepth / 2;
    for (let k = 0; k <= DOORS.perRow; k++) {
      const x = -hw + pitch * k;
      boxes.push({ minX: x - post, maxX: x + post, minZ: z - hd, maxZ: z + hd, top: DOORS.wallHeight });
    }
  }
  return { bounds: { minX: -hw, maxX: hw, minZ: DOORS_FINISH_Z - 8, maxZ: DOORS.startZ + 4 }, boxes, killY: -10 };
}

/** Add a (now known) fake door to a world's collision. */
export function addFakeDoor(world: SimWorld, row: number, k: number): void {
  (world.boxes as Box[]).push(doorBox(row, k));
}

export function doorsStep(world: SimWorld): StepFn {
  return (s, intent, dt) => stepCharacter(s, intent, dt, world);
}

export function doorsSpawn(slot: number): { x: number; z: number; yaw: number } {
  return { x: -3 + slot * 2, z: DOORS.startZ, yaw: Math.PI };
}
