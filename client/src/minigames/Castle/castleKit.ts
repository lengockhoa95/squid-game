import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CASTLE, createCastleWorld } from '@sp/shared';

/**
 * Kenney "Castle Kit" (CC0) pieces for the Thủ Thành map. Each piece is a 1×1 tile (walls 1.31
 * high) loaded once per page and cloned. Built as one group that replaces the placeholder boxes.
 */
const BASE = `${import.meta.env.BASE_URL ?? '/'}models/castle/`;
const PIECES = [
  'wall', 'wall-corner', 'wall-doorway', 'wall-half', 'gate', 'tower-hexagon-base', 'tower-hexagon-mid', 'tower-hexagon-roof',
  'tower-square-base', 'tower-square-mid', 'tower-square-top-roof', 'tower-square-arch', 'flag', 'flag-banner-long',
  'tree-large', 'tree-small', 'rocks-large', 'rocks-small', 'siege-catapult', 'siege-ballista',
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

/** Wall tile size (m) on the map. */
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

/** Deterministic pseudo-random for decoration placement. */
function hash(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * The castle: crenellated wall with a doorway + wooden gate in the middle, square towers beside the
 * gate, hexagon towers at the corners, catapults behind the wall, low courtyard walls (same as the
 * collision world), the monster lair at the far end and trees/rocks around.
 */
export function buildCastle(): { root: THREE.Group; gate: THREE.Object3D | null } {
  const root = new THREE.Group();
  const add = (o: THREE.Object3D | null) => {
    if (o) root.add(o);
    return o;
  };
  const h = CASTLE.halfWidth;
  const wallZ = CASTLE.gateZ + 1.25;
  // Wall line (players look at it from the courtyard side, −z).
  for (let x = -h + TILE / 2; x < h; x += TILE) {
    if (Math.abs(x) < TILE) continue; // doorway slot
    if (Math.abs(Math.abs(x) - 3) < 0.5) continue; // gate towers
    add(piece('wall', x, 0, wallZ, TILE, Math.PI));
  }
  add(piece('wall-doorway', 0, 0, wallZ, [TILE * 2.2, TILE, TILE], Math.PI));
  const gate = add(piece('gate', 0, 0, wallZ - 0.2, [TILE * 2.2, TILE * 1.4, TILE * 3.2], Math.PI / 2));
  for (const sx of [-3, 3]) {
    add(piece('tower-square-base', sx, 0, wallZ, TILE));
    add(piece('tower-square-mid', sx, TILE * 1.01, wallZ, TILE));
    add(piece('tower-square-top-roof', sx, TILE * 2.02, wallZ, TILE));
    add(piece('flag', sx, TILE * 3, wallZ, TILE, Math.PI / 2));
  }
  for (const sx of [-h, h]) {
    add(piece('tower-hexagon-base', sx, 0, wallZ, TILE * 1.6));
    add(piece('tower-hexagon-mid', sx, TILE * 1.6 * 1.31, wallZ, TILE * 1.6));
    add(piece('tower-hexagon-roof', sx, TILE * 1.6 * 2.3, wallZ, TILE * 1.6));
  }
  for (const sx of [-9, 9]) add(piece('flag-banner-long', sx, 0.2, wallZ - TILE / 2 - 0.05, [TILE, TILE * 0.9, TILE], Math.PI / 2));
  // Siege engines behind the wall (defenders' side).
  add(piece('siege-catapult', -8, 0, wallZ + 5, 2.2, Math.PI));
  add(piece('siege-ballista', 8, 0, wallZ + 5, 2.2, Math.PI));
  // Courtyard low walls = the collision boxes (1 m high).
  for (const b of createCastleWorld().boxes.slice(1)) {
    for (let x = b.minX + 0.5; x < b.maxX; x += 1) {
      add(piece('wall-half', x, 0, (b.minZ + b.maxZ) / 2, [1, b.top / 1.31, b.maxZ - b.minZ]));
    }
  }
  // Monster lair: an arch with walls at the far end.
  const lairZ = CASTLE.spawnZ - 2.5;
  add(piece('tower-square-arch', 0, 0, lairZ, [TILE * 2.5, TILE * 2, TILE * 1.5]));
  for (let x = -7; x <= 7; x += TILE) {
    if (Math.abs(x) < 3) continue;
    add(piece('wall', x, 0, lairZ, TILE));
  }
  // Trees and rocks outside the playfield.
  for (let i = 0; i < 26; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (h + 2.5 + hash(i) * 6);
    const z = CASTLE.spawnZ - 6 + (i / 26) * (CASTLE.gateZ - CASTLE.spawnZ + 10) + hash(i + 50) * 2;
    const kind: Piece = hash(i + 9) < 0.55 ? 'tree-large' : hash(i + 9) < 0.8 ? 'tree-small' : 'rocks-large';
    add(piece(kind, x, 0, z, 2 + hash(i + 3) * 1.5, hash(i + 7) * Math.PI * 2));
  }
  for (let i = 0; i < 8; i++) {
    add(piece('rocks-small', (hash(i + 90) * 2 - 1) * (h - 2), 0, CASTLE.spawnZ + 3 + hash(i + 70) * 30, 1.5, hash(i) * 6));
  }
  return { root, gate };
}
