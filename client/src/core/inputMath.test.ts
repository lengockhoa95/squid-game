import { describe, expect, it } from 'vitest';
import { classifyRightGesture, keyboardToWorldDir } from './inputMath.ts';

describe('classifyRightGesture', () => {
  it('is a tap when the pointer barely moved', () => {
    expect(classifyRightGesture(2, 3)).toBe('tap');
  });
  it('is a drag past 5px', () => {
    expect(classifyRightGesture(6, 0)).toBe('drag');
  });
});

describe('keyboardToWorldDir', () => {
  const out = { x: 0, z: 0 };
  it('W at camYaw 0 walks toward -Z', () => {
    keyboardToWorldDir(1, 0, 0, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(-1);
  });
  it('D at camYaw 0 walks toward +X', () => {
    keyboardToWorldDir(0, 1, 0, out);
    expect(out.x).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(0);
  });
  it('normalizes diagonals', () => {
    keyboardToWorldDir(1, 1, 0, out);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(1);
  });
  it('rotates with the camera (yaw 90° → W walks toward -X)', () => {
    keyboardToWorldDir(1, 0, Math.PI / 2, out);
    expect(out.x).toBeCloseTo(-1);
    expect(out.z).toBeCloseTo(0);
  });
  it('returns zero for no input', () => {
    keyboardToWorldDir(0, 0, 1.2, out);
    expect(out.x).toBe(0);
    expect(out.z).toBe(0);
  });
});
