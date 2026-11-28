import {
  MOAT, PIT, PIT_CRACKING, PIT_GONE, PIT_SOLID, PIT_TILE_COUNT, applyPitTiles, inMoat, sideDir, sidePoint,
  type CastleWorld,
} from '@sp/shared';
import { type CastleState, SharkFin } from '@sp/shared/schema';

interface SharkBrain {
  fin: SharkFin;
  /** The moat side it patrols, and its lateral position / direction along that side. */
  side: number;
  l: number;
  dir: number;
  biteReady: number;
  lungeUntil: number;
  targetX: number;
  targetZ: number;
}

/** Something a shark can bite: a player or a monster wading in the moat. */
export interface MoatPrey {
  x: number;
  z: number;
  bite(fromX: number, fromZ: number): void;
}

/**
 * Map hazards reused from other games:
 * - Sàn sụp: during waves, random tiles near the lair crack and drop for a few seconds.
 * - Hào nước: sharks patrol the moat in front of the courtyard and lunge at anyone wading.
 */
export class CastleHazards {
  private readonly state: CastleState;
  private readonly cw: CastleWorld;
  private readonly rng: () => number;
  private readonly tileUntil: number[] = [];
  private nextCrack = 0;
  private readonly sharks: SharkBrain[] = [];

  constructor(state: CastleState, cw: CastleWorld, rng: () => number) {
    this.state = state;
    this.cw = cw;
    this.rng = rng;
    for (let i = 0; i < PIT_TILE_COUNT; i++) {
      state.tiles.push(PIT_SOLID);
      this.tileUntil.push(0);
    }
    applyPitTiles(cw, state.tiles);
    // One shark per side of the ring.
    for (let side = 0; side < 4; side++) {
      const fin = new SharkFin();
      const l = side % 2 === 0 ? -10 : 10;
      const p = sidePoint(side, (MOAT.rIn + MOAT.rOut) / 2, l);
      fin.x = p.x;
      fin.z = p.z;
      state.sharks.push(fin);
      this.sharks.push({ fin, side, l, dir: side % 2 === 0 ? 1 : -1, biteReady: 0, lungeUntil: 0, targetX: 0, targetZ: 0 });
    }
  }

  /** Wave on: tiles crack and drop. Break: everything is solid again. */
  updatePit(t: number, wave: boolean): void {
    const tiles = this.state.tiles;
    let changed = false;
    for (let i = 0; i < PIT_TILE_COUNT; i++) {
      const st = tiles[i]!;
      if (!wave && st !== PIT_SOLID) {
        tiles[i] = PIT_SOLID;
        changed = true;
        continue;
      }
      if (st === PIT_CRACKING && t >= this.tileUntil[i]!) {
        tiles[i] = PIT_GONE;
        this.tileUntil[i] = t + PIT.goneSeconds;
        changed = true;
      } else if (st === PIT_GONE && t >= this.tileUntil[i]!) {
        tiles[i] = PIT_SOLID;
        changed = true;
      }
    }
    if (wave && t >= this.nextCrack) {
      this.nextCrack = t + PIT.every;
      let gone = 0;
      for (let i = 0; i < PIT_TILE_COUNT; i++) if (tiles[i] !== PIT_SOLID) gone++;
      if (gone < PIT.maxGone) {
        const solid: number[] = [];
        for (let i = 0; i < PIT_TILE_COUNT; i++) if (tiles[i] === PIT_SOLID) solid.push(i);
        const pick = solid[Math.floor(this.rng() * solid.length)];
        if (pick !== undefined) {
          tiles[pick] = PIT_CRACKING;
          this.tileUntil[pick] = t + PIT.crackSeconds;
        }
      }
    }
    if (changed) applyPitTiles(this.cw, tiles);
  }

  tileGone(i: number): boolean {
    return this.state.tiles[i] === PIT_GONE;
  }

  /** Sharks patrol the moat; one in reach of someone wading lunges and bites. */
  updateSharks(dt: number, t: number, prey: readonly MoatPrey[]): void {
    const mid = (MOAT.rIn + MOAT.rOut) / 2;
    const span = MOAT.rOut - 1;
    for (const sh of this.sharks) {
      const f = sh.fin;
      if (t < sh.lungeUntil) {
        const dx = sh.targetX - f.x;
        const dz = sh.targetZ - f.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.1) {
          const step = Math.min(d, MOAT.lungeSpeed * dt);
          f.x += (dx / d) * step;
          f.z += (dz / d) * step;
          f.yaw = Math.atan2(dx, dz);
        }
      } else {
        f.lunge = false;
        sh.l += sh.dir * MOAT.sharkSpeed * dt;
        if (sh.l > span || sh.l < -span) sh.dir = -sh.dir;
        const want = sidePoint(sh.side, mid, sh.l);
        f.x += (want.x - f.x) * Math.min(1, dt * 3);
        f.z += (want.z - f.z) * Math.min(1, dt * 3);
        // Facing along the side (lateral axis = direction turned 90°).
        const d = sideDir(sh.side);
        f.yaw = Math.atan2(-d.z * sh.dir, d.x * sh.dir);
        // Someone wading close by: lunge.
        if (t >= sh.biteReady) {
          const target = prey.find((p) => inMoat(p.x, p.z) && Math.hypot(p.x - f.x, p.z - f.z) < 4);
          if (target) {
            sh.lungeUntil = t + 0.6;
            sh.targetX = target.x;
            sh.targetZ = target.z;
            f.lunge = true;
          }
        }
      }
      if (t < sh.biteReady) continue;
      const victim = prey.find((p) => inMoat(p.x, p.z) && Math.hypot(p.x - f.x, p.z - f.z) < MOAT.biteRadius);
      if (!victim) continue;
      sh.biteReady = t + MOAT.biteCooldown;
      sh.lungeUntil = 0;
      victim.bite(f.x, f.z);
    }
  }
}
