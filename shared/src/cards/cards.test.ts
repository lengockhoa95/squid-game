import { describe, expect, it } from 'vitest';
import { createRng } from '../sim/rng.ts';
import { createCharacterState, type SimWorld } from '../sim/kinematics.ts';
import { staticWorldStep } from '../sim/step.ts';
import { collideBodies, BODY } from '../sim/bodies.ts';
import { createElementField, effectStep } from '../elements/effectStep.ts';
import { MOVEMENT } from '../config/movement.ts';
import { CARD_IDS, cardMods, drawOffer, formatCards, parseCards, parsePickCard } from './cards.ts';

describe('cards', () => {
  it('round-trips levels and clamps to 3', () => {
    expect(parseCards('BUNNY:2,LIFE:1,NOPE:3,EYE:9')).toEqual({ BUNNY: 2, LIFE: 1, EYE: 3 });
    expect(formatCards({ LIFE: 1, BUNNY: 2 })).toBe('BUNNY:2,LIFE:1');
    expect(parseCards('')).toEqual({});
    expect(parsePickCard({ card: 'TANK' })).toEqual({ card: 'TANK' });
    expect(parsePickCard({ card: 'x' })).toBeNull();
  });

  it('draws distinct cards, never maxed ones, favouring owned cards', () => {
    const rng = createRng(5);
    for (let i = 0; i < 200; i++) {
      const offer = drawOffer({ BUNNY: 3, LIFE: 1 }, 3, rng);
      expect(new Set(offer).size).toBe(3);
      expect(offer).not.toContain('BUNNY');
    }
    let lifeSeen = 0;
    for (let i = 0; i < 2000; i++) if (drawOffer({ LIFE: 1 }, 1, rng)[0] === 'LIFE') lifeSeen++;
    expect(lifeSeen / 2000).toBeGreaterThan(1.5 / CARD_IDS.length); // ~2/9 vs 1/8 neutral
    const allMaxed = Object.fromEntries(CARD_IDS.map((id) => [id, 3]));
    expect(drawOffer(allMaxed, 3, rng)).toEqual([]);
  });

  it('resolves modifiers per level', () => {
    expect(cardMods({}).lives).toBe(0);
    expect(cardMods({ LIFE: 2 }).lives).toBe(2);
    expect(cardMods({ BUNNY: 3 }).doubleJump).toBe(true);
    expect(cardMods({ EYE: 3 }).eyeRows).toBe(Number.POSITIVE_INFINITY);
    expect(cardMods({ TANK: 1 }).mass).toBeGreaterThan(1);
  });
});

const WORLD: SimWorld = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, boxes: [], killY: -10 };
const base = staticWorldStep(WORLD);
const DT = 1 / 60;

function maxHeight(cards: string, jumpAgainAt = -1) {
  const s = createCharacterState(0, 0);
  const step = effectStep(base, createElementField(), { stunUntil: 0, hasteUntil: 0, cards }, 'me');
  let top = 0;
  for (let i = 0; i < 120; i++) {
    step(s, { dirX: 0, dirZ: 0, jump: i === 0 || i === jumpAgainAt }, DT, i * DT);
    top = Math.max(top, s.y);
  }
  return top;
}

describe('movement cards in the shared step', () => {
  it('Chân Thỏ jumps higher, and level 3 double-jumps (once per air time)', () => {
    const normal = maxHeight('');
    expect(maxHeight('BUNNY:2')).toBeGreaterThan(normal * 1.5);
    expect(maxHeight('BUNNY:2', 20)).toBeCloseTo(maxHeight('BUNNY:2'), 5); // no double jump below level 3
    expect(maxHeight('BUNNY:3', 20)).toBeGreaterThan(maxHeight('BUNNY:3') * 1.4);
  });

  it('Giày Gió runs faster', () => {
    const run = (cards: string) => {
      const s = createCharacterState(0, 0);
      const step = effectStep(base, createElementField(), { stunUntil: 0, hasteUntil: 0, cards }, 'me');
      for (let i = 0; i < 60; i++) step(s, { dirX: 0, dirZ: -1, jump: false }, DT, i * DT);
      return -s.z;
    };
    expect(run('SPEED:3')).toBeGreaterThan(run('') * 1.2);
  });

  it('client prediction treats other bodies as obstacles', () => {
    const field = createElementField();
    field.bodies.push({ x: 0, y: 0, z: -2 });
    const s = createCharacterState(0, 0);
    const step = effectStep(base, field, { stunUntil: 0, hasteUntil: 0, cards: '' }, 'me');
    for (let i = 0; i < 120; i++) step(s, { dirX: 0, dirZ: -1, jump: false }, DT, i * DT);
    expect(s.z).toBeGreaterThan(-2 + BODY.contact - 0.01);
  });
});

describe('collideBodies', () => {
  it('separates overlapping players and pushes the one being run into', () => {
    const a = createCharacterState(0, 0);
    const b = createCharacterState(0, -0.3);
    a.vz = -MOVEMENT.walkSpeed;
    const closing = collideBodies(a, b);
    expect(closing).toBeGreaterThan(0);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(BODY.contact, 5);
    expect(b.vz).toBeLessThan(-1);
  });

  it('heavier bodies barely move; jumping over a head does not collide', () => {
    const a = createCharacterState(0, 0);
    const b = createCharacterState(0, -0.3);
    collideBodies(a, b, { mass: 1, push: 1 }, { mass: 6, push: 1 });
    expect(Math.abs(b.z + 0.3)).toBeLessThan(0.06);
    const c = createCharacterState(0, 0);
    const d = createCharacterState(0, -0.3);
    d.y = 1.5;
    expect(collideBodies(c, d)).toBe(0);
    expect(c.z).toBe(0);
  });
});
