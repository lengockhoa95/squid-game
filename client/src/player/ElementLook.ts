import * as THREE from 'three';
import { ELEMENTS, isElementId, type ElementId } from '@sp/shared';
import type { MaterialLibrary } from '../core/MaterialLibrary.ts';

/**
 * Element "tattoo": a glowing chest emblem, bands on both arms and a small element charm
 * orbiting the head. Purely cosmetic; driven by the synced PlayerState.element.
 */

type Shape = 'rock' | 'drop' | 'bolt' | 'ring' | 'flame' | 'cube' | 'orb';

interface LookGeometries {
  aura: THREE.BufferGeometry;
  emblem: THREE.BufferGeometry;
  band: THREE.BufferGeometry;
  shapes: Record<Shape, THREE.BufferGeometry>;
}

const SHAPE_OF: Record<ElementId, Shape> = {
  EARTH: 'rock',
  WATER: 'drop',
  THUNDER: 'bolt',
  WIND: 'ring',
  FIRE: 'flame',
  SWAP: 'cube',
  CLONE: 'orb',
  BLINK: 'ring',
  DARK: 'orb',
};

let shared: LookGeometries | null = null;
let users = 0;

function acquire(): LookGeometries {
  users++;
  if (!shared) {
    const drop = new THREE.SphereGeometry(0.1, 8, 6);
    drop.scale(1, 1.4, 1);
    shared = {
      aura: new THREE.TorusGeometry(0.62, 0.06, 4, 24).rotateX(Math.PI / 2),
      emblem: new THREE.OctahedronGeometry(0.14, 0).scale(1, 1, 0.3),
      band: new THREE.CylinderGeometry(0.16, 0.16, 0.08, 8, 1, true),
      shapes: {
        rock: new THREE.DodecahedronGeometry(0.11, 0),
        drop,
        bolt: new THREE.OctahedronGeometry(0.12, 0).scale(0.6, 1.5, 0.6),
        ring: new THREE.TorusGeometry(0.1, 0.03, 4, 10),
        flame: new THREE.ConeGeometry(0.09, 0.24, 6),
        cube: new THREE.BoxGeometry(0.14, 0.14, 0.14),
        orb: new THREE.IcosahedronGeometry(0.1, 0),
      },
    };
  }
  return shared;
}

function release(): void {
  users = Math.max(0, users - 1);
  if (users === 0 && shared) {
    shared.emblem.dispose();
    shared.aura.dispose();
    shared.band.dispose();
    for (const g of Object.values(shared.shapes)) g.dispose();
    shared = null;
  }
}

const hex = (css: string): number => Number.parseInt(css.slice(1), 16);

export interface LookTargets {
  torso: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
}

/** Where the pieces sit, in each target's local space; `unit` scales every piece (different rigs). */
export interface LookAnchors {
  emblem: [number, number, number];
  bandY: number;
  orbitY: number;
  auraY: number;
  unit: number;
}

/** Defaults for the procedural PlayerModel. */
export const PROCEDURAL_ANCHORS: LookAnchors = { emblem: [0, 0.42, 0.39], bandY: -0.16, orbitY: 1.45, auraY: 0.05, unit: 1 };

export class ElementLook {
  private readonly materials: MaterialLibrary;
  private readonly targets: LookTargets;
  private readonly geo: LookGeometries;
  private readonly parts: THREE.Mesh[] = [];
  private readonly orbit = new THREE.Group();
  private current: ElementId | null = null;
  private time = 0;
  private aura: THREE.Mesh | null = null;
  private auraColor = -1;
  private readonly anchors: LookAnchors;

  constructor(materials: MaterialLibrary, targets: LookTargets, anchors: LookAnchors = PROCEDURAL_ANCHORS) {
    this.materials = materials;
    this.targets = targets;
    this.anchors = anchors;
    this.geo = acquire();
    this.orbit.position.y = anchors.orbitY; // above the head (torso space)
    this.orbit.scale.setScalar(anchors.unit);
    targets.torso.add(this.orbit);
  }

  get element(): ElementId | null {
    return this.current;
  }

  set(raw: string): void {
    const next = isElementId(raw) ? raw : null;
    if (next === this.current) return;
    this.clear();
    this.current = next;
    if (!next) return;
    const color = hex(ELEMENTS[next].color);
    const glow = this.materials.basic(color);

    const emblem = new THREE.Mesh(this.geo.emblem, glow);
    emblem.position.set(...this.anchors.emblem); // chest, in front of the body
    emblem.scale.multiplyScalar(this.anchors.unit);
    this.targets.torso.add(emblem);
    this.parts.push(emblem);

    for (const arm of [this.targets.armL, this.targets.armR]) {
      const band = new THREE.Mesh(this.geo.band, glow);
      band.position.y = this.anchors.bandY;
      band.scale.setScalar(this.anchors.unit);
      arm.add(band);
      this.parts.push(band);
    }

    const shape = this.geo.shapes[SHAPE_OF[next]];
    for (let i = 0; i < 2; i++) {
      const charm = new THREE.Mesh(shape, glow);
      const a = i * Math.PI;
      charm.position.set(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
      if (next === 'BLINK') charm.rotation.x = Math.PI / 2;
      this.orbit.add(charm);
      this.parts.push(charm);
    }
  }

  /** Awakened-card halo under the feet (-1 = none). */
  setAura(color: number, root: THREE.Object3D): void {
    if (color === this.auraColor) return;
    this.auraColor = color;
    this.aura?.removeFromParent();
    this.aura = null;
    if (color < 0) return;
    this.aura = new THREE.Mesh(this.geo.aura, this.materials.basic(color));
    this.aura.position.y = this.anchors.auraY;
    root.add(this.aura);
  }

  update(dt: number): void {
    this.time += dt;
    if (this.aura) {
      this.aura.rotation.y += dt * 1.5;
      this.aura.scale.setScalar(this.anchors.unit * (1 + Math.sin(this.time * 5) * 0.08));
    }
    if (!this.current) return;
    this.orbit.rotation.y += dt * 2.2;
    this.orbit.position.y = this.anchors.orbitY + Math.sin(this.time * 3) * 0.05 * this.anchors.unit;
    const spin = this.current === 'FIRE' ? 0 : dt * 4;
    for (const c of this.orbit.children) c.rotation.y += spin;
  }

  dispose(): void {
    this.clear();
    this.aura?.removeFromParent();
    this.orbit.removeFromParent();
    release();
  }

  private clear(): void {
    for (const p of this.parts) p.removeFromParent();
    this.parts.length = 0;
  }
}
