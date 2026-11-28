import * as THREE from 'three';
import { rayBox, type Box } from '@sp/shared';

const DEG = Math.PI / 180;

/** Screen shake strength (metres of jitter); effects raise it, the camera lets it decay. */
export const cameraShake = { amount: 0 };

/** Add a shake (the strongest one wins). */
export function shake(amount: number): void {
  cameraShake.amount = Math.min(1.2, Math.max(cameraShake.amount, amount));
}

export const CAMERA_LIMITS = {
  /** Below the horizon: the camera dips low and looks up (aim at flyers). */
  pitchMin: -30 * DEG,
  pitchMax: 60 * DEG,
  distanceMin: 6,
  distanceMax: 14,
} as const;

const FOLLOW_SHARPNESS = 10;
const ROTATE_SHARPNESS = 14;
const AUTO_ALIGN_RATE = 1.6; // rad/s max auto-rotation speed
const AUTO_ALIGN_DELAY_MS = 1500;
const AUTO_ALIGN_MAX_ANGLE = (70 * Math.PI) / 180;
const MOUSE_SENSITIVITY = 0.005;
const KEY_ROTATE_SPEED = 2.2; // rad/s

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Smooth third-person orbit camera with pitch/distance limits and gentle auto-align. */
export class CameraManager {
  readonly camera: THREE.PerspectiveCamera;
  /** Target yaw/pitch/distance (what the user asked for). */
  yaw = 0;
  pitch = 28 * DEG;
  distance = 10;
  private curYaw = 0;
  private curPitch = this.pitch;
  private curDistance = this.distance;
  private readonly focus = new THREE.Vector3();
  private hasFocus = false;
  private lastManualRotate = -Infinity;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 250);
  }

  /** Current smoothed yaw — use this for camera-relative keyboard movement. */
  get viewYaw(): number {
    return this.curYaw;
  }

  setAspect(aspect: number): void {
    if (Math.abs(this.camera.aspect - aspect) < 1e-4) return;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  rotateByMouse(dx: number, dy: number): void {
    this.yaw -= dx * MOUSE_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * MOUSE_SENSITIVITY, CAMERA_LIMITS.pitchMin, CAMERA_LIMITS.pitchMax);
    this.lastManualRotate = performance.now();
  }

  rotateByKeys(direction: number, dt: number): void {
    if (direction === 0) return;
    this.yaw += direction * KEY_ROTATE_SPEED * dt;
    this.lastManualRotate = performance.now();
  }

  zoom(steps: number): void {
    this.distance = THREE.MathUtils.clamp(this.distance + steps * 1.2, CAMERA_LIMITS.distanceMin, CAMERA_LIMITS.distanceMax);
  }

  /**
   * @param autoAlignYaw facing yaw of the followed character, or null to skip auto-align.
   *   The camera only auto-aligns when the user has not rotated it manually for a while.
   */
  update(dt: number, target: Readonly<THREE.Vector3>, autoAlignYaw: number | null): void {
    if (!this.hasFocus) {
      this.focus.copy(target);
      this.hasFocus = true;
    }
    if (autoAlignYaw !== null && performance.now() - this.lastManualRotate > AUTO_ALIGN_DELAY_MS) {
      // Camera behind the character: offset direction is opposite to its facing.
      const behind = autoAlignYaw + Math.PI;
      const diff = wrapAngle(behind - this.yaw);
      // Only while running roughly away from the camera: strafing or running back toward it must not
      // drag the camera around (with camera-relative keys that would spin the player in circles).
      if (Math.abs(diff) < AUTO_ALIGN_MAX_ANGLE) {
        const step = AUTO_ALIGN_RATE * dt;
        this.yaw += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
      }
    }

    const kFollow = 1 - Math.exp(-FOLLOW_SHARPNESS * dt);
    const kRotate = 1 - Math.exp(-ROTATE_SHARPNESS * dt);
    this.focus.lerp(target, kFollow);
    this.curYaw += wrapAngle(this.yaw - this.curYaw) * kRotate;
    this.curPitch += (this.pitch - this.curPitch) * kRotate;
    this.curDistance += (this.distance - this.curDistance) * kRotate;

    // Below the horizon: pull in close, stay above the ground and look up (aim at the sky).
    let dist = this.curDistance;
    let lookY = this.focus.y + 1.2;
    if (this.curPitch < 0) {
      dist *= Math.max(0.45, 1 + this.curPitch);
      lookY += -this.curPitch * 6;
    }
    const horizontal = Math.cos(this.curPitch) * dist;
    this.camera.position.set(
      this.focus.x + Math.sin(this.curYaw) * horizontal,
      Math.max(this.focus.y + 0.35, this.focus.y + 1.2 + Math.sin(this.curPitch) * dist),
      this.focus.z + Math.cos(this.curYaw) * horizontal,
    );
    this.avoidBlockers();
    this.camera.lookAt(this.focus.x, lookY, this.focus.z);
    // Screen shake (hits, explosions): a quick random jitter that dies down.
    if (cameraShake.amount > 0.002) {
      const a = cameraShake.amount;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
      this.camera.rotation.z += (Math.random() - 0.5) * a * 0.04;
      cameraShake.amount *= Math.exp(-9 * dt);
    }
  }

  /** Solid boxes between the character and the camera pull the camera in (no seeing through walls). */
  blockers: readonly Box[] = [];

  private avoidBlockers(): void {
    if (this.blockers.length === 0) return;
    const ox = this.focus.x;
    const oy = this.focus.y + 1.2;
    const oz = this.focus.z;
    const p = this.camera.position;
    const dx = p.x - ox;
    const dy = p.y - oy;
    const dz = p.z - oz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-3) return;
    let best = len;
    for (const b of this.blockers) {
      const t = rayBox(ox, oy, oz, dx / len, dy / len, dz / len, b);
      if (t !== null && t > 0.2 && t < best) best = t;
    }
    if (best >= len) return;
    const k = Math.max(1.2, best - 0.35) / len;
    p.set(ox + dx * k, oy + dy * k, oz + dz * k);
  }

  /** Set yaw/pitch/distance (clamped) and blend to them; also suppresses auto-align briefly. */
  applyPreset(p: { yaw: number; pitch: number; distance: number }): void {
    this.yaw = p.yaw;
    this.pitch = THREE.MathUtils.clamp(p.pitch, CAMERA_LIMITS.pitchMin, CAMERA_LIMITS.pitchMax);
    this.distance = THREE.MathUtils.clamp(p.distance, CAMERA_LIMITS.distanceMin, CAMERA_LIMITS.distanceMax);
    this.lastManualRotate = performance.now();
  }

  /** Jump straight to the target (used when a scene loads). */
  snapTo(target: Readonly<THREE.Vector3>): void {
    this.focus.copy(target);
    this.hasFocus = true;
    this.curYaw = this.yaw;
    this.curPitch = this.pitch;
    this.curDistance = this.distance;
  }
}
