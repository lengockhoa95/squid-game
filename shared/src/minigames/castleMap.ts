import type { StepFn } from '../sim/step.ts';
import { stepCharacter, type Box, type CharacterState, type SimWorld } from '../sim/kinematics.ts';

/**
 * Thủ Thành map ("bao vây 4 phía"): the castle stands in the middle with a gate on each side
 * (Bắc/Đông/Nam/Tây). Monsters come from four lairs; the moat rings the castle with one bridge per
 * side; collapsing floor lies in front of each lair. The castle has three walkable levels:
 * the wall walkway (2.6 m), the corner tower tops and the keep terrace (6 m), and the keep roof (12 m).
 *
 * Side frames: for side i, `r` is the distance outward from the centre along the side's direction
 * and `l` the lateral offset along the wall.
 */
export const SIDES = ['N', 'E', 'S', 'W'] as const;
export type Side = (typeof SIDES)[number];
export const SIDE_NAMES: Readonly<Record<Side, string>> = { N: 'Bắc', E: 'Đông', S: 'Nam', W: 'Tây' };
const DIRS: ReadonlyArray<{ x: number; z: number }> = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
];

export const MAP = {
  /** Battlefield bounds (±). */
  half: 44,
  /** Wall: inner face at r = wallIn, outer face at r = wallOut. */
  wallIn: 12,
  wallOut: 13.5,
  /** Doorway half-width (players walk through; monsters must break the gate). */
  door: 2.2,
  /** Lairs (monster spawns) at this distance. */
  lairR: 40,
  lairSpread: 9,
} as const;

/** Walkable top of the wall (matches the Castle Kit wall height). */
export const WALL_TOP = 2.62;
/** Corner tower tops and the keep's first terrace. */
export const CASTLE_TOWER_TOP = 6;
/** Keep roof. */
export const KEEP_TOP = 10;
/** Corner towers: centred on the wall corners. */
export const CORNER = { at: 12.75, half: 2 } as const;
/** Keep: lower block (terrace at CASTLE_TOWER_TOP) and upper block (roof at KEEP_TOP). */
export const KEEP = { lowHalf: 5, highHalf: 3 } as const;

/** Hào nước: a ring around the castle (like Vượt Biển Cá Mập), one bridge per side. */
export const MOAT = { rIn: 17, rOut: 21, bridge: 2.5, slow: 0.5, sharkSpeed: 3.5, lungeSpeed: 7, biteRadius: 1.1, biteCooldown: 2.5 } as const;
/** Sàn sụp in front of each lair (like Sàn Sụp). */
export const PIT = { rIn: 27, rows: 2, cols: 8, tile: 3, crackSeconds: 1.2, goneSeconds: 6, every: 1.4, maxGone: 10 } as const;
export const PIT_TILES_PER_SIDE = PIT.rows * PIT.cols;
export const PIT_TILE_COUNT = PIT_TILES_PER_SIDE * 4;
export const PIT_SOLID = 0;
export const PIT_CRACKING = 1;
export const PIT_GONE = 2;
/** Bệ nhảy just outside the wall (one per side): launch onto the walkway. */
export const PAD = { r: 15, l: -7, half: 0.9, launch: 14, push: 3.2 } as const;

export function sideDir(side: number): { x: number; z: number } {
  return DIRS[((side % 4) + 4) % 4]!;
}

/** World point for side `side`, distance `r`, lateral `l`. */
export function sidePoint(side: number, r: number, l: number): { x: number; z: number } {
  const d = sideDir(side);
  // Lateral axis = direction turned 90° (x ← −z, z ← x).
  return { x: d.x * r - d.z * l, z: d.z * r + d.x * l };
}

/** (r, l) of a world point in side `side`'s frame. */
export function sideFrame(side: number, x: number, z: number): { r: number; l: number } {
  const d = sideDir(side);
  return { r: x * d.x + z * d.z, l: -x * d.z + z * d.x };
}

/** Which side a point is on (the dominant axis). */
export function sideOf(x: number, z: number): number {
  if (Math.abs(z) >= Math.abs(x)) return z < 0 ? 0 : 2;
  return x > 0 ? 1 : 3;
}

/** Axis-aligned box from a side-frame rectangle. */
export function sideBox(side: number, r0: number, r1: number, l0: number, l1: number, top: number, bottom?: number): Box {
  const a = sidePoint(side, r0, l0);
  const b = sidePoint(side, r1, l1);
  const box: Box = { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z), top };
  if (bottom !== undefined) box.bottom = bottom;
  return box;
}

// --- stairs ---------------------------------------------------------------------------------

/** Steps low enough to walk up (below the character's step height). */
const STEP_RISE = 0.33;

/** A straight flight from height `from` to `to` along the side frame, rising toward `r1`/`l1`. */
function flight(side: number, from: number, to: number, alongR: boolean, start: number, end: number, across0: number, across1: number): Box[] {
  const n = Math.ceil((to - from) / STEP_RISE);
  const out: Box[] = [];
  for (let k = 0; k < n; k++) {
    const a = start + ((end - start) * k) / n;
    const b = start + ((end - start) * (k + 1)) / n;
    const top = from + ((to - from) * (k + 1)) / n;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    out.push(alongR ? sideBox(side, lo, hi, across0, across1, top) : sideBox(side, across0, across1, lo, hi, top));
  }
  return out;
}

/**
 * All stairs: from the yard up to the wall walkway (one flight per side), from the walkway up to a
 * corner tower top, and up the keep (ground → terrace → roof).
 */
export function castleStairs(): Box[] {
  const out: Box[] = [];
  for (let side = 0; side < 4; side++) {
    // Yard → walkway: rising outward toward the wall at lateral −8.4…−6.
    out.push(...flight(side, 0, WALL_TOP, true, MAP.wallIn - 4.6, MAP.wallIn, -8.4, -6));
    // Walkway → corner tower top: on the walkway, rising toward the corner (lateral +).
    out.push(...flight(side, WALL_TOP, CASTLE_TOWER_TOP, false, CORNER.at - CORNER.half - 6.6, CORNER.at - CORNER.half, MAP.wallIn, MAP.wallOut));
  }
  // Keep: ground → terrace along the east face; terrace → roof along the north part of the terrace.
  out.push(...flight(1, 0, CASTLE_TOWER_TOP, false, 4.6, -4.6, KEEP.lowHalf, KEEP.lowHalf + 1.4));
  out.push(...flight(0, CASTLE_TOWER_TOP, KEEP_TOP, false, KEEP.lowHalf - 0.2, -KEEP.highHalf, KEEP.highHalf, KEEP.lowHalf));
  return out;
}

// --- pit / moat -------------------------------------------------------------------------------

export function pitTileBox(i: number): Box {
  const side = Math.floor(i / PIT_TILES_PER_SIDE);
  const k = i % PIT_TILES_PER_SIDE;
  const row = Math.floor(k / PIT.cols);
  const col = k % PIT.cols;
  const r0 = PIT.rIn + row * PIT.tile;
  const l0 = -(PIT.cols * PIT.tile) / 2 + col * PIT.tile;
  return sideBox(side, r0, r0 + PIT.tile, l0, l0 + PIT.tile, 0, -1);
}

/** Pit tile under (x, z), or -1. */
export function pitTileAt(x: number, z: number): number {
  const side = sideOf(x, z);
  const { r, l } = sideFrame(side, x, z);
  const row = Math.floor((r - PIT.rIn) / PIT.tile);
  const col = Math.floor((l + (PIT.cols * PIT.tile) / 2) / PIT.tile);
  if (row < 0 || row >= PIT.rows || col < 0 || col >= PIT.cols) return -1;
  return side * PIT_TILES_PER_SIDE + row * PIT.cols + col;
}

export function inMoat(x: number, z: number): boolean {
  const ring = Math.max(Math.abs(x), Math.abs(z));
  if (ring < MOAT.rIn || ring > MOAT.rOut) return false;
  const { l } = sideFrame(sideOf(x, z), x, z);
  return Math.abs(l) > MOAT.bridge;
}

/** A few low walls to hide behind, two per side. */
export function castleLowWalls(): Box[] {
  const out: Box[] = [];
  for (let side = 0; side < 4; side++) {
    for (const l of [-9, 9]) out.push(sideBox(side, 24, 25, l - 2, l + 2, 1));
  }
  return out;
}

export interface CastleWorld {
  world: SimWorld;
  /** Pit tile boxes (index = tile). */
  tiles: Box[];
}

export function createCastleWorld(): CastleWorld {
  const H = MAP.half;
  const P0 = PIT.rIn;
  const P1 = PIT.rIn + PIT.rows * PIT.tile;
  const PL = (PIT.cols * PIT.tile) / 2;
  const floor = (minX: number, maxX: number, minZ: number, maxZ: number): Box => ({ minX, maxX, minZ, maxZ, top: 0, bottom: -1 });
  const tiles: Box[] = [];
  for (let i = 0; i < PIT_TILE_COUNT; i++) tiles.push(pitTileBox(i));
  const boxes: Box[] = [
    // Ground everywhere except the four pit bands.
    floor(-P0, P0, -P0, P0),
    floor(-H, H, -H, -P1), floor(-H, H, P1, H),
    floor(-H, -PL, -P1, -P0), floor(PL, H, -P1, -P0), floor(-H, -PL, P0, P1), floor(PL, H, P0, P1),
    floor(P1, H, -P0, P0), floor(-H, -P1, -P0, P0),
    floor(P0, P1, -P0, -PL), floor(P0, P1, PL, P0), floor(-P1, -P0, -P0, -PL), floor(-P1, -P0, PL, P0),
    ...tiles,
  ];
  for (let side = 0; side < 4; side++) {
    // Wall with its doorway; the top is a walkway.
    boxes.push(sideBox(side, MAP.wallIn, MAP.wallOut, -MAP.wallOut, -MAP.door, WALL_TOP));
    boxes.push(sideBox(side, MAP.wallIn, MAP.wallOut, MAP.door, MAP.wallOut, WALL_TOP));
    // The walkway bridges the doorway (people walk under it).
    boxes.push(sideBox(side, MAP.wallIn, MAP.wallOut, -MAP.door, MAP.door, WALL_TOP, WALL_TOP - 0.4));
  }
  // Corner towers (tops at CASTLE_TOWER_TOP).
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * CORNER.at;
      const cz = sz * CORNER.at;
      boxes.push({ minX: cx - CORNER.half, maxX: cx + CORNER.half, minZ: cz - CORNER.half, maxZ: cz + CORNER.half, top: CASTLE_TOWER_TOP });
    }
  }
  // Keep: terrace block and roof block.
  boxes.push({ minX: -KEEP.lowHalf, maxX: KEEP.lowHalf, minZ: -KEEP.lowHalf, maxZ: KEEP.lowHalf, top: CASTLE_TOWER_TOP });
  boxes.push({ minX: -KEEP.highHalf, maxX: KEEP.highHalf, minZ: -KEEP.highHalf, maxZ: KEEP.highHalf, top: KEEP_TOP });
  boxes.push(...castleStairs(), ...castleLowWalls());
  return { world: { bounds: { minX: -H, maxX: H, minZ: -H, maxZ: H }, boxes, killY: -10, noFloor: true }, tiles };
}

/** Sync the collision world with the pit tile states (dropped tiles moved far away). */
export function applyPitTiles(cw: CastleWorld, states: ArrayLike<number>): void {
  for (let i = 0; i < cw.tiles.length; i++) {
    const box = cw.tiles[i]!;
    const home = pitTileBox(i);
    if ((states[i] ?? PIT_SOLID) === PIT_GONE) {
      box.minX = box.maxX = 1e6;
      box.minZ = box.maxZ = 1e6;
    } else {
      box.minX = home.minX;
      box.maxX = home.maxX;
      box.minZ = home.minZ;
      box.maxZ = home.maxZ;
    }
  }
}

export function padPoint(side: number): { x: number; z: number } {
  return sidePoint(side, PAD.r, PAD.l);
}

function padUnder(s: CharacterState): number {
  for (let side = 0; side < 4; side++) {
    const p = padPoint(side);
    if (Math.abs(s.x - p.x) <= PAD.half && Math.abs(s.z - p.z) <= PAD.half) return side;
  }
  return -1;
}

/** Moat wading and jump pads on top of the normal character step (shared by server and prediction). */
export function castleStep(cw: CastleWorld): StepFn {
  const tmp = { dirX: 0, dirZ: 0, jump: false };
  return (s, intent, dt) => {
    const wading = s.y < 0.1 && inMoat(s.x, s.z);
    tmp.dirX = intent.dirX * (wading ? MOAT.slow : 1);
    tmp.dirZ = intent.dirZ * (wading ? MOAT.slow : 1);
    tmp.jump = intent.jump;
    stepCharacter(s, tmp, dt, cw.world);
    if (s.grounded && s.y < 0.05 && padUnder(s) >= 0) {
      s.vy = PAD.launch; // boing — onto the wall
      s.grounded = false;
    } else if (!s.grounded && s.y > 0.3) {
      // Flying up from a pad: drift inward onto the walkway (position-based, so prediction agrees).
      for (let side = 0; side < 4; side++) {
        const { r, l } = sideFrame(side, s.x, s.z);
        if (Math.abs(l - PAD.l) > PAD.half + 0.4 || r > PAD.r + PAD.half + 0.4 || r < MAP.wallIn + 0.5) continue;
        const d = sideDir(side);
        s.x -= d.x * PAD.push * dt;
        s.z -= d.z * PAD.push * dt;
      }
    }
  };
}

/** Players start inside, spread over the four gates. */
export function castleSpawn(slot: number): { x: number; z: number; yaw: number } {
  const side = slot % 4;
  const p = sidePoint(side, 9, 0);
  const d = sideDir(side);
  return { x: p.x, z: p.z, yaw: Math.atan2(d.x, d.z) };
}

/** Where the monsters of a side attack its gate (just outside the doorway). */
export function gatePoint(side: number, radius: number): { x: number; z: number } {
  return sidePoint(side, MAP.wallOut + radius, 0);
}

/** Ray vs axis-aligned box (its bottom is the ground unless given): distance to entry, or null. */
export function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Box): number | null {
  let tmin = 0;
  let tmax = Infinity;
  const axes: Array<[number, number, number, number]> = [
    [ox, dx, b.minX, b.maxX],
    [oy, dy, b.bottom ?? 0, b.top],
    [oz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}
