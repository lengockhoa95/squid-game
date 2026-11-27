import { stepCharacter, type Box, type CharacterState, type SimWorld } from '../sim/kinematics.ts';
import type { StepFn } from '../sim/step.ts';

/** Tháp Leo: a spiral of floating platforms around a core; lava rises from below. */
export const TOWER = {
  platforms: 42,
  radius: 7,
  perTurn: 12,
  rise: 1,
  size: 2.4,
  goalSize: 4,
  thickness: 0.5,
  coreRadius: 3.2,
  baseHalf: 11,
  /** Lava height: start + speed·t + accel·t². */
  lavaStart: -1.5,
  lavaSpeed: 0.35,
  lavaAccel: 0.009,
  movingAmplitude: 1.4,
  /** Ghost platforms are solid for this fraction of their cycle. */
  ghostSolid: 0.62,
  ghostPeriod: 2.6,
} as const;

export type TowerKind = 'static' | 'moving' | 'ghost' | 'goal';

export interface TowerPlatform {
  index: number;
  angle: number;
  y: number;
  kind: TowerKind;
  phase: number;
}

export const TOWER_PLATFORMS: readonly TowerPlatform[] = Array.from({ length: TOWER.platforms }, (_, i) => {
  const last = i === TOWER.platforms - 1;
  const kind: TowerKind = last ? 'goal' : i > 3 && i % 6 === 3 ? 'moving' : i > 4 && i % 7 === 5 ? 'ghost' : 'static';
  return { index: i, angle: (i / TOWER.perTurn) * Math.PI * 2, y: (i + 1) * TOWER.rise, kind, phase: i * 1.7 };
});

export const TOWER_TOP = TOWER_PLATFORMS[TOWER_PLATFORMS.length - 1]!.y;

export function lavaHeight(t: number): number {
  return TOWER.lavaStart + TOWER.lavaSpeed * t + TOWER.lavaAccel * t * t;
}

export function ghostIsSolid(p: TowerPlatform, t: number): boolean {
  const cycle = ((t / TOWER.ghostPeriod + p.phase) % 1 + 1) % 1;
  return cycle < TOWER.ghostSolid;
}

/** Centre of a platform at game time t (moving ones slide in and out along their radius). */
export function platformCenter(p: TowerPlatform, t: number): { x: number; z: number } {
  const r = TOWER.radius + (p.kind === 'moving' ? Math.sin(t * 1.2 + p.phase) * TOWER.movingAmplitude : 0);
  return { x: Math.cos(p.angle) * r, z: Math.sin(p.angle) * r };
}

export interface TowerWorld {
  world: SimWorld;
  /** Same order as TOWER_PLATFORMS. */
  platforms: Box[];
}

export function createTowerWorld(): TowerWorld {
  const boxes: Box[] = [];
  const b = TOWER.baseHalf;
  boxes.push({ minX: -b, maxX: b, minZ: -b, maxZ: b, top: 0, bottom: -1 }); // ground floor
  const c = TOWER.coreRadius;
  boxes.push({ minX: -c, maxX: c, minZ: -c, maxZ: c, top: TOWER_TOP + 4 }); // central core
  const platforms: Box[] = TOWER_PLATFORMS.map((p) => ({ minX: 0, maxX: 0, minZ: 0, maxZ: 0, top: p.y, bottom: p.y - TOWER.thickness }));
  boxes.push(...platforms);
  const tw: TowerWorld = {
    world: { bounds: { minX: -b - 6, maxX: b + 6, minZ: -b - 6, maxZ: b + 6 }, boxes, killY: -50, noFloor: true },
    platforms,
  };
  updateTowerWorld(tw, 0);
  return tw;
}

export function updateTowerWorld(tw: TowerWorld, t: number): void {
  TOWER_PLATFORMS.forEach((p, i) => {
    const box = tw.platforms[i]!;
    if (p.kind === 'ghost' && !ghostIsSolid(p, t)) {
      box.minX = box.maxX = box.minZ = box.maxZ = 1e6; // vanished
      return;
    }
    const { x, z } = platformCenter(p, t);
    const h = (p.kind === 'goal' ? TOWER.goalSize : TOWER.size) / 2;
    box.minX = x - h;
    box.maxX = x + h;
    box.minZ = z - h;
    box.maxZ = z + h;
  });
}

export function towerStep(tw: TowerWorld): StepFn {
  return (s, intent, dt, t) => {
    updateTowerWorld(tw, t);
    stepCharacter(s, intent, dt, tw.world);
  };
}

/** Platform index a character stands on (-1 = ground floor / none). */
export function platformUnder(tw: TowerWorld, s: CharacterState): number {
  if (!s.grounded) return -2;
  for (let i = tw.platforms.length - 1; i >= 0; i--) {
    const b = tw.platforms[i]!;
    if (Math.abs(s.y - b.top) < 0.15 && s.x >= b.minX && s.x <= b.maxX && s.z >= b.minZ && s.z <= b.maxZ) return i;
  }
  return -1;
}

export function towerSpawn(slot: number): { x: number; z: number; yaw: number } {
  // On the ground floor just before the first platform (angle 0 → +X side).
  return { x: TOWER.radius + 2.5, z: -3 - slot * 1.4, yaw: 0 };
}
