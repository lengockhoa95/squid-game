import { describe, expect, it } from 'vitest';
import { createCharacterState, type SimWorld } from '../sim/kinematics.ts';
import { staticWorldStep } from '../sim/step.ts';
import { ELEMENT_FX } from './elements.ts';
import { createElementField, effectStep } from './effectStep.ts';
import { parseCast, parsePickElement } from './messages.ts';

const WORLD: SimWorld = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, boxes: [], killY: -10 };
const base = staticWorldStep(WORLD);
const DT = 1 / 60;

function run(status: { stunUntil: number; hasteUntil: number }, field = createElementField(), seconds = 1, id = 'me') {
  const s = createCharacterState(0, 0);
  const step = effectStep(base, field, status, id);
  const intent = { dirX: 0, dirZ: -1, jump: false };
  for (let t = 0; t < seconds; t += DT) step(s, intent, DT, t);
  return s;
}

describe('effectStep', () => {
  it('matches the base step with no effects', () => {
    const plain = createCharacterState(0, 0);
    for (let t = 0; t < 1; t += DT) base(plain, { dirX: 0, dirZ: -1, jump: false }, DT, t);
    expect(run({ stunUntil: 0, hasteUntil: 0 }).z).toBeCloseTo(plain.z, 6);
  });

  it('stun freezes input', () => {
    expect(Math.abs(run({ stunUntil: 5, hasteUntil: 0 }).z)).toBeLessThan(1e-9);
  });

  it('haste roughly doubles distance', () => {
    const normal = run({ stunUntil: 0, hasteUntil: 0 });
    const fast = run({ stunUntil: 0, hasteUntil: 5 });
    expect(Math.abs(fast.z)).toBeGreaterThan(Math.abs(normal.z) * 1.8);
  });

  it('puddles slow others but not their owner', () => {
    const field = createElementField();
    field.puddles.push({ x: 0, z: -2, until: 10, owner: 'me' });
    const own = run({ stunUntil: 0, hasteUntil: 0 }, field, 0.5, 'me');
    const other = run({ stunUntil: 0, hasteUntil: 0 }, field, 0.5, 'other');
    expect(Math.abs(other.z)).toBeLessThan(Math.abs(own.z) * 0.6);
  });

  it('pillars block movement until they expire', () => {
    const field = createElementField();
    field.pillars.push({ x: 0, z: -3, until: 10 });
    const blocked = run({ stunUntil: 0, hasteUntil: 0 }, field, 2);
    expect(blocked.z).toBeGreaterThan(-3 + ELEMENT_FX.pillarRadius - 0.01);
    field.pillars[0]!.until = 0;
    const free = run({ stunUntil: 0, hasteUntil: 0 }, field, 2);
    expect(free.z).toBeLessThan(-5);
  });
});

describe('element messages', () => {
  it('validates picks and casts', () => {
    expect(parsePickElement({ element: 'FIRE' })).toEqual({ element: 'FIRE' });
    expect(parsePickElement({ element: 'NUKE' })).toBeNull();
    expect(parseCast({ x: 1, z: 2 })).toEqual({ x: 1, z: 2 });
    expect(parseCast({ x: NaN, z: 0 })).toBeNull();
    expect(parseCast({ x: 1e6, z: 0 })).toBeNull();
    expect(parseCast(null)).toBeNull();
  });
});
