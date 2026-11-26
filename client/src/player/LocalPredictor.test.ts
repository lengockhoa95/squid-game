import { describe, expect, it } from 'vitest';
import { createCharacterState, createPlaygroundWorld, staticWorldStep, stepCharacter, SIM_DT, type MoveIntent } from '@sp/shared';
import { LocalPredictor } from './LocalPredictor.ts';

const world = createPlaygroundWorld();
const step = staticWorldStep(world);

function inputs(n: number): MoveIntent[] {
  return Array.from({ length: n }, (_, k) => ({ dirX: Math.sin(k / 7), dirZ: -1, jump: k === 10 }));
}

describe('LocalPredictor', () => {
  it('assigns increasing sequence numbers starting from setNextSeq', () => {
    const p = new LocalPredictor();
    p.setNextSeq(42);
    expect(p.record({ dirX: 0, dirZ: 0, jump: false })).toBe(42);
    expect(p.record({ dirX: 0, dirZ: 0, jump: false })).toBe(43);
  });

  it('reconciling to an in-sync server state reproduces the predicted state', () => {
    const list = inputs(30);
    const predictor = new LocalPredictor();
    predictor.setNextSeq(1);
    const client = createCharacterState(0, 0);
    for (const intent of list) {
      predictor.record(intent);
      stepCharacter(client, intent, SIM_DT, world);
    }
    // Server has processed only the first 18 inputs.
    const server = createCharacterState(0, 0);
    for (const intent of list.slice(0, 18)) stepCharacter(server, intent, SIM_DT, world);

    const reconciled = { ...client };
    predictor.reconcile(reconciled, server, 18, step);
    expect(reconciled.x).toBeCloseTo(client.x, 9);
    expect(reconciled.y).toBeCloseTo(client.y, 9);
    expect(reconciled.z).toBeCloseTo(client.z, 9);
    expect(predictor.pendingCount).toBe(12);
  });

  it('applies the server correction and replays unacknowledged inputs on top', () => {
    const predictor = new LocalPredictor();
    predictor.setNextSeq(1);
    const state = createCharacterState(0, 0);
    for (const intent of inputs(5)) {
      predictor.record(intent);
      stepCharacter(state, intent, SIM_DT, world);
    }
    const server = createCharacterState(3, 0); // server says we were somewhere else
    predictor.reconcile(state, server, 0, step);

    const expected = createCharacterState(3, 0);
    for (const intent of inputs(5)) stepCharacter(expected, intent, SIM_DT, world);
    expect(state.x).toBeCloseTo(expected.x, 9);
    expect(state.z).toBeCloseTo(expected.z, 9);
  });

  it('clear() drops pending inputs so the state snaps to the server', () => {
    const predictor = new LocalPredictor();
    predictor.setNextSeq(1);
    for (const intent of inputs(5)) predictor.record(intent);
    predictor.clear();
    const state = createCharacterState(9, 9);
    predictor.reconcile(state, createCharacterState(1, 2), 0, step);
    expect(state.x).toBe(1);
    expect(state.z).toBe(2);
  });
});
