import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { MonsterKind } from '@sp/shared';
import type { MaterialLibrary } from '../../core/MaterialLibrary.ts';
import type { CharacterBody } from '../../player/CharacterBody.ts';
import { MINOTAUR_CHARACTER, createNamedBody } from '../../player/characters.ts';

/**
 * Quaternius "LowPoly Animated Monsters" (CC0) loaded from FBX once per page, then cloned.
 * Models come in centimetres with different proportions, so each is scaled to a target height.
 */

const BASE = `${import.meta.env.BASE_URL ?? '/'}models/monsters/`;

type FbxKind = 'SLIME' | 'SKELETON' | 'BAT' | 'DRAGON';
const FILES: Record<FbxKind, { file: string; height: number }> = {
  SLIME: { file: 'Slime', height: 0.9 },
  SKELETON: { file: 'Skeleton', height: 1.6 },
  BAT: { file: 'Bat', height: 0.9 },
  DRAGON: { file: 'Dragon', height: 3.6 },
};
/** Bosses built from other models: Vua Slime = a giant golden slime with a crown. */
const SLIME_KING_HEIGHT = 2.8;

/** Clip names inside the FBX files (suffix after "Armature|Kind_"). */
const CLIPS: Record<FbxKind, Record<'move' | 'attack' | 'idle' | 'die' | 'breath', string>> = {
  SLIME: { move: 'Walk', attack: 'Attack', idle: 'Idle', die: 'Death', breath: 'Attack' },
  SKELETON: { move: 'Running', attack: 'Attack', idle: 'Idle', die: 'Death', breath: 'Attack' },
  BAT: { move: 'Flying', attack: 'Attack', idle: 'Flying', die: 'Death', breath: 'Attack2' },
  DRAGON: { move: 'Flying', attack: 'Attack', idle: 'Flying', die: 'Death', breath: 'Attack2' },
};

interface Loaded {
  object: THREE.Group;
  clips: THREE.AnimationClip[];
  scale: number;
}

const library = new Map<FbxKind, Loaded>();
let loading: Promise<void> | null = null;

export function loadMonsters(): Promise<void> {
  loading ??= (async () => {
    const loader = new FBXLoader();
    await Promise.allSettled(
      (Object.keys(FILES) as FbxKind[]).map(async (kind) => {
        const object = await loader.loadAsync(`${BASE}${FILES[kind].file}.fbx`);
        const box = new THREE.Box3().setFromObject(object);
        const height = Math.max(0.01, box.max.y - box.min.y);
        object.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = true;
        });
        library.set(kind, { object, clips: object.animations, scale: FILES[kind].height / height });
      }),
    );
  })();
  return loading;
}

export type MonsterAnim = 'move' | 'attack' | 'idle' | 'die' | 'breath' | 'charge';

/** One monster on screen: model clone, its mixer, and a simple clip switcher. */
export class MonsterModel {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<MonsterAnim, THREE.AnimationAction>();
  private current: MonsterAnim | null = null;
  private fallbackGeo: THREE.BufferGeometry | null = null;

  /** Minotaur: a big Kenney character (the maze's minotaur) animated through CharacterBody. */
  private body: CharacterBody | null = null;
  private bodyAnim: MonsterAnim = 'move';
  private readonly ownedMaterials: THREE.Material[] = [];

  constructor(kind: MonsterKind, fallbackMaterial: THREE.Material, materials?: MaterialLibrary) {
    if (kind === 'MINOTAUR' && materials) {
      const body = createNamedBody(materials, MINOTAUR_CHARACTER);
      if (body) {
        this.body = body;
        body.group.scale.setScalar(3);
        this.root.add(body.group);
        return;
      }
    }
    const fbx: FbxKind = kind === 'SLIME_KING' ? 'SLIME' : kind === 'MINOTAUR' ? 'SKELETON' : kind;
    const height = kind === 'SLIME_KING' ? SLIME_KING_HEIGHT : kind === 'MINOTAUR' ? 4 : FILES[fbx].height;
    const loaded = library.get(fbx);
    if (!loaded) {
      // Not loaded (yet / failed): a coloured blob so the game stays playable.
      this.fallbackGeo = new THREE.SphereGeometry(height / 2, 8, 6);
      const blob = new THREE.Mesh(this.fallbackGeo, fallbackMaterial);
      blob.position.y = height / 2;
      this.root.add(blob);
      return;
    }
    const model = SkeletonUtils.clone(loaded.object);
    model.scale.setScalar((loaded.scale * height) / FILES[fbx].height);
    this.root.add(model);
    if (kind === 'SLIME_KING') this.crown(model, height);
    this.mixer = new THREE.AnimationMixer(model);
    for (const anim of ['move', 'attack', 'idle', 'die', 'breath'] as const) {
      const suffix = `_${CLIPS[fbx][anim]}`;
      const clip = loaded.clips.find((c) => c.name.endsWith(suffix));
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      if (anim === 'die') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(anim, action);
    }
    this.play('move');
  }

  /** Golden tint + a crown for the slime king. */
  private crown(model: THREE.Object3D, height: number): void {
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((mt) => {
        const c = mt.clone() as THREE.MeshPhongMaterial;
        if (c.color) c.color.lerp(new THREE.Color(0xffc23f), 0.55);
        this.ownedMaterials.push(c);
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? mats : mats[0]!;
    });
    const gold = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x553300 });
    this.ownedMaterials.push(gold);
    this.fallbackGeo = new THREE.CylinderGeometry(0.55, 0.45, 0.45, 6, 1, true);
    const ring = new THREE.Mesh(this.fallbackGeo, gold);
    ring.position.y = height * 0.92;
    this.root.add(ring);
    const spikeGeo = new THREE.ConeGeometry(0.12, 0.4, 4);
    this.extraGeo.push(spikeGeo);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spike = new THREE.Mesh(spikeGeo, gold);
      spike.position.set(Math.cos(a) * 0.5, height * 0.92 + 0.4, Math.sin(a) * 0.5);
      this.root.add(spike);
    }
  }

  private readonly extraGeo: THREE.BufferGeometry[] = [];

  play(anim: MonsterAnim): void {
    if (this.body) {
      if (anim === 'attack' && this.bodyAnim !== 'attack') this.body.attack(false);
      if (anim === 'die') this.body.setPose('fallen');
      this.bodyAnim = anim;
      return;
    }
    if (anim === 'charge') anim = 'move';
    if (anim === this.current) return;
    const next = this.actions.get(anim);
    if (!next) return;
    for (const [name, a] of this.actions) if (name !== anim && a.isRunning()) a.fadeOut(0.15);
    next.reset().fadeIn(0.15).play();
    this.current = anim;
  }

  update(dt: number): void {
    this.mixer?.update(dt);
    if (this.body) {
      const speed = this.bodyAnim === 'charge' ? 8 : this.bodyAnim === 'move' ? 3 : 0;
      this.body.animate(dt, speed, true);
    }
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.body?.dispose();
    this.fallbackGeo?.dispose();
    for (const g of this.extraGeo) g.dispose();
    for (const mt of this.ownedMaterials) mt.dispose();
    this.root.removeFromParent();
  }
}

export function monstersLoaded(): boolean {
  return library.size > 0;
}
