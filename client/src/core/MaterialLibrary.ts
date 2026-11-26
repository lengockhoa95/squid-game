import * as THREE from 'three';

/** Shared materials keyed by type + color, so meshes of the same color share one material. */
export class MaterialLibrary {
  private readonly cache = new Map<string, THREE.Material>();

  lambert(color: number): THREE.MeshLambertMaterial {
    const key = `l:${color}`;
    let m = this.cache.get(key) as THREE.MeshLambertMaterial | undefined;
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, flatShading: true });
      this.cache.set(key, m);
    }
    return m;
  }

  basic(color: number, opacity = 1): THREE.MeshBasicMaterial {
    const key = `b:${color}:${opacity}`;
    let m = this.cache.get(key) as THREE.MeshBasicMaterial | undefined;
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
      this.cache.set(key, m);
    }
    return m;
  }

  get size(): number {
    return this.cache.size;
  }

  disposeAll(): void {
    for (const m of this.cache.values()) m.dispose();
    this.cache.clear();
  }
}
