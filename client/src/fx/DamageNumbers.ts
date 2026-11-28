import * as THREE from 'three';

interface Floater {
  sprite: THREE.Sprite;
  age: number;
  life: number;
  vx: number;
  vz: number;
  size: number;
}

const MAX_CACHE = 80;
const MAX_LIVE = 60;

/**
 * Floating damage numbers: white for normal hits, big yellow with "!" for criticals. Textures are
 * canvas text, cached per label; sprites rise, pop and fade.
 */
export class DamageNumbers {
  readonly root = new THREE.Group();
  private readonly cache = new Map<string, THREE.CanvasTexture>();
  private readonly live: Floater[] = [];

  show(x: number, y: number, z: number, amount: number, crit: boolean): void {
    if (amount < 0.5) return;
    const text = `${Math.round(amount)}${crit ? '!' : ''}`;
    const key = `${text}|${crit ? 1 : 0}`;
    let tex = this.cache.get(key);
    if (!tex) {
      tex = this.makeTexture(text, crit);
      if (this.cache.size >= MAX_CACHE) {
        const [oldKey, old] = this.cache.entries().next().value as [string, THREE.CanvasTexture];
        old.dispose();
        this.cache.delete(oldKey);
      }
      this.cache.set(key, tex);
    }
    if (this.live.length >= MAX_LIVE) this.remove(0);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    sprite.renderOrder = 20;
    sprite.position.set(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6);
    const size = crit ? 1.6 : 0.95;
    sprite.scale.set(size * 2, size, 1);
    this.root.add(sprite);
    const a = Math.random() * Math.PI * 2;
    this.live.push({ sprite, age: 0, life: crit ? 1.1 : 0.8, vx: Math.cos(a) * 0.6, vz: Math.sin(a) * 0.6, size });
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const f = this.live[i]!;
      f.age += dt;
      const k = f.age / f.life;
      if (k >= 1) {
        this.remove(i);
        continue;
      }
      f.sprite.position.x += f.vx * dt;
      f.sprite.position.z += f.vz * dt;
      f.sprite.position.y += (2.2 - k * 1.8) * dt;
      // Pop in, then shrink a little while fading out.
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.6 : 1.2 - (k - 0.12) * 0.3;
      f.sprite.scale.set(f.size * 2 * pop, f.size * pop, 1);
      f.sprite.material.opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
    }
  }

  dispose(): void {
    while (this.live.length) this.remove(this.live.length - 1);
    for (const t of this.cache.values()) t.dispose();
    this.cache.clear();
    this.root.removeFromParent();
  }

  private remove(i: number): void {
    const f = this.live[i]!;
    f.sprite.removeFromParent();
    f.sprite.material.dispose();
    this.live.splice(i, 1);
  }

  private makeTexture(text: string, crit: boolean): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.font = `900 ${crit ? 92 : 78}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 14;
    g.strokeStyle = crit ? '#7a2a00' : '#1a1a24';
    g.strokeText(text, 128, 66);
    g.fillStyle = crit ? '#ffd23f' : '#ffffff';
    g.fillText(text, 128, 66);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
}
