import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Lightweight particle effects on Kenney "Particle Pack" textures (CC0): white shapes on a
 * transparent background, tinted per effect and drawn additively.
 * - sprites: camera-facing puffs (flash, sparks, smoke, flames)
 * - streaks: crossed quads along a direction (bullet / arrow trails)
 * - decals: flat quads on the ground or along a swing (slash, scorch, shock ring)
 */
const BASE = `${import.meta.env.BASE_URL ?? '/'}fx/`;
export type FxTexture =
  | 'muzzle_01' | 'trace_01' | 'slash_01' | 'spark_01' | 'flame_01' | 'fire_01' | 'smoke_01'
  | 'star_01' | 'magic_01' | 'circle_01' | 'scorch_01' | 'light_01' | 'twirl_01';

const textures = new Map<FxTexture, THREE.Texture>();
const loader = new THREE.TextureLoader();

function texture(name: FxTexture): THREE.Texture {
  let t = textures.get(name);
  if (!t) {
    t = loader.load(`${BASE}${name}.png`);
    t.colorSpace = THREE.SRGBColorSpace;
    textures.set(name, t);
  }
  return t;
}

interface Particle {
  object: THREE.Object3D;
  material: THREE.SpriteMaterial | THREE.MeshBasicMaterial;
  age: number;
  life: number;
  vel: THREE.Vector3;
  gravity: number;
  size0: number;
  size1: number;
  opacity: number;
  spin: number;
  /** Streak: travels from `from` to `to` (then calls onArrive). */
  streak?: { from: THREE.Vector3; to: THREE.Vector3; length: number; onArrive?: () => void };
  /** Decal: scales uniformly in its own plane. */
  decal?: boolean;
}

export interface SpriteOptions {
  tex: FxTexture;
  color: THREE.ColorRepresentation;
  pos: THREE.Vector3Like;
  life: number;
  size: number;
  /** End size (default = size). */
  size1?: number;
  vel?: THREE.Vector3Like;
  gravity?: number;
  opacity?: number;
  spin?: number;
  additive?: boolean;
}

const MAX_PARTICLES = 400;

export class Particles {
  readonly root = new THREE.Group();
  private readonly list: Particle[] = [];
  private readonly quad = new THREE.PlaneGeometry(1, 1);
  /** Streak: two crossed quads, unit length along +z, starting at the origin. */
  private readonly cross: THREE.BufferGeometry;

  constructor() {
    // Texture v axis along +z in both quads (one flat, one upright).
    const a = new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    const b = new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    this.cross = mergeGeometries([a, b])!;
    a.dispose();
    b.dispose();
  }

  sprite(o: SpriteOptions): void {
    if (this.list.length >= MAX_PARTICLES) return;
    const material = new THREE.SpriteMaterial({
      map: texture(o.tex), color: o.color, transparent: true, depthWrite: false,
      blending: o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending, opacity: o.opacity ?? 1,
    });
    const s = new THREE.Sprite(material);
    s.position.set(o.pos.x, o.pos.y, o.pos.z);
    s.scale.setScalar(o.size);
    material.rotation = Math.random() * Math.PI * 2;
    this.root.add(s);
    this.list.push({
      object: s, material, age: 0, life: o.life, vel: new THREE.Vector3(o.vel?.x ?? 0, o.vel?.y ?? 0, o.vel?.z ?? 0),
      gravity: o.gravity ?? 0, size0: o.size, size1: o.size1 ?? o.size, opacity: o.opacity ?? 1, spin: o.spin ?? 0,
    });
  }

  /** A trail flying from `from` to `to` at `speed` m/s; `onArrive` fires at the end (impact puff). */
  streak(tex: FxTexture, color: THREE.ColorRepresentation, from: THREE.Vector3, to: THREE.Vector3, speed: number, length: number, width: number, onArrive?: () => void): void {
    if (this.list.length >= MAX_PARTICLES) return;
    const material = new THREE.MeshBasicMaterial({
      map: texture(tex), color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Mesh(this.cross, material);
    m.position.copy(from);
    m.lookAt(to);
    m.scale.set(width, width, 0.01);
    this.root.add(m);
    const life = Math.max(0.05, from.distanceTo(to) / speed);
    this.list.push({
      object: m, material, age: 0, life, vel: new THREE.Vector3(), gravity: 0, size0: width, size1: width, opacity: 1, spin: 0,
      streak: { from: from.clone(), to: to.clone(), length, onArrive },
    });
  }

  /**
   * A flat textured quad (slash arc, scorch mark, shock ring). `yaw` turns it around the vertical;
   * `tilt` lifts it from lying flat (0) toward standing up (π/2).
   */
  decal(tex: FxTexture, color: THREE.ColorRepresentation, pos: THREE.Vector3Like, yaw: number, tilt: number, size: number, size1: number, life: number, additive = true, opacity = 1): void {
    if (this.list.length >= MAX_PARTICLES) return;
    const material = new THREE.MeshBasicMaterial({
      map: texture(tex), color, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const m = new THREE.Mesh(this.quad, material);
    m.position.set(pos.x, pos.y, pos.z);
    m.rotation.set(0, yaw, 0, 'YXZ');
    m.rotateX(-Math.PI / 2 + tilt);
    m.scale.setScalar(size);
    this.root.add(m);
    this.list.push({ object: m, material, age: 0, life, vel: new THREE.Vector3(), gravity: 0, size0: size, size1, opacity, spin: 0, decal: true });
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]!;
      p.age += dt;
      const f = Math.min(1, p.age / p.life);
      if (p.streak) {
        const st = p.streak;
        const head = new THREE.Vector3().lerpVectors(st.from, st.to, f);
        const len = Math.min(st.length, head.distanceTo(st.from));
        const dir = new THREE.Vector3().subVectors(st.to, st.from).normalize();
        p.object.position.copy(head).addScaledVector(dir, -len);
        p.object.scale.z = Math.max(0.01, len);
      } else {
        p.vel.y -= p.gravity * dt;
        p.object.position.addScaledVector(p.vel, dt);
        const size = p.size0 + (p.size1 - p.size0) * f;
        if (p.decal) p.object.scale.setScalar(size);
        else p.object.scale.set(size, size, 1);
        if (p.spin && p.material instanceof THREE.SpriteMaterial) p.material.rotation += p.spin * dt;
        p.material.opacity = p.opacity * (1 - f * f);
      }
      if (p.age < p.life) continue;
      p.streak?.onArrive?.();
      p.object.removeFromParent();
      p.material.dispose();
      this.list.splice(i, 1);
    }
  }

  dispose(): void {
    for (const p of this.list) {
      p.object.removeFromParent();
      p.material.dispose();
    }
    this.list.length = 0;
    this.quad.dispose();
    this.cross.dispose();
    this.root.removeFromParent();
  }

  // --- ready-made effects -------------------------------------------------------------------

  /** Burst of sparks (hits). */
  sparks(pos: THREE.Vector3Like, color: THREE.ColorRepresentation, count = 6, speed = 4): void {
    this.sprite({ tex: 'star_01', color, pos, life: 0.18, size: 0.9, size1: 0.3 });
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.8 + 0.2;
      this.sprite({
        tex: 'spark_01', color, pos, life: 0.25 + Math.random() * 0.15, size: 0.35, size1: 0.05,
        vel: { x: Math.cos(a) * speed, y: up * speed, z: Math.sin(a) * speed }, gravity: 12,
      });
    }
  }

  /** Grey puff (death, dust). */
  smoke(pos: THREE.Vector3Like, size = 1.2, count = 4): void {
    for (let i = 0; i < count; i++) {
      this.sprite({
        tex: 'smoke_01', color: 0x9a9aa8, pos: { x: pos.x + (Math.random() - 0.5) * 0.6, y: pos.y, z: pos.z + (Math.random() - 0.5) * 0.6 },
        life: 0.7 + Math.random() * 0.4, size: size * 0.6, size1: size * 1.4, vel: { x: 0, y: 0.8, z: 0 }, additive: false, opacity: 0.55, spin: 1,
      });
    }
  }
}
