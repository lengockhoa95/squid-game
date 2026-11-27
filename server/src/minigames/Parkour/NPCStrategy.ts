import { PARKOUR_MOVERS, PARKOUR_SWEEPERS, PARKOUR_STATIC, moverX, sweeperAngle } from '@sp/shared';
import type { NPCBot, BotIO, NpcStrategy } from '../../npc/NPCBot.ts';
import type { Parkour } from './Logic.ts';

interface Waypoint {
  x: number;
  z: number;
  /** Jump when this close (horizontal) to the waypoint while grounded. 0 = never jump. */
  jumpAt: number;
  /** Index into PARKOUR_MOVERS: aim at its current x and wait for it before jumping. */
  mover?: number;
}

const stones = PARKOUR_STATIC.filter((b) => b.kind === 'stone');
const hurdles = PARKOUR_STATIC.filter((b) => b.kind === 'hurdle');

/** The route bots follow, in order. */
const ROUTE: Waypoint[] = [
  ...stones.map((b) => ({ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, jumpAt: 2.9 })),
  { x: 0, z: -18.5, jumpAt: 2.9 },
  ...hurdles.map((b) => ({ x: 0, z: (b.minZ + b.maxZ) / 2 - 0.5, jumpAt: 1.7 })),
  { x: 0, z: -26.5, jumpAt: 0 },
  { x: 0, z: -37.5, jumpAt: 0 }, // walk the beam
  { x: 0, z: -43.2, jumpAt: 0 }, // jump pad launches
  { x: 0, z: -48, jumpAt: 0 },
  { x: 0, z: -55.5, jumpAt: 0 }, // past the hammers
  { x: 0, z: -59, jumpAt: 2.8 },
  { x: 0, z: -73.5, jumpAt: 0 }, // run the conveyor, drop off its end onto the floor below
  { x: 5.2, z: -74.5, jumpAt: 0 }, // around the sweeper (outside its reach)
  { x: 5.2, z: -81, jumpAt: 0 },
  { x: 0, z: -81.6, jumpAt: 0 },
  { x: 0, z: -84.5, jumpAt: 2.4, mover: 2 },
  { x: 0, z: -88.5, jumpAt: 2.6 },
  { x: 0, z: -97, jumpAt: 0 },
];

/**
 * Parkour bots follow ROUTE. They jump gaps and hurdles at a distance (EASY with sloppy timing), wait
 * for the moving platform to line up, and HARD/SMART bots hold back from hammers and hop sweepers.
 */
export class ParkourStrategy implements NpcStrategy {
  private readonly game: Parkour;

  constructor(game: Parkour) {
    this.game = game;
  }

  /** Is there something to stand on at (x, z) around height y? */
  private groundAt(x: number, y: number, z: number): boolean {
    for (const b of this.game.pw.world.boxes) {
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && b.top <= y + 0.4 && b.top >= y - 1.5) return true;
    }
    return false;
  }

  update(bot: NPCBot, _io: BotIO, _dt: number, t: number): void {
    const s = bot.sim.state;
    const m = bot.memory;
    let i = (m.wp as number | undefined) ?? 0;
    // Respawned behind the current waypoint (fell): rewind to the first waypoint ahead of us.
    if (i > 0 && s.z > ROUTE[i - 1]!.z + 3) i = ROUTE.findIndex((w) => w.z < s.z - 0.5);
    if (i < 0) i = ROUTE.length - 1;
    let w = ROUTE[i]!;
    // Only count a waypoint once we have landed (flying over a stepping stone is not reaching it).
    if (s.grounded && (Math.hypot(w.x - s.x, w.z - s.z) < 1 || s.z < w.z - 0.5)) {
      i = Math.min(ROUTE.length - 1, i + 1);
      w = ROUTE[i]!;
    }
    m.wp = i;
    const careful = bot.difficulty === 'HARD' || bot.difficulty === 'SMART';
    let x = w.x;
    if (w.mover !== undefined) {
      const mx = moverX(PARKOUR_MOVERS[w.mover]!, t);
      x = mx;
      // Wait at the edge until the platform is in front of us.
      if (Math.abs(mx - s.x) > 0.7 && Math.hypot(w.x - s.x, w.z - s.z) < 3.2) {
        bot.steerTo(mx, s.z); // shuffle sideways along the edge
        return;
      }
    }
    if (careful) {
      // Hammers: wait if one is about to sweep through our lane.
      for (const h of PARKOUR_MOVERS) {
        if (h.kind !== 'hammer') continue;
        const ahead = s.z - (h.minZ + h.maxZ) / 2;
        if (ahead < 0.8 || ahead > 2.6 || Math.abs(s.y - (h.top - h.depth)) > 0.5) continue;
        if (Math.abs(moverX(h, t + 0.5) - s.x) < 2.2) {
          bot.stopMoving();
          return;
        }
      }
      for (const sw of PARKOUR_SWEEPERS) {
        if (Math.abs(s.z - sw.z) > sw.length + 0.5 || !s.grounded) continue;
        const a = sweeperAngle(sw, t + 0.15);
        const perp = Math.abs(-(s.x - sw.x) * Math.sin(a) + (s.z - sw.z) * Math.cos(a));
        if (perp < 0.9) bot.intent.jump = true;
      }
    }
    bot.steerTo(x + bot.noise(0.2), w.z);
    const sloppy = bot.difficulty === 'EASY' ? (bot.rng() - 0.5) * 1.2 : bot.difficulty === 'NORMAL' ? (bot.rng() - 0.5) * 0.5 : 0;
    const d = Math.hypot(x - s.x, w.z - s.z);
    if (w.jumpAt > 0 && s.grounded && d < w.jumpAt + sloppy && d > 0.9) bot.intent.jump = true;
    // About to run off an edge: jump (the lead distance is the bot's timing; EASY is sloppier).
    const speed = Math.hypot(s.vx, s.vz);
    if (s.grounded && speed > 2) {
      const lead = 0.45 + Math.max(0, sloppy) * 0.5;
      if (!this.groundAt(s.x + (s.vx / speed) * lead, s.y, s.z + (s.vz / speed) * lead)) bot.intent.jump = true;
    }
    // Stuck behind something: hop.
    m.stuck = s.grounded && Math.hypot(s.vx, s.vz) < 0.8 ? ((m.stuck as number | undefined) ?? 0) + _dt : 0;
    if ((m.stuck as number) > 0.5) {
      bot.intent.jump = true;
      m.stuck = 0;
    }
  }
}
