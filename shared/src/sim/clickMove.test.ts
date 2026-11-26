import { describe, expect, it } from 'vitest';
import { createCharacterState, type MoveIntent } from './kinematics.ts';
import { intentTowardTarget } from './clickMove.ts';

describe('intentTowardTarget', () => {
  it('produces a normalized direction toward the target', () => {
    const s = createCharacterState(0, 0);
    const out: MoveIntent = { dirX: 0, dirZ: 0, jump: false };
    const arrived = intentTowardTarget(s, 3, 4, out);
    expect(arrived).toBe(false);
    expect(out.dirX).toBeCloseTo(0.6);
    expect(out.dirZ).toBeCloseTo(0.8);
  });

  it('reports arrival inside the arrive radius and zeroes direction', () => {
    const s = createCharacterState(1, 1);
    const out: MoveIntent = { dirX: 1, dirZ: 1, jump: false };
    expect(intentTowardTarget(s, 1.1, 1, out)).toBe(true);
    expect(out.dirX).toBe(0);
    expect(out.dirZ).toBe(0);
  });
});
