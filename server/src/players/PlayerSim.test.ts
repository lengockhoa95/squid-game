import { describe, expect, it } from 'vitest';
import { createCharacterState, createPlaygroundWorld, staticWorldStep, stepCharacter, MOVEMENT, SIM_DT } from '@sp/shared';
import { PlayerSim } from './PlayerSim.ts';

const world = createPlaygroundWorld();
const step = staticWorldStep(world);
const forward = (n: number) => Array.from({ length: n }, () => [0, -1, 0]).flat();

describe('PlayerSim', () => {
  it('simulates exactly like the shared stepper (client prediction parity)', () => {
    const sim = new PlayerSim(0, 0, 0);
    sim.enqueue({ s: 1, i: forward(3) });
    sim.enqueue({ s: 4, i: [1, 0, 1, 1, 0, 0, 1, 0, 0] });
    for (let t = 0; t < 6; t++) sim.tick(step);

    const ref = createCharacterState(0, 0);
    const inputs = [...forward(3), 1, 0, 1, 1, 0, 0, 1, 0, 0];
    for (let k = 0; k < inputs.length; k += 3) {
      stepCharacter(ref, { dirX: inputs[k]!, dirZ: inputs[k + 1]!, jump: inputs[k + 2] === 1 }, SIM_DT, world);
    }
    expect(sim.state.x).toBeCloseTo(ref.x, 10);
    expect(sim.state.y).toBeCloseTo(ref.y, 10);
    expect(sim.state.z).toBeCloseTo(ref.z, 10);
    expect(sim.lastProcessedSeq).toBe(6);
  });

  it('ignores stale or duplicate sequence numbers', () => {
    const sim = new PlayerSim(0, 0, 0);
    expect(sim.enqueue({ s: 1, i: forward(3) })).toBe(3);
    expect(sim.enqueue({ s: 2, i: forward(3) })).toBe(1); // only seq 4 is new
    expect(sim.enqueue({ s: 1, i: forward(1) })).toBe(0);
  });

  it('cannot be sped up by flooding inputs (anti speed-hack)', () => {
    const sim = new PlayerSim(0, 0, 0);
    for (let s = 1; s < 600; s += 6) sim.enqueue({ s, i: forward(6) });
    for (let t = 0; t < 60; t++) sim.tick(step); // one second of server time
    const traveled = Math.abs(sim.state.z);
    // Budget: at most 60 steps + small burst credit per second.
    expect(traveled).toBeLessThanOrEqual(MOVEMENT.walkSpeed * (64 / 60) + 1e-6);
  });

  it('keeps simulating (gravity) when a client stops sending inputs', () => {
    const sim = new PlayerSim(0, 0, 0);
    sim.state.y = 3;
    sim.state.grounded = false;
    for (let t = 0; t < 120; t++) sim.tick(step);
    expect(sim.state.y).toBe(0);
    expect(sim.state.grounded).toBe(true);
  });

  it('resets to a spawn point and clears pending inputs', () => {
    const sim = new PlayerSim(0, 0, 0);
    sim.enqueue({ s: 1, i: forward(3) });
    sim.reset(5, 6, Math.PI);
    sim.tick(step);
    expect(sim.state.x).toBe(5);
    expect(sim.state.z).toBe(6);
    expect(sim.state.yaw).toBe(Math.PI);
  });
});
