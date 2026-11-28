import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CASTLE, CASTLE_LOW_WALLS } from '@sp/shared';

/**
 * Kenney "Castle Kit" (CC0) pieces for the Thủ Thành map. Each piece is a 1×1 tile (walls 1.31
 * high) loaded once per page and cloned. Built as one group that replaces the placeholder boxes.
 */
const BASE = `${import.meta.env.BASE_URL ?? '/'}models/castle/`;
const PIECES = [
  'wall', 'wall-corner', 'wall-doorway', 'wall-half', 'gate', 'tower-hexagon-base', 'tower-hexagon-mid', 'tower-hexagon-roof',
  'tower-square-base', 'tower-square-mid', 'tower-square-top-roof', 'tower-square-arch', 'flag', 'flag-banner-long',
  'tree-large', 'tree-small', 'rocks-large', 'rocks-small', 'siege-catapult', 'siege-ballista',
  'tower-square-mid-windows', 'tower-square-mid-door', 'tower-square-top-roof-high-windows', 'tower-square-top-roof-high',
  'tower-hexagon-top', 'wall-pillar', 'stairs-stone',
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
  // Portcullis raised half-way: defenders walk in and out; monsters still have to break it.
  const gate = add(piece('gate', 0, 1.7, wallZ - 0.2, [TILE * 2.2, TILE * 1.4, TILE * 3.2], Math.PI / 2));
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
  for (const sx of [-13, 13]) add(piece('flag-banner-long', sx, 0.6, wallZ - TILE / 2 - 0.05, [1.2, 1.1, 1.2], Math.PI / 2));
  buildKeep(add, wallZ);
  // Stone walls along both sides of the battlefield, up to the monster lair: the whole map is walled in.
  for (const sx of [-h - 1, h + 1]) {
    for (let z = CASTLE.spawnZ - 2; z < wallZ - TILE / 2; z += TILE) add(piece('wall', sx, 0, z, [TILE, 0.8 * TILE, TILE], Math.PI / 2));
    for (let z = CASTLE.spawnZ + 8; z < wallZ - 4; z += 12) add(piece('wall-pillar', sx, 0, z, [TILE * 1.1, TILE * 1.05, TILE * 1.1]));
  }
  // Siege engines behind the wall (defenders' side).
  add(piece('siege-catapult', -10, 0, wallZ + 5, 2.2, Math.PI));
  add(piece('siege-ballista', 10, 0, wallZ + 5, 2.2, Math.PI));
  // Courtyard low walls = the collision boxes (1 m high).
  for (const b of CASTLE_LOW_WALLS) {
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
  // Trees and rocks outside the walls.
  for (let i = 0; i < 26; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (h + 4 + hash(i) * 6);
    const z = CASTLE.spawnZ - 6 + (i / 26) * (CASTLE.gateZ - CASTLE.spawnZ + 10) + hash(i + 50) * 2;
    const kind: Piece = hash(i + 9) < 0.55 ? 'tree-large' : hash(i + 9) < 0.8 ? 'tree-small' : 'rocks-large';
    add(piece(kind, x, 0, z, 2 + hash(i + 3) * 1.5, hash(i + 7) * Math.PI * 2));
  }
  for (let i = 0; i < 8; i++) {
    add(piece('rocks-small', (hash(i + 90) * 2 - 1) * (h - 2), 0, CASTLE.spawnZ + 3 + hash(i + 70) * 30, 1.5, hash(i) * 6));
  }
  return { root, gate };
}

type Add = (o: THREE.Object3D | null) => THREE.Object3D | null;

/** Back of the castle grounds (behind the front wall). */
const YARD_DEPTH = 26;

/**
 * Behind the gate: a walled castle yard (side + back walls, hexagon towers at the corners) with a
 * four-storey keep in the middle, two side towers and a gatehouse tower row — tall enough to be
 * seen over the front wall from the battlefield.
 */
function buildKeep(add: Add, wallZ: number): void {
  const h = CASTLE.halfWidth;
  const backZ = wallZ + YARD_DEPTH;
  // Side walls and back wall of the yard.
  for (const sx of [-h, h]) {
    for (let z = wallZ + TILE; z < backZ; z += TILE) add(piece('wall', sx, 0, z, TILE, Math.PI / 2));
  }
  for (let x = -h + TILE / 2; x < h; x += TILE) add(piece('wall', x, 0, backZ, TILE));
  for (const sx of [-h, h]) {
    add(piece('tower-hexagon-base', sx, 0, backZ, TILE * 1.6));
    add(piece('tower-hexagon-mid', sx, TILE * 1.6 * 1.31, backZ, TILE * 1.6));
    add(piece('tower-hexagon-roof', sx, TILE * 1.6 * 2.3, backZ, TILE * 1.6));
  }
  // The keep: four storeys and a high roof.
  const kz = wallZ + YARD_DEPTH * 0.55;
  const K = 6;
  const storeys: Piece[] = ['tower-square-mid-door', 'tower-square-mid-windows', 'tower-square-mid', 'tower-square-mid-windows'];
  add(piece('tower-square-base', 0, 0, kz, K, Math.PI));
  storeys.forEach((name, i) => add(piece(name, 0, K * 1.01 * (i + 1), kz, [K * 0.95, K, K * 0.95], Math.PI)));
  add(piece('tower-square-top-roof-high-windows', 0, K * 1.01 * (storeys.length + 1), kz, K, Math.PI));
  add(piece('flag', 0, K * 1.01 * (storeys.length + 1) + K * 1.6, kz, K * 0.6, Math.PI / 2));
  // Two side towers (three storeys) flanking the keep, and smaller ones by the gate.
  const S = 3.6;
  for (const sx of [-8.5, 8.5]) {
    add(piece('tower-square-base', sx, 0, kz + 1, S, Math.PI));
    add(piece('tower-square-mid-windows', sx, S * 1.01, kz + 1, S, Math.PI));
    add(piece('tower-square-mid', sx, S * 2.02, kz + 1, S, Math.PI));
    add(piece('tower-square-top-roof-high', sx, S * 3.03, kz + 1, S, Math.PI));
    add(piece('flag-banner-long', sx, S * 0.4, kz + 1 - S / 2 - 0.05, [S * 0.5, S * 0.8, S * 0.5], Math.PI / 2));
  }
  for (const sx of [-5, 5]) {
    add(piece('tower-hexagon-base', sx, 0, wallZ + 6, TILE * 1.3));
    add(piece('tower-hexagon-mid', sx, TILE * 1.3 * 1.31, wallZ + 6, TILE * 1.3));
    add(piece('tower-hexagon-top', sx, TILE * 1.3 * 2.32, wallZ + 6, TILE * 1.3));
  }
  // Stairs up to the keep door.
  add(piece('stairs-stone', 0, 0, kz - K / 2 - 1, [3, 1.2, 2], Math.PI));
}
