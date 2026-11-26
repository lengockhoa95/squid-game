import type { PlayerModel } from './PlayerModel.ts';
import { MOVEMENT } from '@sp/shared';

const STRIDE_FREQ = 2.1; // base stride cycles per second, scaled up with speed
const SWING = 0.9; // max limb swing (rad)
const BLEND = 10;

/** Procedural animation: idle breathing, run cycle scaled by speed, airborne pose. */
export class AnimationController {
  private readonly model: PlayerModel;
  private phase = 0;
  private runAmount = 0;
  private airAmount = 0;
  private time = Math.random() * 10;

  constructor(model: PlayerModel) {
    this.model = model;
  }

  update(dt: number, horizontalSpeed: number, grounded: boolean): void {
    this.time += dt;
    const k = 1 - Math.exp(-BLEND * dt);
    const targetRun = Math.min(1, horizontalSpeed / MOVEMENT.walkSpeed);
    this.runAmount += (targetRun - this.runAmount) * k;
    this.airAmount += ((grounded ? 0 : 1) - this.airAmount) * k;

    this.phase += dt * STRIDE_FREQ * Math.PI * (0.6 + this.runAmount);
    const swing = Math.sin(this.phase) * SWING * this.runAmount * (1 - this.airAmount);
    const m = this.model;

    m.legL.rotation.x = swing;
    m.legR.rotation.x = -swing;
    m.armL.rotation.x = -swing * 0.8 - this.airAmount * 2.4;
    m.armR.rotation.x = swing * 0.8 - this.airAmount * 2.4;
    m.armL.rotation.z = -0.08 - this.airAmount * 0.3;
    m.armR.rotation.z = 0.08 + this.airAmount * 0.3;

    const idleBreath = Math.sin(this.time * 2.2) * 0.015 * (1 - this.runAmount);
    const runBob = Math.abs(Math.sin(this.phase)) * 0.07 * this.runAmount * (1 - this.airAmount);
    m.torso.position.y = 0.55 + idleBreath + runBob;
    m.torso.rotation.x = this.runAmount * 0.12;
  }
}
