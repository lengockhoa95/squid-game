import {
  createCharacterState, intentTowardTarget, stepCharacter,
  type CharacterState, type MoveIntent, type SimWorld,
} from '@sp/shared';
import type { PlayerModel } from './PlayerModel.ts';
import { AnimationController } from './AnimationController.ts';

export const FIXED_DT = 1 / 60;

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
  private readonly world: SimWorld;
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

  constructor(world: SimWorld, model: PlayerModel, spawnX: number, spawnZ: number, spawnYaw = 0) {
    this.world = world;
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

  /** Stop immediately: cancel the target and kill horizontal velocity. */
  stop(): void {
    this.hasTarget = false;
    this.state.vx = 0;
    this.state.vz = 0;
  }

  requestJump(): void {
    this.jumpQueued = true;
  }

  fixedUpdate(keyDirX: number, keyDirZ: number): void {
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

    stepCharacter(s, this.intent, FIXED_DT, this.world);

    if (s.y < this.world.killY) this.respawn();
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
    this.prevX = s.x;
    this.prevY = s.y;
    this.prevZ = s.z;
  }

  private syncModel(alpha: number, dt: number): void {
    const s = this.state;
    const p = this.model.group.position;
    p.set(
      this.prevX + (s.x - this.prevX) * alpha,
      this.prevY + (s.y - this.prevY) * alpha,
      this.prevZ + (s.z - this.prevZ) * alpha,
    );
    this.visualYaw = lerpAngle(this.visualYaw, s.yaw, 1 - Math.exp(-14 * dt));
    this.model.group.rotation.y = this.visualYaw;
    this.anim.update(dt, Math.hypot(s.vx, s.vz), s.grounded);
  }
}
