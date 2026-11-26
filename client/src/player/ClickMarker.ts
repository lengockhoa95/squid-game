import * as THREE from 'three';
import type { ResourceTracker } from '../core/ResourceTracker.ts';

/** Single reusable ring showing the click-to-move destination. */
export class ClickMarker {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private pulse = 0;

  constructor(resources: ResourceTracker) {
    const geo = resources.track(new THREE.RingGeometry(0.28, 0.42, 20));
    geo.rotateX(-Math.PI / 2);
    this.material = resources.track(new THREE.MeshBasicMaterial({ color: 0x3df5c8, transparent: true, depthWrite: false }));
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
  }

  show(x: number, y: number, z: number): void {
    this.mesh.position.set(x, y + 0.03, z);
    this.mesh.visible = true;
    this.pulse = 1;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  update(dt: number): void {
    if (!this.mesh.visible) return;
    this.pulse = Math.max(0, this.pulse - dt * 3);
    const s = 1 + this.pulse * 0.8;
    this.mesh.scale.set(s, 1, s);
    this.material.opacity = 0.55 + 0.45 * (1 - this.pulse);
  }
}
