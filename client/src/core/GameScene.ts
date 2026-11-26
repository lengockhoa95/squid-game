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

export interface GameScene {
  readonly root: THREE.Scene;
  update(dt: number, input: Readonly<FrameInput>): void;
  /** World position the camera should follow. */
  getCameraTarget(): Readonly<THREE.Vector3>;
  /** Facing yaw for camera auto-align, or null when the camera should not auto-rotate. */
  getAutoAlignYaw(): number | null;
  /** Meshes that accept ground clicks for click-to-move. */
  getClickTargets(): readonly THREE.Object3D[];
  onGroundClick(x: number, y: number, z: number): void;
  onStop(): void;
  onJump(): void;
  applyQuality(p: QualityPreset): void;
  entityCount(): number;
  dispose(): void;
}
