import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Lightweight particle effects on Kenney "Particle Pack" textures (CC0, black-background
 * versions). Glow layers draw the texture additively; solid layers use its brightness as alpha
 * with a flat colour (so they stay visible over bright grass).
 * - sprites: camera-facing puffs (flash, sparks, smoke, flames)
 * - streaks: crossed quads along a direction (bullet / arrow trails)
 * - decals: flat quads on the ground or along a swing (slash, scorch, shock ring)
 */
const BASE = `${import.meta.env.BASE_URL ?? '/'}fx/`;
export type FxTexture =
  | 'muzzle_01' | 'trace_01' | 'slash_01' | 'slash_02' | 'spark_01' | 'flame_01' | 'fire_01' | 'smoke_01'
  | 'star_01' | 'magic_01' | 'circle_01' | 'scorch_01' | 'light_01' | 'twirl_01';

const textures = new Map<FxTexture, THREE.Texture>();
const loader = new THREE.TextureLoader();

function material<M extends THREE.SpriteMaterial | THREE.MeshBasicMaterial>(m: M, name: FxTexture, additive: boolean): M {
  m.transparent = true;
  m.depthWrite = false;
  if (additive) {
    m.map = texture(name);
    m.blending = THREE.AdditiveBlending;
  } else {
    m.alphaMap = texture(name);
  }
  return m;
}

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
  streak?: { from: THREE.Vector3; to: THREE.Vector3; length: number; onArrive?: () => void; glow?: THREE.Sprite; color: THREE.ColorRepresentation; width: number };
  /** Decal: scales uniformly in its own plane. */
  decal?: boolean;
  /** Geometry made for this particle (disposed with it). */
  ownsGeometry?: boolean;
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
    const mat = material(new THREE.SpriteMaterial({ color: o.color, opacity: o.opacity ?? 1 }), o.tex, o.additive !== false);
    const s = new THREE.Sprite(mat);
    s.position.set(o.pos.x, o.pos.y, o.pos.z);
    s.scale.setScalar(o.size);
    mat.rotation = Math.random() * Math.PI * 2;
    this.root.add(s);
    this.list.push({
      object: s, material: mat, age: 0, life: o.life, vel: new THREE.Vector3(o.vel?.x ?? 0, o.vel?.y ?? 0, o.vel?.z ?? 0),
      gravity: o.gravity ?? 0, size0: o.size, size1: o.size1 ?? o.size, opacity: o.opacity ?? 1, spin: o.spin ?? 0,
    });
  }

  /** A trail flying from `from` to `to` at `speed` m/s; `onArrive` fires at the end (impact puff). */
  streak(tex: FxTexture, color: THREE.ColorRepresentation, from: THREE.Vector3, to: THREE.Vector3, speed: number, length: number, width: number, onArrive?: () => void, glowSize = 0): void {
    if (this.list.length >= MAX_PARTICLES) return;
    // Solid colour (an additive streak vanishes over bright grass).
    const mat = material(new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }), tex, false);
    const m = new THREE.Mesh(this.cross, mat);
    m.position.copy(from);
    m.lookAt(to);
    m.scale.set(width, width, 0.01);
    this.root.add(m);
    const life = Math.max(0.05, from.distanceTo(to) / speed);
    // Bright head so the projectile reads at any distance.
    let glow: THREE.Sprite | undefined;
    if (glowSize > 0) {
      glow = new THREE.Sprite(material(new THREE.SpriteMaterial({ color }), 'light_01', true));
      glow.scale.setScalar(glowSize);
      glow.position.copy(from);
      this.root.add(glow);
    }
    this.list.push({
      object: m, material: mat, age: 0, life, vel: new THREE.Vector3(), gravity: 0, size0: width, size1: width, opacity: 1, spin: 0,
      streak: { from: from.clone(), to: to.clone(), length, onArrive, glow, color, width },
    });
  }

  /**
   * A flat textured quad (slash arc, scorch mark, shock ring). `yaw` turns it around the vertical;
   * `tilt` lifts it from lying flat (0) toward standing up (π/2).
   */
  decal(tex: FxTexture, color: THREE.ColorRepresentation, pos: THREE.Vector3Like, yaw: number, tilt: number, size: number, size1: number, life: number, additive = true, opacity = 1): void {
    if (this.list.length >= MAX_PARTICLES) return;
    const mat = material(new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, opacity }), tex, additive);
    const m = new THREE.Mesh(this.quad, mat);
    m.position.set(pos.x, pos.y, pos.z);
    m.rotation.set(0, yaw, 0, 'YXZ');
    m.rotateX(-Math.PI / 2 + tilt);
    m.scale.setScalar(size);
    this.root.add(m);
    this.list.push({ object: m, material: mat, age: 0, life, vel: new THREE.Vector3(), gravity: 0, size0: size, size1, opacity, spin: 0, decal: true });
  }

  /**
   * A solid swing arc (ring sector) around `pos`, facing `yaw`, opening ±`half` rad, tilted `tilt`
   * from flat. Bright at the leading edge, fading toward the trailing edge.
   */
  arc(pos: THREE.Vector3Like, yaw: number, inner: number, outer: number, half: number, tilt: number, color: THREE.ColorRepresentation, life: number, additive = false): void {
    if (this.list.length >= MAX_PARTICLES) return;
    const seg = 18;
    const geo = new THREE.RingGeometry(inner / outer, 1, seg, 1, Math.PI / 2 - half, half * 2);
    // Alpha along the swing: leading edge (one end) opaque, trailing end transparent.
    const pos3 = geo.getAttribute('position');
    const colors = new Float32Array(pos3.count * 4);
    const c = new THREE.Color(color);
    for (let i = 0; i < pos3.count; i++) {
      const ang = Math.atan2(pos3.getY(i), pos3.getX(i)) - (Math.PI / 2 - half);
      const a = Math.max(0, Math.min(1, ang / (half * 2)));
      colors.set([c.r, c.g, c.b, 0.15 + 0.85 * a * a], i * 4);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(pos.x, pos.y, pos.z);
    // Ring is in XY with +y = forward: lay it down, then turn to the swing direction.
    m.rotation.set(0, yaw, 0, 'YXZ');
    m.rotateX(-Math.PI / 2 + tilt);
    m.rotateZ(Math.PI); // +y of the ring → forward (+z after the lay-down)
    m.scale.setScalar(outer * 0.8);
    this.root.add(m);
    this.list.push({ object: m, material: mat, age: 0, life, vel: new THREE.Vector3(), gravity: 0, size0: outer * 0.8, size1: outer * 1.05, opacity: 1, spin: 0, decal: true, ownsGeometry: true });
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
        st.glow?.position.copy(head);
        // Camera-facing dots behind the head: the trail reads from every angle.
        const step = 0.35;
        const back = Math.min(len, st.length);
        for (let k = 0; k * step < back && k < 6; k++) {
          const at = head.clone().addScaledVector(dir, -k * step - Math.random() * step);
          this.sprite({ tex: 'light_01', color: st.color, pos: at, life: 0.12 + Math.random() * 0.08, size: st.width * 0.5, size1: st.width * 0.15, opacity: 0.9, additive: false });
        }
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
      if (p.streak?.glow) {
        p.streak.glow.removeFromParent();
        p.streak.glow.material.dispose();
      }
      p.object.removeFromParent();
      p.material.dispose();
      if (p.ownsGeometry) (p.object as THREE.Mesh).geometry.dispose();
      this.list.splice(i, 1);
    }
  }

  dispose(): void {
    for (const p of this.list) {
      p.object.removeFromParent();
      p.material.dispose();
      if (p.ownsGeometry) (p.object as THREE.Mesh).geometry.dispose();
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
