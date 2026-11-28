import type { Box } from '@sp/shared';
import type * as THREE from 'three';
import type { QualityPreset } from '@sp/shared';
import type { MaterialLibrary } from './MaterialLibrary.ts';

export interface SceneContext {
  materials: MaterialLibrary;
  quality: QualityPreset;
}

/** Per-frame input already resolved by the engine (camera-relative keyboard direction). */
export interface FrameInput {
  keyDirX: number;
  keyDirZ: number;
}

/** A world-space ray from the camera (origin + normalized direction). */
export interface AimRay {
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
}

export interface ClickHit {
  x: number;
  y: number;
  z: number;
  /** Object hit by the ray, or null when the ground-plane fallback was used. */
  object: THREE.Object3D | null;
  instanceId: number | undefined;
}

export interface CameraPreset {
  yaw: number;
  pitch: number;
  distance: number;
}

export interface GameScene {
  readonly root: THREE.Scene;
  update(dt: number, input: Readonly<FrameInput>): void;
  /** World position the camera should follow. */
  getCameraTarget(): Readonly<THREE.Vector3>;
  /** Facing yaw for camera auto-align, or null when the camera should not auto-rotate. */
  getAutoAlignYaw(): number | null;
  /** Meshes that accept ground clicks for click-to-move. */
  getClickTargets(): readonly THREE.Object3D[];
  onGroundClick(hit: ClickHit): void;
  /** Any game key pressed (KeyA, KeyD, Space…), after movement handling. */
  onKeyPress?(code: string): void;
  /** One-shot camera preset (e.g. when a new minigame loads). */
  takeCameraPreset?(): CameraPreset | null;
  onStop(): void;
  onJump(): void;
  /** Combat games: attack along the aim ray (from the camera through the crosshair / cursor). */
  onAttack?(ray: AimRay): void;
  /** Thủ Thành: fire the grappling hook along the aim ray. */
  onHook?(ray: AimRay): void;
  /** Boxes the camera must not pass through (walls, towers). */
  cameraBlockers?(): readonly Box[];
  /** Combat games: left click attacks, right click uses the element. */
  combatAim?(): boolean;
  /** True while shooter-style mouse look makes sense (e.g. walking around in a round). */
  wantsPointerLock?(): boolean;
  /** Cast key pressed: `hit` is the ground point under the cursor (null if unknown). */
  onCastAt?(hit: ClickHit | null): void;
  applyQuality(p: QualityPreset): void;
  entityCount(): number;
  dispose(): void;
}
