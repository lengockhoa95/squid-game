export interface MovementParams {
  walkSpeed: number;
  accel: number;
  decel: number;
  airControl: number;
  gravity: number;
  jumpVelocity: number;
  radius: number;
  stepHeight: number;
  arriveRadius: number;
}

/** Visual scale of characters (smaller, nimbler players). Collision radius matches it. */
export const CHARACTER_SCALE = 0.75;

export const MOVEMENT: Readonly<MovementParams> = {
  walkSpeed: 6.5,
  accel: 80,
  decel: 60,
  airControl: 0.85,
  gravity: 28,
  jumpVelocity: 9,
  radius: 0.32,
  stepHeight: 0.35,
  arriveRadius: 0.2,
};
