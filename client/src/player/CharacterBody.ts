import type * as THREE from 'three';

export type Pose = 'normal' | 'fallen' | 'cheer';

/**
 * A character's visual body: position/rotation live on `group`; the body animates itself from
 * speed/grounded/pose and carries the cosmetic extras (element tattoo, awakening aura).
 * Implemented by the procedural PlayerModel (fallback) and the Kenney glTF characters.
 */
export interface CharacterBody {
  readonly group: THREE.Group;
  /** Head node, for attachments (e.g. the minotaur's horns). */
  readonly head: THREE.Object3D;
  /** Height for the name tag, in `group` space. */
  readonly tagHeight: number;
  animate(dt: number, horizontalSpeed: number, grounded: boolean): void;
  setPose(pose: Pose): void;
  setElement(element: string): void;
  setAura(css: string): void;
  dispose(): void;
}
