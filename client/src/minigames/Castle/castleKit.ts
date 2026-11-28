import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CASTLE_TOWER_TOP, CORNER, KEEP, KEEP_TOP, MAP, WALL_TOP, castleLowWalls, sidePoint } from '@sp/shared';

/**
 * Kenney "Castle Kit" (CC0) pieces for the Thủ Thành map. Each piece is a 1×1 tile (walls 1.31
 * high) loaded once per page and cloned. Sizes follow the collision world (walls 2.62 m with a
 * walkway, corner towers and the keep terrace at 6 m, the keep roof at 10 m).
 */
const BASE = `${import.meta.env.BASE_URL ?? '/'}models/castle/`;
const PIECES = [
  'wall', 'wall-doorway', 'wall-half', 'tower-square-base', 'tower-square-mid', 'tower-square-mid-windows',
  'tower-square-mid-door', 'tower-square-arch', 'tower-top', 'flag', 'flag-banner-long', 'tree-large', 'tree-small',
  'rocks-large', 'rocks-small', 'siege-catapult', 'siege-ballista',
] as const;
type Piece = (typeof PIECES)[number];

const library = new Map<Piece, THREE.Object3D>();
let loading: Promise<boolean> | null = null;

export function loadCastleKit(): Promise<boolean> {
  loading ??= (async () => {
    const loader = new GLTFLoader();
    const results = await Promise.allSettled(
      PIECES.map(async (name) => {
        const gltf = await loader.loadAsync(`${BASE}${name}.glb`);
        gltf.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        library.set(name, gltf.scene);
      }),
    );
    return results.every((r) => r.status === 'fulfilled');
  })();
  return loading;
}

/** Wall tile size (m). */
const TILE = 2;

function piece(name: Piece, x: number, y: number, z: number, scale: number | [number, number, number], rotY = 0): THREE.Object3D | null {
  const src = library.get(name);
  if (!src) return null;
  const o = src.clone(true);
  o.position.set(x, y, z);
  if (Array.isArray(scale)) o.scale.set(scale[0], scale[1], scale[2]);
  else o.scale.setScalar(scale);
  o.rotation.y = rotY;
  return o;
}

function hash(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Yaw that turns a wall piece to run along side `side` (N/S walls run along x). */
function wallYaw(side: number): number {
  return side % 2 === 0 ? 0 : Math.PI / 2;
}

/** Stack a square tower: base + middle up to `top`, crenellations on top. */
function tower(add: (o: THREE.Object3D | null) => void, x: number, z: number, size: number, top: number, mid: Piece = 'tower-square-mid'): void {
  const baseH = top / 2;
  add(piece('tower-square-base', x, 0, z, [size, baseH / 1.01, size]));
  add(piece(mid, x, baseH, z, [size * 0.98, (top - baseH) / 1.01, size * 0.98]));
  add(piece('tower-top', x, top, z, [size, size * 0.9, size]));
}

/**
 * The castle in the middle of the map: four walls with doorways (portcullis raised half-way),
 * corner towers, the two-tier keep with a flag, plus the monster lairs, low cover walls and trees.
 * Returns the four gates (index = side) so the view can shake / hide them as they break.
 */
export function buildCastle(): { root: THREE.Group; gates: Array<THREE.Object3D | null> } {
  const root = new THREE.Group();
  const add = (o: THREE.Object3D | null) => {
    if (o) root.add(o);
  };
  const wallR = (MAP.wallIn + MAP.wallOut) / 2;
  const gates: Array<THREE.Object3D | null> = [];
  for (let side = 0; side < 4; side++) {
    const yaw = wallYaw(side);
    // Wall tiles between the doorway and the corner towers.
    for (let l = MAP.door + TILE / 2; l < CORNER.at - CORNER.half; l += TILE) {
      for (const sign of [-1, 1]) {
        const p = sidePoint(side, wallR, sign * l);
        add(piece('wall', p.x, 0, p.z, [TILE, WALL_TOP / 1.31, MAP.wallOut - MAP.wallIn + 0.3], yaw));
      }
    }
    const d = sidePoint(side, wallR, 0);
    add(piece('wall-doorway', d.x, 0, d.z, [MAP.door * 2, WALL_TOP / 1.31, MAP.wallOut - MAP.wallIn + 0.3], yaw));
    // Open doorway: gate health shows on the HUD compass (a portcullis would block the camera).
    gates.push(null);
    // Banners on the outer face, either side of the gate.
    for (const l of [-4.5, 4.5]) {
      const b = sidePoint(side, MAP.wallOut + 0.05, l);
      add(piece('flag-banner-long', b.x, 0.3, b.z, [1, 1.1, 1], yaw + Math.PI / 2));
    }
    // Monster lair: a dark arch far out with a bit of wall.
    const lair = sidePoint(side, MAP.lairR + 2, 0);
    add(piece('tower-square-arch', lair.x, 0, lair.z, [5, 4, 3], yaw));
    for (const l of [-5, 5]) {
      const w = sidePoint(side, MAP.lairR + 2, l);
      add(piece('wall', w.x, 0, w.z, [TILE * 1.5, 1.8, TILE], yaw));
    }
  }
  // Corner towers (sun decks at 6 m) with a flag on two of them.
  let k = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * CORNER.at;
      const z = sz * CORNER.at;
      tower(add, x, z, CORNER.half * 2, CASTLE_TOWER_TOP, 'tower-square-mid-windows');
      if (k++ % 2 === 0) add(piece('flag', x, CASTLE_TOWER_TOP, z, 2.4, Math.PI / 2));
    }
  }
  // The keep: a wide terrace block (6 m) and the high block (10 m) with the castle flag.
  tower(add, 0, 0, KEEP.lowHalf * 2, CASTLE_TOWER_TOP, 'tower-square-mid-windows');
  add(piece('tower-square-mid-door', 0, CASTLE_TOWER_TOP, 0, [KEEP.highHalf * 2, (KEEP_TOP - CASTLE_TOWER_TOP) / 2 / 1.01, KEEP.highHalf * 2]));
  add(piece('tower-square-mid-windows', 0, (CASTLE_TOWER_TOP + KEEP_TOP) / 2, 0, [KEEP.highHalf * 2, (KEEP_TOP - CASTLE_TOWER_TOP) / 2 / 1.01, KEEP.highHalf * 2]));
  add(piece('tower-top', 0, KEEP_TOP, 0, [KEEP.highHalf * 2, 3, KEEP.highHalf * 2]));
  add(piece('flag', 0, KEEP_TOP, 0, 4, Math.PI / 2));
  // Low cover walls (same boxes as the collision world).
  for (const b of castleLowWalls()) {
    const alongX = b.maxX - b.minX > b.maxZ - b.minZ;
    const len = alongX ? b.maxX - b.minX : b.maxZ - b.minZ;
    for (let i = 0; i < len; i++) {
      const x = alongX ? b.minX + 0.5 + i : (b.minX + b.maxX) / 2;
      const z = alongX ? (b.minZ + b.maxZ) / 2 : b.minZ + 0.5 + i;
      add(piece('wall-half', x, 0, z, [1, b.top / 1.31, 1], alongX ? 0 : Math.PI / 2));
    }
  }
  // Siege engines on the battlefield corners (decoration).
  add(piece('siege-catapult', 30, 0, 30, 2.4, -Math.PI / 4));
  add(piece('siege-ballista', -30, 0, -30, 2.4, (Math.PI * 3) / 4));
  // Trees and rocks all around, outside the battlefield.
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2 + hash(i) * 0.08;
    const r = MAP.half + 3 + hash(i + 11) * 9;
    const kind: Piece = hash(i + 9) < 0.55 ? 'tree-large' : hash(i + 9) < 0.8 ? 'tree-small' : 'rocks-large';
    add(piece(kind, Math.cos(a) * r, 0, Math.sin(a) * r, 2 + hash(i + 3) * 1.6, hash(i + 7) * Math.PI * 2));
  }
  for (let i = 0; i < 16; i++) {
    const a = hash(i + 40) * Math.PI * 2;
    const r = 23 + hash(i + 60) * 15;
    add(piece('rocks-small', Math.cos(a) * r, 0, Math.sin(a) * r, 1.5, hash(i) * 6));
  }
  return { root, gates };
}
