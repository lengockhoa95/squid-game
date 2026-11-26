import * as THREE from 'three';
import type { QualityPreset } from '@sp/shared';

/** Common lighting rig for minigame stages: hemisphere fill + one shadow-casting sun that follows the focus. */
export class StageLights {
  private readonly sun: THREE.DirectionalLight;

  constructor(root: THREE.Object3D, range = 20, sky = 0xdff3ff, ground = 0x6b5a7a) {
    root.add(new THREE.HemisphereLight(sky, ground, 1.8));
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    const cam = this.sun.shadow.camera;
    cam.left = -range;
    cam.right = range;
    cam.top = range;
    cam.bottom = -range;
    cam.near = 1;
    cam.far = 90;
    this.sun.shadow.bias = -0.0005;
    root.add(this.sun, this.sun.target);
  }

  follow(focus: Readonly<THREE.Vector3>): void {
    this.sun.position.set(focus.x + 12, focus.y + 24, focus.z + 8);
    this.sun.target.position.copy(focus);
  }

  applyQuality(p: QualityPreset): void {
    this.sun.castShadow = p.shadows;
    if (p.shadows && this.sun.shadow.mapSize.x !== p.shadowMapSize) {
      this.sun.shadow.mapSize.set(p.shadowMapSize, p.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  dispose(): void {
    this.sun.shadow.map?.dispose();
    this.sun.dispose();
  }
}

export function setSky(scene: THREE.Scene, color: number, fogNear = 40, fogFar = 120): void {
  scene.background = new THREE.Color(color);
  scene.fog = new THREE.Fog(color, fogNear, fogFar);
}

/** Flat box helper: unit geometry scaled, sitting with its top at `top`. */
export function placeBox(
  mesh: THREE.Mesh,
  minX: number, maxX: number, minZ: number, maxZ: number, bottom: number, top: number,
): THREE.Mesh {
  mesh.scale.set(maxX - minX, top - bottom, maxZ - minZ);
  mesh.position.set((minX + maxX) / 2, (top + bottom) / 2, (minZ + maxZ) / 2);
  return mesh;
}
