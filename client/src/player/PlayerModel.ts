import * as THREE from 'three';
import { CHARACTER_SCALE } from '@sp/shared';
import type { MaterialLibrary } from '../core/MaterialLibrary.ts';
import { ElementLook } from './ElementLook.ts';
import { AnimationController } from './AnimationController.ts';
import { FLIP_SECONDS, flipAngle, type CharacterBody, type Pose } from './CharacterBody.ts';

export type Accessory = 'none' | 'cap' | 'glasses' | 'band';

export const SKIN_COLOR = 0xffd2a8;
const DARK_COLOR = 0x23232e;

interface SharedGeometries {
  body: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  limb: THREE.BufferGeometry;
  eye: THREE.BufferGeometry;
  capTop: THREE.BufferGeometry;
  capBrim: THREE.BufferGeometry;
  glasses: THREE.BufferGeometry;
  band: THREE.BufferGeometry;
}

let shared: SharedGeometries | null = null;
let users = 0;

/** Low-poly geometries shared by every character; freed when the last model is disposed. */
function acquireGeometries(): SharedGeometries {
  users++;
  if (!shared) {
    const limb = new THREE.BoxGeometry(0.2, 0.55, 0.22);
    limb.translate(0, -0.275, 0); // pivot at the top (shoulder / hip)
    shared = {
      body: new THREE.CylinderGeometry(0.34, 0.42, 0.7, 7),
      head: new THREE.IcosahedronGeometry(0.33, 1),
      limb,
      eye: new THREE.BoxGeometry(0.07, 0.1, 0.04),
      capTop: new THREE.CylinderGeometry(0.31, 0.34, 0.16, 8),
      capBrim: new THREE.BoxGeometry(0.42, 0.04, 0.24),
      glasses: new THREE.BoxGeometry(0.46, 0.09, 0.05),
      band: new THREE.TorusGeometry(0.32, 0.045, 4, 10),
    };
  }
  return shared;
}

function releaseGeometries(): void {
  users = Math.max(0, users - 1);
  if (users === 0 && shared) {
    for (const g of Object.values(shared)) g.dispose();
    shared = null;
  }
}

/**
 * Procedural low-poly character (~10 meshes, no textures, no skeleton).
 * Origin is at the feet; +Z is the facing direction.
 */
export class PlayerModel implements CharacterBody {
  readonly tagHeight = 2.55;
  private anim: AnimationController | null = null;
  /** group → flipGroup (pivot mid-body) → flipOffset → poseGroup */
  private readonly flipGroup = new THREE.Group();
  private flipT = -1;
  readonly group = new THREE.Group();
  /** Inner pivot used for whole-body poses (falling over) without touching position/yaw on `group`. */
  readonly poseGroup = new THREE.Group();
  /** Everything above the hips; bobbed by the animation. */
  readonly torso = new THREE.Group();
  readonly head: THREE.Mesh;
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  readonly legL = new THREE.Group();
  readonly legR = new THREE.Group();
  private disposed = false;
  private readonly materials: MaterialLibrary;
  private look: ElementLook | null = null;

  constructor(materials: MaterialLibrary, color: number, accessory: Accessory) {
    this.materials = materials;
    const g = acquireGeometries();
    const bodyMat = materials.lambert(color);
    const skinMat = materials.lambert(SKIN_COLOR);
    const darkMat = materials.lambert(DARK_COLOR);

    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      return m;
    };

    // Legs (pivot at hips, y = 0.55)
    this.legL.position.set(-0.15, 0.55, 0);
    this.legR.position.set(0.15, 0.55, 0);
    this.legL.add(mesh(g.limb, darkMat));
    this.legR.add(mesh(g.limb, darkMat));

    // Torso
    this.torso.position.y = 0.55;
    const body = mesh(g.body, bodyMat);
    body.position.y = 0.35;
    this.torso.add(body);

    this.armL.position.set(-0.45, 0.62, 0);
    this.armR.position.set(0.45, 0.62, 0);
    this.armL.add(mesh(g.limb, bodyMat));
    this.armR.add(mesh(g.limb, bodyMat));
    this.torso.add(this.armL, this.armR);

    this.head = mesh(g.head, skinMat);
    this.head.position.y = 1.02;
    this.torso.add(this.head);

    const eyeL = new THREE.Mesh(g.eye, darkMat);
    const eyeR = new THREE.Mesh(g.eye, darkMat);
    eyeL.position.set(-0.11, 0.05, 0.31);
    eyeR.position.set(0.11, 0.05, 0.31);
    this.head.add(eyeL, eyeR);

    this.addAccessory(accessory, g, materials, color);
    this.poseGroup.add(this.legL, this.legR, this.torso);
    this.flipGroup.position.y = 0.8;
    const flipOffset = new THREE.Group();
    flipOffset.position.y = -0.8;
    flipOffset.add(this.poseGroup);
    this.flipGroup.add(flipOffset);
    this.group.add(this.flipGroup);
    this.group.scale.setScalar(CHARACTER_SCALE);
  }

  /** Show the element tattoo/charm for this element id ('' = none). */
  setElement(element: string): void {
    if (!element && !this.look) return;
    this.look ??= new ElementLook(this.materials, { torso: this.torso, armL: this.armL, armR: this.armR });
    this.look.set(element);
  }

  /** Awakened-card halo (CSS hex color like '#ffd23f', or '' for none). */
  setAura(css: string): void {
    if (!css && !this.look) return;
    this.look ??= new ElementLook(this.materials, { torso: this.torso, armL: this.armL, armR: this.armR });
    this.look.setAura(css ? Number.parseInt(css.slice(1), 16) : -1, this.poseGroup);
  }

  animate(dt: number, horizontalSpeed: number, grounded: boolean): void {
    this.anim ??= new AnimationController(this);
    this.anim.update(dt, horizontalSpeed, grounded);
    if (this.flipT >= 0) {
      this.flipT += dt;
      this.flipGroup.rotation.x = flipAngle(this.flipT);
      if (this.flipT >= FLIP_SECONDS) this.flipT = -1;
    }
  }

  flip(): void {
    this.flipT = 0;
  }

  setPose(pose: Pose): void {
    this.anim ??= new AnimationController(this);
    this.anim.setPose(pose);
  }

  /** Animate cosmetic extras (element charm). */
  updateExtras(dt: number): void {
    this.look?.update(dt);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.look?.dispose();
    this.look = null;
    this.group.removeFromParent();
    releaseGeometries();
  }

  private addAccessory(a: Accessory, g: SharedGeometries, materials: MaterialLibrary, color: number): void {
    const accent = materials.lambert(0xffffff);
    if (a === 'cap') {
      const capMat = materials.lambert(color);
      const top = new THREE.Mesh(g.capTop, capMat);
      top.position.y = 0.26;
      const brim = new THREE.Mesh(g.capBrim, accent);
      brim.position.set(0, 0.2, 0.24);
      this.head.add(top, brim);
    } else if (a === 'glasses') {
      const glasses = new THREE.Mesh(g.glasses, materials.lambert(0x111111));
      glasses.position.set(0, 0.05, 0.31);
      this.head.add(glasses);
    } else if (a === 'band') {
      const band = new THREE.Mesh(g.band, accent);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.12;
      this.head.add(band);
    }
  }
}
