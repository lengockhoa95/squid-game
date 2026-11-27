import { stepCharacter, type Box, type CharacterState, type SimWorld } from '../sim/kinematics.ts';
import type { StepFn } from '../sim/step.ts';
import { applySweepers, type Sweeper } from './race.ts';

/**
 * Parkour: a long course of mixed obstacles over the void —
 * stepping stones → hurdles → balance beam → jump pad up to a high deck with sliding hammers →
 * backwards conveyor → drop to a sweeper floor → moving platform across the last gap → finish.
 */
export const PARKOUR = {
  halfWidth: 4,
  startZ: 8,
  finishZ: -94,
  killY: -9,
  deck: 4.5,
  padLaunch: 17,
  conveyorSpeed: 2.6,
} as const;

const H = PARKOUR.halfWidth;
const DECK = PARKOUR.deck;

export type ParkourKind = 'floor' | 'stone' | 'beam' | 'hurdle' | 'pad' | 'deck' | 'conveyor' | 'moving' | 'hammer';

export interface ParkourBox extends Box {
  kind: ParkourKind;
}

function slab(minX: number, maxX: number, zFrom: number, zTo: number, top: number, kind: ParkourKind, depth = 1): ParkourBox {
  return { minX, maxX, minZ: Math.min(zFrom, zTo), maxZ: Math.max(zFrom, zTo), top, bottom: top - depth, kind };
}

/** Static pieces (built once). */
export const PARKOUR_STATIC: readonly ParkourBox[] = [
  slab(-H, H, 12, 3, 0, 'floor'), // start
  // Stepping stones (zigzag, small, over the void).
  ...[[-1.8, 0], [1.6, 0.4], [-1.2, 0.8], [2, 0.4], [-0.6, 0], [1.4, 0.5]].map(([x, top], i) =>
    slab(x! - 0.95, x! + 0.95, 0 - i * 3 + 0.95, 0 - i * 3 - 0.95, top!, 'stone')),
  slab(-H, H, -17.5, -26, 0, 'floor'), // hurdle floor
  ...[-20, -22.5, -25].map((z) => slab(-H, H, z + 0.3, z - 0.3, 0.8, 'hurdle', 0.8)),
  slab(-0.35, 0.35, -26, -37, 0, 'beam'), // balance beam
  slab(-H, H, -37, -42.5, 0, 'floor'),
  slab(-H, H, -42.5, -44, 0.05, 'pad', 1.05), // jump pad
  slab(-H, H, -46, -56, DECK, 'deck'), // high deck with hammers
  slab(-H, H, -58, -70, DECK, 'conveyor'), // conveyor pushing back (+z)
  slab(-6.5, 6.5, -72, -82, 0, 'floor'), // wide sweeper floor (room to go around the bar)
  slab(-H, H, -87, -100, 0, 'floor'), // finish
];

export interface Mover {
  /** Base box (x centred at 0); `axis` offset added each tick. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number;
  depth: number;
  amplitude: number;
  speed: number;
  phase: number;
  kind: 'moving' | 'hammer';
}

export const PARKOUR_MOVERS: readonly Mover[] = [
  // Sliding hammers on the deck (tall blocks that shove you off).
  { minX: -1.3, maxX: 1.3, minZ: -50.6, maxZ: -49.4, top: DECK + 2.2, depth: 2.2, amplitude: 3, speed: 1.5, phase: 0, kind: 'hammer' },
  { minX: -1.3, maxX: 1.3, minZ: -53.6, maxZ: -52.4, top: DECK + 2.2, depth: 2.2, amplitude: 3, speed: 1.9, phase: 2, kind: 'hammer' },
  // Moving platform bridging the last gap.
  { minX: -1.1, maxX: 1.1, minZ: -85.5, maxZ: -83.5, top: 0, depth: 0.6, amplitude: 2.6, speed: 1.2, phase: 0.5, kind: 'moving' },
];

export const PARKOUR_SWEEPERS: readonly Sweeper[] = [{ x: 0, z: -77, length: 3.6, speed: 2, height: 0.7, y: 0 }];

/** Checkpoints in course order: respawn at the last one passed (by z). */
export const PARKOUR_CHECKPOINTS: ReadonlyArray<{ z: number; y: number }> = [
  { z: 6, y: 0 },
  { z: -19, y: 0 },
  { z: -39, y: 0 },
  { z: -47.5, y: DECK },
  { z: -60, y: DECK },
  { z: -73, y: 0 },
  { z: -89, y: 0 },
];

export function moverX(m: Mover, t: number): number {
  return Math.sin(t * m.speed + m.phase) * m.amplitude;
}

export interface ParkourWorld {
  world: SimWorld;
  movers: Box[];
}

export function createParkourWorld(): ParkourWorld {
  const movers: Box[] = PARKOUR_MOVERS.map((m) => ({ minX: m.minX, maxX: m.maxX, minZ: m.minZ, maxZ: m.maxZ, top: m.top, bottom: m.top - m.depth }));
  const pw: ParkourWorld = {
    world: { bounds: { minX: -7, maxX: 7, minZ: -102, maxZ: 13 }, boxes: [...PARKOUR_STATIC, ...movers], killY: PARKOUR.killY, noFloor: true },
    movers,
  };
  updateParkourWorld(pw, 0);
  return pw;
}

export function updateParkourWorld(pw: ParkourWorld, t: number): void {
  PARKOUR_MOVERS.forEach((m, i) => {
    const x = moverX(m, t);
    const box = pw.movers[i]!;
    box.minX = m.minX + x;
    box.maxX = m.maxX + x;
  });
}

function standingOn(s: CharacterState, kind: ParkourKind): boolean {
  if (!s.grounded) return false;
  for (const b of PARKOUR_STATIC) {
    if (b.kind !== kind) continue;
    if (Math.abs(s.y - b.top) < 0.05 && s.x >= b.minX && s.x <= b.maxX && s.z >= b.minZ && s.z <= b.maxZ) return true;
  }
  return false;
}

export function parkourStep(pw: ParkourWorld, radius: number): StepFn {
  return (s, intent, dt, t) => {
    updateParkourWorld(pw, t);
    stepCharacter(s, intent, dt, pw.world);
    if (standingOn(s, 'pad')) {
      s.vy = PARKOUR.padLaunch; // boing
      s.grounded = false;
    } else if (standingOn(s, 'conveyor')) {
      s.z += PARKOUR.conveyorSpeed * dt; // belt drags you back
    }
    applySweepers(s, t, radius, PARKOUR_SWEEPERS);
  };
}

/** Last checkpoint passed for the furthest z reached. */
export function parkourCheckpoint(bestZ: number): { z: number; y: number } {
  let cp = PARKOUR_CHECKPOINTS[0]!;
  for (const c of PARKOUR_CHECKPOINTS) if (bestZ <= c.z) cp = c;
  return cp;
}

export function parkourSpawn(slot: number): { x: number; z: number; yaw: number } {
  return { x: -2.4 + slot * 1.6, z: PARKOUR.startZ, yaw: Math.PI };
}
