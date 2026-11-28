import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { MonsterKind } from '@sp/shared';

/**
 * Quaternius "LowPoly Animated Monsters" (CC0) loaded from FBX once per page, then cloned.
 * Models come in centimetres with different proportions, so each is scaled to a target height.
 */

const BASE = `${import.meta.env.BASE_URL ?? '/'}models/monsters/`;

const FILES: Record<MonsterKind, { file: string; height: number }> = {
  SLIME: { file: 'Slime', height: 0.9 },
  SKELETON: { file: 'Skeleton', height: 1.6 },
  BAT: { file: 'Bat', height: 0.9 },
  DRAGON: { file: 'Dragon', height: 3.6 },
};

/** Clip names inside the FBX files (suffix after "Armature|Kind_"). */
const CLIPS: Record<MonsterKind, Record<'move' | 'attack' | 'idle' | 'die' | 'breath', string>> = {
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

const library = new Map<MonsterKind, Loaded>();
let loading: Promise<void> | null = null;

export function loadMonsters(): Promise<void> {
  loading ??= (async () => {
    const loader = new FBXLoader();
    await Promise.allSettled(
      (Object.keys(FILES) as MonsterKind[]).map(async (kind) => {
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

export type MonsterAnim = 'move' | 'attack' | 'idle' | 'die' | 'breath';

/** One monster on screen: model clone, its mixer, and a simple clip switcher. */
export class MonsterModel {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<MonsterAnim, THREE.AnimationAction>();
  private current: MonsterAnim | null = null;
  private fallbackGeo: THREE.BufferGeometry | null = null;

  constructor(kind: MonsterKind, fallbackMaterial: THREE.Material) {
    const loaded = library.get(kind);
    if (!loaded) {
      // Not loaded (yet / failed): a coloured blob so the game stays playable.
      this.fallbackGeo = new THREE.SphereGeometry(FILES[kind].height / 2, 8, 6);
      const blob = new THREE.Mesh(this.fallbackGeo, fallbackMaterial);
      blob.position.y = FILES[kind].height / 2;
      this.root.add(blob);
      return;
    }
    const model = SkeletonUtils.clone(loaded.object);
    model.scale.setScalar(loaded.scale);
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const anim of ['move', 'attack', 'idle', 'die', 'breath'] as const) {
      const suffix = `_${CLIPS[kind][anim]}`;
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

  play(anim: MonsterAnim): void {
    if (anim === this.current) return;
    const next = this.actions.get(anim);
    if (!next) return;
    for (const [name, a] of this.actions) if (name !== anim && a.isRunning()) a.fadeOut(0.15);
    next.reset().fadeIn(0.15).play();
    this.current = anim;
  }

  update(dt: number): void {
    this.mixer?.update(dt);
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.fallbackGeo?.dispose();
    this.root.removeFromParent();
  }
}

export function monstersLoaded(): boolean {
  return library.size > 0;
}
