import { describe, expect, it } from 'vitest';
import { RACE, SWEEPERS, PUSHERS, createRaceWorld, raceCheckpoint, raceSpawn, raceStep, applySweepers } from './race.ts';
import { createCharacterState } from '../sim/kinematics.ts';
import { MOVEMENT } from '../config/movement.ts';
import { SIM_DT } from '../protocol/constants.ts';

const onFloor = (z: number) => {
  const rw = createRaceWorld();
  const s = createCharacterState(-5.5, z); // far edge, away from pushers/sweepers
  const step = raceStep(rw, MOVEMENT.radius);
  for (let i = 0; i < 30; i++) step(s, { dirX: 0, dirZ: 0, jump: false }, SIM_DT, 0);
  return s.y > -0.01;
};

describe('obstacle race layout', () => {
  it('every checkpoint and spawn stands on solid floor', () => {
    for (const cp of RACE.checkpoints) expect(onFloor(cp), `checkpoint ${cp}`).toBe(true);
    for (let slot = 0; slot < 4; slot++) expect(onFloor(raceSpawn(slot).z)).toBe(true);
  });

  it('checkpoints are clear of sweepers and pushers', () => {
    for (const cp of RACE.checkpoints) {
      for (const sw of SWEEPERS) expect(Math.abs(cp - sw.z)).toBeGreaterThan(sw.length + 1);
      for (const p of PUSHERS) expect(Math.abs(cp - p.z)).toBeGreaterThan(p.depth / 2 + 1);
    }
  });

  it('falling into a gap drops below killY', () => {
    const rw = createRaceWorld();
    const s = createCharacterState(-5.5, 12.6); // inside the first gap
    const step = raceStep(rw, MOVEMENT.radius);
    for (let i = 0; i < 120; i++) step(s, { dirX: 0, dirZ: 0, jump: false }, SIM_DT, 0);
    expect(s.y).toBeLessThan(RACE.killY);
  });

  it('a low wall blocks walking but can be jumped', () => {
    const rw = createRaceWorld();
    const step = raceStep(rw, MOVEMENT.radius);
    const walker = createCharacterState(-5.5, 23);
    for (let i = 0; i < 120; i++) step(walker, { dirX: 0, dirZ: -1, jump: false }, SIM_DT, 0);
    expect(walker.z).toBeGreaterThan(20);
    const jumper = createCharacterState(-5.5, 23);
    for (let i = 0; i < 120; i++) step(jumper, { dirX: 0, dirZ: -1, jump: jumper.z < 21.6 }, SIM_DT, 0);
    expect(jumper.z).toBeLessThan(19);
  });

  it('sweepers knock grounded characters back but not jumping ones', () => {
    const sw = SWEEPERS[0]!;
    const grounded = createCharacterState(sw.x + 2, sw.z); // on the bar at t=0 (bar along x)
    expect(applySweepers(grounded, 0, MOVEMENT.radius)).toBe(true);
    expect(Math.hypot(grounded.vx, grounded.vz)).toBeGreaterThan(5);
    const airborne = createCharacterState(sw.x + 2, sw.z);
    airborne.y = 1.2;
    expect(applySweepers(airborne, 0, MOVEMENT.radius)).toBe(false);
  });

  it('respawn checkpoint is the last one passed', () => {
    expect(raceCheckpoint(29)).toBe(30);
    expect(raceCheckpoint(0)).toBe(11);
    expect(raceCheckpoint(-30)).toBe(-23);
  });
});
