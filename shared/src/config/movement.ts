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

export const MOVEMENT: Readonly<MovementParams> = {
  walkSpeed: 6,
  accel: 50,
  decel: 40,
  airControl: 0.4,
  gravity: 28,
  jumpVelocity: 9,
  radius: 0.45,
  stepHeight: 0.35,
  arriveRadius: 0.2,
};
