import * as THREE from 'three';
import {
  MOAT, PAD, PIT, PIT_CRACKING, PIT_GONE, PIT_TILE_COUNT, castleStairs, padPoint, pitTileBox, sideBox,
} from '@sp/shared';
import type { CastleState } from '@sp/shared/schema';
import type { MaterialLibrary } from '../../core/MaterialLibrary.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';
import { placeBox } from '../framework/stage.ts';

interface SharkMesh {
  root: THREE.Group;
  tail: THREE.Group;
}

/**
 * Hazards reused from other games, drawn for Thủ Thành: the moat ring with sharks (Vượt Biển Cá
 * Mập), collapsing tiles in front of each lair (Sàn Sụp), jump pads (Parkour), and the stairs up
 * the walls, the corner towers and the keep.
 */
export class CastleHazardsView {
  private readonly root = new THREE.Group();
  private readonly sharks: SharkMesh[] = [];
  private readonly tiles: THREE.Mesh[] = [];
  private readonly tileMat: THREE.MeshLambertMaterial;
  private readonly crackMat: THREE.MeshLambertMaterial;
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
    // Moat ring: four water strips (corners overlap), muddy banks, a wooden bridge per side.
    this.water = res.track(new THREE.MeshLambertMaterial({ color: 0x2f86c8, transparent: true, opacity: 0.88 }));
    const bank = materials.lambert(0x7a5a3a);
    const wood = materials.lambert(0x9b6a3c);
    const rail = materials.lambert(0x7a4f2a);
    for (let side = 0; side < 4; side++) {
      const strip = sideBox(side, MOAT.rIn, MOAT.rOut, -MOAT.rOut, MOAT.rOut, 0);
      const w = new THREE.Mesh(res.track(new THREE.PlaneGeometry(strip.maxX - strip.minX, strip.maxZ - strip.minZ).rotateX(-Math.PI / 2)), this.water);
      w.position.set((strip.minX + strip.maxX) / 2, 0.05, (strip.minZ + strip.maxZ) / 2);
      this.root.add(w);
      for (const r of [MOAT.rIn, MOAT.rOut]) {
        const b = sideBox(side, r - 0.25, r + 0.25, -r, r, 0.12);
        this.root.add(placeBox(new THREE.Mesh(unit, bank), b.minX, b.maxX, b.minZ, b.maxZ, 0, 0.12));
      }
      const deck = sideBox(side, MOAT.rIn - 0.4, MOAT.rOut + 0.4, -MOAT.bridge, MOAT.bridge, 0.16);
      this.root.add(placeBox(new THREE.Mesh(unit, wood), deck.minX, deck.maxX, deck.minZ, deck.maxZ, 0, 0.16));
      for (const l of [-MOAT.bridge, MOAT.bridge]) {
        const rb = sideBox(side, MOAT.rIn - 0.4, MOAT.rOut + 0.4, l - 0.12, l + 0.12, 0.7);
        this.root.add(placeBox(new THREE.Mesh(unit, rail), rb.minX, rb.maxX, rb.minZ, rb.maxZ, 0, 0.7));
      }
      // Pit band: an abyss under removable tiles, rock walls around it.
      const band = sideBox(side, PIT.rIn, PIT.rIn + PIT.rows * PIT.tile, -(PIT.cols * PIT.tile) / 2, (PIT.cols * PIT.tile) / 2, 0);
      const abyss = new THREE.Mesh(res.track(new THREE.PlaneGeometry(band.maxX - band.minX, band.maxZ - band.minZ).rotateX(-Math.PI / 2)), materials.lambert(0x120d18));
      abyss.position.set((band.minX + band.maxX) / 2, -6, (band.minZ + band.maxZ) / 2);
      this.root.add(abyss);
      const rock = materials.lambert(0x4a3f3a);
      this.root.add(placeBox(new THREE.Mesh(unit, rock), band.minX - 0.1, band.minX, band.minZ, band.maxZ, -6, 0));
      this.root.add(placeBox(new THREE.Mesh(unit, rock), band.maxX, band.maxX + 0.1, band.minZ, band.maxZ, -6, 0));
      this.root.add(placeBox(new THREE.Mesh(unit, rock), band.minX, band.maxX, band.minZ - 0.1, band.minZ, -6, 0));
      this.root.add(placeBox(new THREE.Mesh(unit, rock), band.minX, band.maxX, band.maxZ, band.maxZ + 0.1, -6, 0));
    }
    this.tileMat = res.track(new THREE.MeshLambertMaterial({ color: 0x8f7050 }));
    this.crackMat = res.track(new THREE.MeshLambertMaterial({ color: 0xc0573a, emissive: 0x401000 }));
    for (let i = 0; i < PIT_TILE_COUNT; i++) {
      const b = pitTileBox(i);
      const tile = placeBox(new THREE.Mesh(unit, this.tileMat), b.minX + 0.06, b.maxX - 0.06, b.minZ + 0.06, b.maxZ - 0.06, -0.6, 0.02);
      tile.receiveShadow = true;
      this.tiles.push(tile);
      this.root.add(tile);
    }
    // Jump pads (one per side, just outside the wall).
    const padTop = res.track(new THREE.MeshLambertMaterial({ color: 0xff8a2f, emissive: 0x662200 }));
    const padGeo = res.track(new THREE.CylinderGeometry(PAD.half, PAD.half + 0.15, 0.2, 16));
    for (let side = 0; side < 4; side++) {
      const p = padPoint(side);
      const pad = new THREE.Mesh(padGeo, padTop);
      pad.position.set(p.x, 0.1, p.z);
      this.root.add(pad);
      this.pads.push(pad);
    }
    // Stone stairs (walls, corner towers, keep).
    const stone = materials.lambert(0xc9a27e);
    for (const b of castleStairs()) {
      const step = placeBox(new THREE.Mesh(unit, stone), b.minX, b.maxX, b.minZ, b.maxZ, b.top - 0.34, b.top);
      step.castShadow = step.receiveShadow = true;
      this.root.add(step);
    }
  }

  update(dt: number, castle: CastleState): void {
    this.time += dt;
    this.water.color.setHSL(0.57, 0.62, 0.48 + Math.sin(this.time * 1.5) * 0.03);
    for (const p of this.pads) p.scale.y = 1 + Math.sin(this.time * 6) * 0.25;
    castle.tiles.forEach((st, i) => {
      const tile = this.tiles[i];
      if (!tile) return;
      tile.visible = st !== PIT_GONE;
      tile.material = st === PIT_CRACKING ? this.crackMat : this.tileMat;
      const home = pitTileBox(i);
      tile.position.x = (home.minX + home.maxX) / 2 + (st === PIT_CRACKING ? Math.sin(this.time * 50 + i) * 0.06 : 0);
    });
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
