import * as THREE from 'three';

const SAMPLES = 14;

/**
 * A ribbon following a weapon swing (Truyền thuyết weapons): each frame the weapon's base and tip
 * positions (world space) are pushed; old samples fade out. Drawn additively in world space.
 */
export class SwingTrail {
  readonly mesh: THREE.Mesh;
  private readonly positions = new Float32Array(SAMPLES * 2 * 3);
  private readonly alphas = new Float32Array(SAMPLES * 2);
  private readonly geo = new THREE.BufferGeometry();
  private readonly mat: THREE.ShaderMaterial;
  private count = 0;
  private fade = 0;

  constructor(color: THREE.ColorRepresentation) {
    const index: number[] = [];
    for (let i = 0; i < SAMPLES - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(index);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) } },
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 color; varying float vA; void main(){ gl_FragColor = vec4(color * 1.6, vA); }',
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Add a sample while swinging. */
  push(base: THREE.Vector3, tip: THREE.Vector3): void {
    // Shift everything back by one sample.
    this.positions.copyWithin(6, 0, (SAMPLES - 1) * 6);
    this.positions.set([base.x, base.y, base.z, tip.x, tip.y, tip.z], 0);
    this.count = Math.min(SAMPLES, this.count + 1);
    this.fade = 1;
    this.refresh();
  }

  /** Let the ribbon fade when not swinging. */
  update(dt: number): void {
    if (this.count === 0) return;
    this.fade = Math.max(0, this.fade - dt * 4);
    if (this.fade === 0) this.count = 0;
    this.refresh();
  }

  private refresh(): void {
    for (let i = 0; i < SAMPLES; i++) {
      const a = i < this.count ? (1 - i / SAMPLES) * this.fade : 0;
      this.alphas[i * 2] = a * 0.35;
      this.alphas[i * 2 + 1] = a;
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('alpha') as THREE.BufferAttribute).needsUpdate = true;
    this.mesh.visible = this.count > 1;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
