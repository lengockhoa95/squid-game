import {
  createCharacterState, intentTowardTarget,
  type CharacterState, type MoveIntent, type StepFn,
} from '@sp/shared';
import type { PlayerModel } from './PlayerModel.ts';
import { AnimationController } from './AnimationController.ts';

export const FIXED_DT = 1 / 60;
/** Corrections larger than this are treated as teleports (snap instead of smoothing). */
const SNAP_DISTANCE = 3;
const CORRECTION_SHARPNESS = 12;

function lerpAngle(a: number, b: number, t: number): number {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
}

/**
 * Drives one character with the shared kinematics (same code the server will run).
 * Keyboard input overrides and cancels the click-to-move target.
 */
export class PlayerController {
  readonly state: CharacterState;
  readonly model: PlayerModel;
  private readonly anim: AnimationController;
  private step: StepFn;
  private readonly killY: number | null;
  private readonly spawnX: number;
  private readonly spawnZ: number;
  private readonly intent: MoveIntent = { dirX: 0, dirZ: 0, jump: false };
  private hasTarget = false;
  private targetX = 0;
  private targetZ = 0;
  private jumpQueued = false;
  private prevX: number;
  private prevY: number;
  private prevZ: number;
  private visualYaw = 0;
  private offX = 0;
  private offY = 0;
  private offZ = 0;

  /**
   * @param killY when set, falling below it respawns locally (offline only; online the server respawns).
   */
  constructor(step: StepFn, model: PlayerModel, spawnX: number, spawnZ: number, spawnYaw = 0, killY: number | null = null) {
    this.step = step;
    this.killY = killY;
    this.model = model;
    this.spawnX = spawnX;
    this.spawnZ = spawnZ;
    this.state = createCharacterState(spawnX, spawnZ);
    this.state.yaw = spawnYaw;
    this.visualYaw = spawnYaw;
    this.prevX = spawnX;
    this.prevY = 0;
    this.prevZ = spawnZ;
    this.anim = new AnimationController(model);
    this.syncModel(1, 0);
  }

  /** The intent used by the most recent fixedUpdate (read it to send to the server). */
  get lastIntent(): Readonly<MoveIntent> {
    return this.intent;
  }

  get isClickMoving(): boolean {
    return this.hasTarget;
  }

  get target(): { x: number; z: number } | null {
    return this.hasTarget ? { x: this.targetX, z: this.targetZ } : null;
  }

  setTarget(x: number, z: number): void {
    this.hasTarget = true;
    this.targetX = x;
    this.targetZ = z;
  }

  clearTarget(): void {
    this.hasTarget = false;
  }

  setStep(step: StepFn): void {
    this.step = step;
  }

  /** Stop: cancel the click target; the character brakes with normal deceleration (same as the server). */
  stop(): void {
    this.hasTarget = false;
  }

  requestJump(): void {
    this.jumpQueued = true;
  }

  /** @param t game time used by moving hazards */
  fixedUpdate(keyDirX: number, keyDirZ: number, t = 0): void {
    const s = this.state;
    this.prevX = s.x;
    this.prevY = s.y;
    this.prevZ = s.z;

    if (keyDirX !== 0 || keyDirZ !== 0) {
      this.hasTarget = false;
      this.intent.dirX = keyDirX;
      this.intent.dirZ = keyDirZ;
    } else if (this.hasTarget) {
      if (intentTowardTarget(s, this.targetX, this.targetZ, this.intent)) this.hasTarget = false;
    } else {
      this.intent.dirX = 0;
      this.intent.dirZ = 0;
    }
    this.intent.jump = this.jumpQueued;
    this.jumpQueued = false;

    this.step(s, this.intent, FIXED_DT, t);

    if (this.killY !== null && s.y < this.killY) this.respawn();
  }

  /**
   * The simulation state was moved by (dx, dy, dz) due to server reconciliation.
   * Keep the rendered position continuous and blend the error away over a few frames.
   */
  applyCorrection(dx: number, dy: number, dz: number): void {
    if (dx === 0 && dy === 0 && dz === 0) return;
    this.prevX += dx;
    this.prevY += dy;
    this.prevZ += dz;
    if (Math.hypot(dx, dy, dz) > SNAP_DISTANCE) {
      this.offX = this.offY = this.offZ = 0;
      return;
    }
    this.offX -= dx;
    this.offY -= dy;
    this.offZ -= dz;
  }

  /** @param alpha interpolation factor between the previous and current fixed step. */
  renderUpdate(alpha: number, dt: number): void {
    this.syncModel(alpha, dt);
  }

  respawn(): void {
    const s = this.state;
    s.x = this.spawnX;
    s.z = this.spawnZ;
    s.y = 0;
    s.vx = s.vy = s.vz = 0;
    s.grounded = true;
    this.hasTarget = false;
    this.offX = this.offY = this.offZ = 0;
    this.prevX = s.x;
    this.prevY = s.y;
    this.prevZ = s.z;
  }

  private syncModel(alpha: number, dt: number): void {
    const s = this.state;
    const decay = Math.exp(-CORRECTION_SHARPNESS * dt);
    this.offX *= decay;
    this.offY *= decay;
    this.offZ *= decay;
    const p = this.model.group.position;
    p.set(
      this.prevX + (s.x - this.prevX) * alpha + this.offX,
      this.prevY + (s.y - this.prevY) * alpha + this.offY,
      this.prevZ + (s.z - this.prevZ) * alpha + this.offZ,
    );
    this.visualYaw = lerpAngle(this.visualYaw, s.yaw, 1 - Math.exp(-14 * dt));
    this.model.group.rotation.y = this.visualYaw;
    this.anim.update(dt, Math.hypot(s.vx, s.vz), s.grounded);
  }
}
