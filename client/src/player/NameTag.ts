import * as THREE from 'three';

const WIDTH = 256;
const HEIGHT = 64;

/**
 * Floating nickname above a character: a sprite with a small canvas texture (drawn once).
 * Always drawn on top so players can be told apart in crowds and mazes.
 */
export class NameTag {
  readonly sprite: THREE.Sprite;
  private readonly texture: THREE.CanvasTexture;
  private readonly material: THREE.SpriteMaterial;

  constructor(name: string, color: number) {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const g = canvas.getContext('2d')!;
    g.font = '600 30px system-ui, "Segoe UI", Roboto, sans-serif';
    const text = name.length > 16 ? `${name.slice(0, 15)}…` : name;
    const w = Math.min(WIDTH - 8, g.measureText(text).width + 36);
    const x = (WIDTH - w) / 2;
    g.fillStyle = 'rgba(13, 15, 26, 0.72)';
    g.beginPath();
    g.roundRect(x, 10, w, 44, 22);
    g.fill();
    g.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, WIDTH / 2, 33);
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.scale.set(2.4, 0.6, 1);
    this.sprite.renderOrder = 10;
  }

  /** Attach above a model's group (in its local, scaled space). */
  attach(parent: THREE.Object3D, height = 2.55): void {
    this.sprite.position.set(0, height, 0);
    parent.add(this.sprite);
  }

  dispose(): void {
    this.sprite.removeFromParent();
    this.material.dispose();
    this.texture.dispose();
  }
}
