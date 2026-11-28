import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RARITIES, SLOT_CHARACTERS, SLOT_LOOKS, characterFor } from '@sp/shared';
import { fxTexture } from '../fx/Particles.ts';
import { SwingTrail } from '../fx/SwingTrail.ts';
import type { MaterialLibrary } from '../core/MaterialLibrary.ts';
import { PlayerModel } from './PlayerModel.ts';
import { ElementLook, type LookAnchors } from './ElementLook.ts';
import { FLIP_SECONDS, flipAngle, type CharacterBody, type Pose } from './CharacterBody.ts';

/**
 * Kenney "Mini Characters" (CC0, www.kenney.nl) — cute glTF characters with 32 animations.
 * Loaded once per page; every body is a SkeletonUtils clone sharing geometry/materials.
 * If loading fails the procedural PlayerModel is used instead.
 */

export const MINOTAUR_CHARACTER = 'character-zombie';
/** Weapon models (Kenney, same folder) held in Thủ Thành. */
export const WEAPON_MODELS = ['weapon-sword', 'weapon-spear', 'weapon-bow', 'weapon-shooter'] as const;

const BASE = `${import.meta.env.BASE_URL ?? '/'}models/kenney/`;
/** Kenney characters are ~0.67 m tall; scale them to our character size. */
const SCALE = 1.7;
const CROSSFADE = 0.15;
const ATTACK_SECONDS = 0.4;
/** Pivot height for somersaults (about the middle of the body). */
const FLIP_PIVOT = 0.55;

/** Element tattoo placement on the Kenney rig (bone-local units, before SCALE). */
const KENNEY_ANCHORS: LookAnchors = { emblem: [0, 0.11, 0.14], bandY: -0.06, orbitY: 0.58, auraY: 0.02, unit: 0.6 };

const library = new Map<string, GLTF>();
const loading = new Map<string, Promise<void>>();

/** Load the given characters (default: one per slot + the minotaur). Resolves false if any failed. */
export async function preloadCharacters(names: readonly string[] = [...SLOT_CHARACTERS, MINOTAUR_CHARACTER, ...WEAPON_MODELS]): Promise<boolean> {
  const loader = new GLTFLoader();
  const jobs = names.map((name) => {
    if (library.has(name)) return Promise.resolve();
    let job = loading.get(name);
    if (!job) {
      job = loader.loadAsync(`${BASE}${name}.glb`).then((gltf) => {
        gltf.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        library.set(name, gltf);
      });
      loading.set(name, job);
    }
    return job;
  });
  const results = await Promise.allSettled(jobs);
  return results.every((r) => r.status === 'fulfilled');
}

export function characterLoaded(name: string): boolean {
  return library.has(name);
}

/** Portrait image of a character (lobby picker / cards). */
export function characterPreview(id: string): string {
  return `${BASE}previews/${id}.png`;
}

/** Body for a player: their picked Kenney character (or the slot default) if loaded, else the procedural fallback. */
export function createCharacterBody(materials: MaterialLibrary, slot: number, picked = ''): CharacterBody {
  const name = characterFor(picked, slot);
  const gltf = library.get(name);
  if (gltf) return new KenneyBody(gltf, materials);
  const look = SLOT_LOOKS[slot] ?? SLOT_LOOKS[0]!;
  return new PlayerModel(materials, look.color, look.accessory);
}

/** A specific Kenney character (or null if it is not loaded). */
export function createNamedBody(materials: MaterialLibrary, name: string): CharacterBody | null {
  const gltf = library.get(name);
  return gltf ? new KenneyBody(gltf, materials) : null;
}

type Clip = 'idle' | 'walk' | 'sprint' | 'jump' | 'die' | 'emote-yes' | 'attack-melee-right' | 'holding-right-shoot';

/** A clone of a loaded weapon model (null if not loaded). */
export function createWeaponModel(model: string): THREE.Object3D | null {
  const gltf = library.get(model);
  return gltf ? gltf.scene.clone(true) : null;
}

/** How each weapon sits in the hand: tilt around x, size, and the model-space height of the grip. */
const WEAPON_GRIP: Record<string, { rotX: number; scale: number; gripY: number }> = {
  'weapon-sword': { rotX: 0.35, scale: 1.7, gripY: 0 },
  'weapon-spear': { rotX: Math.PI / 2 - 0.2, scale: 2, gripY: 0.25 },
  'weapon-bow': { rotX: 0, scale: 1.5, gripY: 0.24 },
  'weapon-shooter': { rotX: 0, scale: 1.6, gripY: 0.02 },
};

class KenneyBody implements CharacterBody {
  readonly group = new THREE.Group();
  readonly head: THREE.Object3D;
  readonly tagHeight = 1.55;
  private readonly inner: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<Clip, THREE.AnimationAction>();
  private readonly materials: MaterialLibrary;
  private readonly torso: THREE.Object3D;
  private readonly armL: THREE.Object3D;
  private readonly armR: THREE.Object3D;
  private look: ElementLook | null = null;
  private current: Clip | null = null;
  private pose: Pose = 'normal';
  private disposed = false;
  private readonly spin = new THREE.Group();
  private flipT = -1;
  private attackT = -1;
  private attackClip: Clip = 'attack-melee-right';
  private weapon: THREE.Object3D | null = null;
  private readonly weaponMats: THREE.Material[] = [];
  private weaponGlow: THREE.Sprite | null = null;
  private weaponTop = 0.3;
  private trail: SwingTrail | null = null;
  private readonly tmpBase = new THREE.Vector3();
  private readonly tmpTip = new THREE.Vector3();
  /** Right arm held forward (first frame of the "holding-right" clip): used while carrying a weapon. */
  private readonly armHold = new THREE.Quaternion();
  private weaponName = '';

  constructor(gltf: GLTF, materials: MaterialLibrary) {
    this.materials = materials;
    this.inner = SkeletonUtils.clone(gltf.scene);
    this.inner.scale.setScalar(SCALE);
    // group → spin (pivot mid-body, for flips) → inner (feet back at the group origin)
    this.spin.position.y = FLIP_PIVOT;
    this.inner.position.y = -FLIP_PIVOT;
    this.spin.add(this.inner);
    this.group.add(this.spin);
    this.head = this.inner.getObjectByName('head') ?? this.inner;
    this.torso = this.inner.getObjectByName('torso') ?? this.inner;
    this.armL = this.inner.getObjectByName('arm-left') ?? this.torso;
    this.armR = this.inner.getObjectByName('arm-right') ?? this.torso;
    this.mixer = new THREE.AnimationMixer(this.inner);
    const holdArm = gltf.animations.find((a) => a.name === 'holding-right')?.tracks.find((tr) => tr.name === `${this.armR.name}.quaternion`);
    if (holdArm && holdArm.values.length >= 4) this.armHold.fromArray(holdArm.values as unknown as number[], 0);
    for (const name of ['idle', 'walk', 'sprint', 'jump', 'die', 'emote-yes', 'attack-melee-right', 'holding-right-shoot'] as const) {
      const clip = gltf.animations.find((a) => a.name === name);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      if (name === 'jump' || name === 'die' || name === 'attack-melee-right' || name === 'holding-right-shoot') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(name, action);
    }
    this.play('idle');
    this.mixer.update(Math.random()); // desync idle loops between characters
  }

  animate(dt: number, horizontalSpeed: number, grounded: boolean): void {
    let clip: Clip;
    if (this.pose === 'fallen') clip = 'die';
    else if (this.pose === 'cheer') clip = 'emote-yes';
    else if (this.attackT >= 0) clip = this.attackClip;
    else if (!grounded) clip = 'jump';
    else if (horizontalSpeed > 4.8) clip = 'sprint';
    else if (horizontalSpeed > 0.4) clip = 'walk';
    else clip = 'idle';
    this.play(clip);
    const walk = this.actions.get('walk');
    if (walk && clip === 'walk') walk.timeScale = Math.max(0.6, horizontalSpeed / 3);
    this.mixer.update(dt);
    // Carrying a weapon: the right arm stays raised forward (except while swinging / shooting).
    if (this.weapon && this.attackT < 0 && this.pose === 'normal') this.armR.quaternion.copy(this.armHold);
    this.look?.update(dt);
    if (this.weaponGlow) this.weaponGlow.material.rotation += dt * 2;
    if (this.trail && this.weapon) {
      // The trail lives in world space (added to the scene root on first use).
      if (!this.trail.mesh.parent) {
        let top: THREE.Object3D = this.group;
        while (top.parent) top = top.parent;
        if (top !== this.group) top.add(this.trail.mesh);
      }
      if (this.attackT >= 0) {
        this.weapon.updateWorldMatrix(true, false);
        this.tmpBase.set(0, this.weaponTop * 0.25, 0);
        this.tmpTip.set(0, this.weaponTop * 1.1, 0);
        this.weapon.localToWorld(this.tmpBase);
        this.weapon.localToWorld(this.tmpTip);
        this.trail.push(this.tmpBase, this.tmpTip);
      } else this.trail.update(dt);
    }
    if (this.attackT >= 0) {
      this.attackT += dt;
      if (this.attackT >= ATTACK_SECONDS) this.attackT = -1;
    }
    if (this.flipT >= 0) {
      this.flipT += dt;
      this.spin.rotation.x = flipAngle(this.flipT);
      if (this.flipT >= FLIP_SECONDS) this.flipT = -1;
    }
  }

  flip(): void {
    this.flipT = 0;
  }

  setWeapon(model: string, tier = 0): void {
    const key = `${model}|${tier}`;
    if (key === this.weaponName) return;
    this.weapon?.removeFromParent();
    for (const m of this.weaponMats) m.dispose();
    this.weaponMats.length = 0;
    this.weaponGlow?.material.dispose();
    this.weaponGlow = null;
    this.trail?.dispose();
    this.trail = null;
    this.weapon = model ? createWeaponModel(model) : null;
    // Not loaded yet: keep trying on the next state update.
    this.weaponName = model && !this.weapon ? '' : key;
    if (!this.weapon) return;
    this.weaponTop = new THREE.Box3().setFromObject(this.weapon).max.y;
    this.glowWeapon(this.weapon, tier);
    // In the right fist. Kenney weapons stand up along +y; each one
    // gets its own grip: sword raised forward, spear level, bow upright, gun barrel forward.
    const g = WEAPON_GRIP[model] ?? WEAPON_GRIP['weapon-sword']!;
    // Oriented against the held-forward arm so the weapon points where the character faces.
    const q = this.armHold.clone().invert().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(g.rotX, 0, 0)));
    this.weapon.scale.setScalar(g.scale);
    this.weapon.quaternion.copy(q);
    // Kenney arms rest straight out sideways (T-pose, arm-local −x); the fist is ~0.25 from the
    // shoulder. Move the grip point (model-space y) onto the fist.
    this.weapon.position.set(-0.25, 0, 0).sub(new THREE.Vector3(0, g.gripY * g.scale, 0).applyQuaternion(q));
    this.armR.add(this.weapon);
  }

  /** Rarity glow: emissive tint + a soft halo; Truyền thuyết also leaves a golden swing trail. */
  private glowWeapon(weapon: THREE.Object3D, tier: number): void {
    if (tier <= 0) return;
    const color = new THREE.Color(RARITIES[Math.min(tier, RARITIES.length - 1)]!.color);
    const strength = [0, 0.3, 0.5, 0.85][tier] ?? 0.85;
    weapon.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((mt) => {
        const c = mt.clone() as THREE.MeshStandardMaterial;
        if (c.emissive) c.emissive.copy(color).multiplyScalar(strength);
        this.weaponMats.push(c);
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? mats : mats[0]!;
    });
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTexture('light_01'), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 + tier * 0.15 }));
    halo.scale.setScalar(0.25 + tier * 0.12);
    halo.position.y = this.weaponTop * 0.6;
    weapon.add(halo);
    this.weaponGlow = halo;
    if (tier >= 3) this.trail = new SwingTrail(0xffd23f);
  }

  attack(ranged: boolean): void {
    this.attackClip = ranged ? 'holding-right-shoot' : 'attack-melee-right';
    this.attackT = 0;
    this.current = null; // restart the clip even if it is already playing
  }

  setPose(pose: Pose): void {
    this.pose = pose;
  }

  setElement(element: string): void {
    if (!element && !this.look) return;
    this.ensureLook().set(element);
  }

  setAura(css: string): void {
    if (!css && !this.look) return;
    this.ensureLook().setAura(css ? Number.parseInt(css.slice(1), 16) : -1, this.inner);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.look?.dispose();
    this.trail?.dispose();
    for (const m of this.weaponMats) m.dispose();
    this.weaponGlow?.material.dispose();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.inner);
    this.group.removeFromParent();
    // Geometry and materials are shared with the loaded glTF: not disposed here.
  }

  private ensureLook(): ElementLook {
    this.look ??= new ElementLook(this.materials, { torso: this.torso, armL: this.armL, armR: this.armR }, KENNEY_ANCHORS);
    return this.look;
  }

  private play(clip: Clip): void {
    if (clip === this.current) return;
    const next = this.actions.get(clip);
    if (!next) return;
    for (const [name, a] of this.actions) if (name !== clip && a.isRunning()) a.fadeOut(CROSSFADE);
    next.reset().setEffectiveWeight(1).fadeIn(CROSSFADE).play();
    this.current = clip;
  }
}
