import * as THREE from 'three';
import {
  BELTS, CASTLE, MOAT, PADS, PAD, PIT, PIT_CRACKING, PIT_GONE, PIT_TILE_COUNT, pitTileBox, stairBoxes,
} from '@sp/shared';
import type { CastleState } from '@sp/shared/schema';
import type { MaterialLibrary } from '../../core/MaterialLibrary.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';
import { placeBox } from '../framework/stage.ts';

interface SharkMesh {
  root: THREE.Group;
  tail: THREE.Group;
}

function arrowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a3f4a';
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#2c3038';
  for (let y = 0; y < 128; y += 16) g.fillRect(0, y, 64, 3);
  g.fillStyle = '#ffd23f';
  // Chevron pointing to −v (texture "up" = −z on the belt).
  for (const y0 of [20, 84]) {
    g.beginPath();
    g.moveTo(32, y0);
    g.lineTo(54, y0 + 22);
    g.lineTo(44, y0 + 22);
    g.lineTo(32, y0 + 10);
    g.lineTo(20, y0 + 22);
    g.lineTo(10, y0 + 22);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Hazards reused from other games, drawn for Thủ Thành: the moat with sharks (Vượt Biển Cá Mập),
 * collapsing tiles (Sàn Sụp), conveyor belts and jump pads (Parkour), plus the stairs up the wall.
 */
export class CastleHazardsView {
  private readonly root = new THREE.Group();
  private readonly sharks: SharkMesh[] = [];
  private readonly tiles: THREE.Mesh[] = [];
  private readonly tileMat: THREE.MeshLambertMaterial;
  private readonly crackMat: THREE.MeshLambertMaterial;
  private readonly belts: Array<{ tex: THREE.Texture; speed: number; len: number }> = [];
  private readonly pads: THREE.Mesh[] = [];
  private readonly water: THREE.MeshLambertMaterial;
  private readonly materials: MaterialLibrary;
  private readonly res: ResourceTracker;
  private time = 0;

  constructor(parent: THREE.Object3D, materials: MaterialLibrary, res: ResourceTracker) {
    this.materials = materials;
    this.res = res;
    parent.add(this.root);
    const unit = res.track(new THREE.BoxGeometry(1, 1, 1));
    const h = CASTLE.halfWidth;
    // Moat: water between muddy banks, two wooden bridges.
    this.water = res.track(new THREE.MeshLambertMaterial({ color: 0x2f86c8, transparent: true, opacity: 0.88 }));
    const water = new THREE.Mesh(res.track(new THREE.PlaneGeometry(h * 2 + 2, MOAT.maxZ - MOAT.minZ).rotateX(-Math.PI / 2)), this.water);
    water.position.set(0, 0.05, (MOAT.minZ + MOAT.maxZ) / 2);
    this.root.add(water);
    const bank = materials.lambert(0x7a5a3a);
    for (const z of [MOAT.minZ, MOAT.maxZ]) this.root.add(placeBox(new THREE.Mesh(unit, bank), -h - 1, h + 1, z - 0.25, z + 0.25, 0, 0.12));
    const wood = materials.lambert(0x9b6a3c);
    const plankDark = materials.lambert(0x7a4f2a);
    for (const [a, b] of MOAT.bridges) {
      this.root.add(placeBox(new THREE.Mesh(unit, wood), a, b, MOAT.minZ - 0.4, MOAT.maxZ + 0.4, 0, 0.16));
      for (const x of [a, b]) this.root.add(placeBox(new THREE.Mesh(unit, plankDark), x - 0.12, x + 0.12, MOAT.minZ - 0.4, MOAT.maxZ + 0.4, 0, 0.7));
    }
    // Pit: an abyss under removable tiles.
    const pitMaxZ = PIT.minZ + PIT.rows * PIT.tile;
    const abyss = new THREE.Mesh(res.track(new THREE.PlaneGeometry(h * 2, pitMaxZ - PIT.minZ).rotateX(-Math.PI / 2)), materials.lambert(0x120d18));
    abyss.position.set(0, -6, (PIT.minZ + pitMaxZ) / 2);
    this.root.add(abyss);
    const rock = materials.lambert(0x4a3f3a);
    for (const z of [PIT.minZ, pitMaxZ]) this.root.add(placeBox(new THREE.Mesh(unit, rock), -h, h, z - 0.1, z + 0.1, -6, 0));
    for (const x of [-h, h]) this.root.add(placeBox(new THREE.Mesh(unit, rock), x - 0.1, x + 0.1, PIT.minZ, pitMaxZ, -6, 0));
    this.tileMat = res.track(new THREE.MeshLambertMaterial({ color: 0x8f7050 }));
    this.crackMat = res.track(new THREE.MeshLambertMaterial({ color: 0xc0573a, emissive: 0x401000 }));
    for (let i = 0; i < PIT_TILE_COUNT; i++) {
      const b = pitTileBox(i);
      const tile = placeBox(new THREE.Mesh(unit, this.tileMat), b.minX + 0.06, b.maxX - 0.06, b.minZ + 0.06, b.maxZ - 0.06, -0.6, 0.02);
      tile.receiveShadow = true;
      this.tiles.push(tile);
      this.root.add(tile);
    }
    // Belts with scrolling chevrons.
    for (const belt of BELTS) {
      const tex = res.track(arrowTexture());
      const len = belt.maxZ - belt.minZ;
      tex.repeat.set(1, len / 3);
      if (belt.speed > 0) tex.rotation = Math.PI; // chevrons point the way the belt moves
      tex.center.set(0.5, 0.5);
      const mesh = new THREE.Mesh(res.track(new THREE.PlaneGeometry(belt.maxX - belt.minX, len).rotateX(-Math.PI / 2)), res.track(new THREE.MeshLambertMaterial({ map: tex })));
      mesh.position.set((belt.minX + belt.maxX) / 2, 0.07, (belt.minZ + belt.maxZ) / 2);
      mesh.receiveShadow = true;
      this.root.add(mesh);
      this.belts.push({ tex, speed: belt.speed, len });
    }
    // Jump pads.
    const padTop = res.track(new THREE.MeshLambertMaterial({ color: 0xff8a2f, emissive: 0x662200 }));
    const padGeo = res.track(new THREE.CylinderGeometry(PAD.half, PAD.half + 0.15, 0.2, 16));
    for (const p of PADS) {
      const pad = new THREE.Mesh(padGeo, padTop);
      pad.position.set(p.x, 0.1, p.z);
      this.root.add(pad);
      this.pads.push(pad);
    }
    // Stone stairs up to the wall walkway.
    const stone = materials.lambert(0xc9a27e);
    for (const b of stairBoxes()) {
      const step = placeBox(new THREE.Mesh(unit, stone), b.minX, b.maxX, b.minZ, b.maxZ, 0, b.top);
      step.castShadow = step.receiveShadow = true;
      this.root.add(step);
    }
  }

  update(dt: number, castle: CastleState): void {
    this.time += dt;
    this.water.color.setHSL(0.57, 0.62, 0.48 + Math.sin(this.time * 1.5) * 0.03);
    for (const b of this.belts) b.tex.offset.y -= (Math.abs(b.speed) * dt) / 3;
    for (const p of this.pads) p.scale.y = 1 + Math.sin(this.time * 6) * 0.25;
    // Tiles: crack (red, shaking), then vanish.
    castle.tiles.forEach((st, i) => {
      const tile = this.tiles[i];
      if (!tile) return;
      tile.visible = st !== PIT_GONE;
      tile.material = st === PIT_CRACKING ? this.crackMat : this.tileMat;
      const home = pitTileBox(i);
      tile.position.x = (home.minX + home.maxX) / 2 + (st === PIT_CRACKING ? Math.sin(this.time * 50 + i) * 0.06 : 0);
    });
    // Sharks under the surface, fin out.
    castle.sharks.forEach((f, i) => {
      let sh = this.sharks[i];
      if (!sh) {
        sh = this.makeShark();
        this.sharks.push(sh);
      }
      sh.root.position.set(f.x, f.lunge ? -0.1 : -0.35, f.z);
      sh.root.rotation.y = f.yaw;
      sh.tail.rotation.y = Math.sin(this.time * (f.lunge ? 18 : 8) + i) * 0.5;
    });
  }

  dispose(): void {
    this.root.removeFromParent();
  }

  /** Low-poly shark (same look as Vượt Biển Cá Mập). */
  private makeShark(): SharkMesh {
    const m = this.materials;
    const res = this.res;
    const root = new THREE.Group();
    const body = new THREE.Mesh(res.track(new THREE.SphereGeometry(0.55, 8, 6).scale(0.8, 0.6, 2.2)), m.lambert(0x6f7f8f));
    const belly = new THREE.Mesh(res.track(new THREE.SphereGeometry(0.5, 8, 6).scale(0.75, 0.4, 2)), m.lambert(0xe8edf2));
    belly.position.y = -0.12;
    const fin = new THREE.Mesh(res.track(new THREE.ConeGeometry(0.35, 0.9, 4).scale(0.35, 1, 1)), m.lambert(0x55626f));
    fin.position.set(0, 0.62, -0.1);
    fin.rotation.x = -0.35;
    const tailPivot = new THREE.Group();
    tailPivot.position.z = -1.2;
    const tail = new THREE.Mesh(res.track(new THREE.ConeGeometry(0.5, 0.9, 4).scale(0.25, 1, 1)), m.lambert(0x6f7f8f));
    tail.rotation.x = Math.PI / 2;
    tail.position.z = -0.35;
    tailPivot.add(tail);
    root.add(body, belly, fin, tailPivot);
    this.root.add(root);
    return { root, tail: tailPivot };
  }
}
