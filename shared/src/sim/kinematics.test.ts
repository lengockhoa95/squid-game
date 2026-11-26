import { describe, expect, it } from 'vitest';
import { createCharacterState, stepCharacter, type MoveIntent, type SimWorld } from './kinematics.ts';
import { MOVEMENT } from '../config/movement.ts';

const DT = 1 / 60;
const openWorld: SimWorld = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, boxes: [], killY: -20 };

function run(state = createCharacterState(0, 0), intent: MoveIntent, seconds: number, world = openWorld) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) stepCharacter(state, intent, DT, world);
  return state;
}

const speed = (s: { vx: number; vz: number }) => Math.hypot(s.vx, s.vz);

describe('stepCharacter', () => {
  it('accelerates to walkSpeed and never exceeds it', () => {
    const s = run(undefined, { dirX: 1, dirZ: 0, jump: false }, 2);
    expect(speed(s)).toBeCloseTo(MOVEMENT.walkSpeed, 5);
    expect(s.x).toBeGreaterThan(5);
  });

  it('clamps oversized direction vectors (anti speed hack)', () => {
    const normal = run(undefined, { dirX: 1, dirZ: 0, jump: false }, 1);
    const hacked = run(undefined, { dirX: 50, dirZ: 0, jump: false }, 1);
    expect(hacked.x).toBeCloseTo(normal.x, 6);
  });

  it('treats NaN direction as no input', () => {
    const s = run(undefined, { dirX: Number.NaN, dirZ: 0, jump: false }, 0.5);
    expect(s.x).toBe(0);
    expect(Number.isFinite(s.vx)).toBe(true);
  });

  it('decelerates to a stop when input is released', () => {
    const s = run(undefined, { dirX: 0, dirZ: 1, jump: false }, 1);
    run(s, { dirX: 0, dirZ: 0, jump: false }, 0.5);
    expect(speed(s)).toBe(0);
  });

  it('jumps only when grounded and lands back on the ground', () => {
    const s = createCharacterState(0, 0);
    stepCharacter(s, { dirX: 0, dirZ: 0, jump: true }, DT, openWorld);
    expect(s.vy).toBeGreaterThan(0);
    expect(s.grounded).toBe(false);
    const vyAfterFirst = s.vy;
    stepCharacter(s, { dirX: 0, dirZ: 0, jump: true }, DT, openWorld);
    expect(s.vy).toBeLessThan(vyAfterFirst); // no double jump
    run(s, { dirX: 0, dirZ: 0, jump: false }, 2);
    expect(s.y).toBe(0);
    expect(s.grounded).toBe(true);
  });

  it('does not pass through a tall box', () => {
    const world: SimWorld = { ...openWorld, boxes: [{ minX: 2, maxX: 4, minZ: -2, maxZ: 2, top: 2 }] };
    const s = run(undefined, { dirX: 1, dirZ: 0, jump: false }, 3, world);
    expect(s.x).toBeLessThanOrEqual(2 - MOVEMENT.radius + 1e-6);
  });

  it('steps up onto a low box', () => {
    const world: SimWorld = { ...openWorld, boxes: [{ minX: 2, maxX: 6, minZ: -2, maxZ: 2, top: 0.3 }] };
    const s = run(undefined, { dirX: 1, dirZ: 0, jump: false }, 0.9, world);
    expect(s.x).toBeGreaterThan(2);
    expect(s.y).toBeCloseTo(0.3, 5);
  });

  it('can jump onto a medium box', () => {
    const world: SimWorld = { ...openWorld, boxes: [{ minX: 2, maxX: 8, minZ: -2, maxZ: 2, top: 1 }] };
    const s = createCharacterState(0, 0);
    run(s, { dirX: 1, dirZ: 0, jump: false }, 0.15, world);
    run(s, { dirX: 1, dirZ: 0, jump: true }, 0.05, world);
    run(s, { dirX: 1, dirZ: 0, jump: false }, 0.8, world);
    expect(s.x).toBeGreaterThan(2);
    expect(s.y).toBeCloseTo(1, 5);
  });

  it('stays within world bounds', () => {
    const s = run(undefined, { dirX: -1, dirZ: 0, jump: false }, 20);
    expect(s.x).toBeCloseTo(-50 + MOVEMENT.radius, 6);
  });

  it('faces the direction of travel', () => {
    const s = run(undefined, { dirX: 1, dirZ: 0, jump: false }, 0.5);
    expect(s.yaw).toBeCloseTo(Math.PI / 2, 3);
  });
});
