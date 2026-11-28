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
  /** Play a forward somersault (the mid-air jump). */
  flip(): void;
  /** Hold a weapon model in the right hand ('' = empty hands). */
  /** Weapon in hand ('' = none); `tier` 0–3 makes it glow in its rarity colour. */
  setWeapon(model: string, tier?: number): void;
  /** Play an attack (swing or shot). */
  attack(ranged: boolean): void;
  setElement(element: string): void;
  setAura(css: string): void;
  dispose(): void;
}

/** Somersault timing shared by every body. */
export const FLIP_SECONDS = 0.45;

/** Rotation (rad) for a flip that started `t` seconds ago: ease-out full turn, 0 when done. */
export function flipAngle(t: number): number {
  if (t < 0 || t >= FLIP_SECONDS) return 0;
  const f = t / FLIP_SECONDS;
  return (1 - (1 - f) * (1 - f)) * Math.PI * 2;
}
