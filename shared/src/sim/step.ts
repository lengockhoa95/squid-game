import type { CharacterState, MoveIntent, SimWorld } from './kinematics.ts';
import { stepCharacter } from './kinematics.ts';

/**
 * One fixed simulation step for a character. `t` is the round's game time (seconds),
 * used by games with moving hazards. Server and client prediction call the same function.
 */
export type StepFn = (s: CharacterState, intent: Readonly<MoveIntent>, dt: number, t: number) => void;

export function staticWorldStep(world: SimWorld): StepFn {
  return (s, intent, dt) => stepCharacter(s, intent, dt, world);
}
