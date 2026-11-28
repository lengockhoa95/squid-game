import { MAP, MONSTERS, WEAPONS, isBoss, isWeaponId, parsePerks, sideOf, sidePoint, type Difficulty, type MonsterKind } from '@sp/shared';
import type { NPCBot, BotIO, NpcStrategy } from '../../npc/NPCBot.ts';
import type { Castle } from './Logic.ts';

const ATTACK_CHANCE: Record<Difficulty, number> = { EASY: 0.35, NORMAL: 0.6, HARD: 0.85, SMART: 0.95 };

/**
 * Castle bots: grab a better weapon, revive fallen teammates, then fight the monster closest to
 * the castle. They route through the gates (walls block straight lines), walk into range, face the
 * target and swing / shoot (aiming up at flyers). SMART/HARD step out of the dragon's fire.
 */
export class CastleStrategy implements NpcStrategy {
  private readonly game: Castle;

  constructor(game: Castle) {
    this.game = game;
  }

  /** Steer toward a point, routing through the gates / around the castle. */
  private go(bot: NPCBot, x: number, z: number): void {
    const s = bot.sim.state;
    const w = castleWaypoint(s.x, s.z, x, z);
    bot.steerTo(w.x, w.z);
  }

  update(bot: NPCBot, io: BotIO, dt: number): void {
    const s = bot.sim.state;
    const view = this.game.view();
    const weapon = WEAPONS[isWeaponId(bot.state.weapon) ? bot.state.weapon : 'FIST'];

    // Weapon card between waves: pick one after a short "thinking" pause.
    const offer = this.game.offerOf(bot.id);
    if (offer.length > 0 && bot.chance(dt * 0.8)) {
      // Prefer upgrading the weapon, then a line that is closest to its ultimate.
      const perks = parsePerks(bot.state.perks);
      const pick = offer.includes('FORGE') && bot.chance(0.6) ? 'FORGE' : [...offer].sort((a, b) => (perks[b] ?? 0) - (perks[a] ?? 0))[0]!;
      this.game.handlePick(bot.id, bot.difficulty === 'EASY' ? offer[Math.floor(Math.random() * offer.length)]! : pick);
    }

    // Downed: nothing to do but wait.
    if (bot.state.downed) return;
    // A teammate is down nearby: go and revive them (careful bots more eagerly).
    const helpRange = bot.difficulty === 'EASY' ? 6 : bot.difficulty === 'NORMAL' ? 12 : 20;
    const fallen = view.downed.filter((d) => d.id !== bot.id).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0];
    if (fallen && Math.hypot(fallen.x - s.x, fallen.z - s.z) < helpRange) {
      this.go(bot, fallen.x, fallen.z);
      if (Math.hypot(fallen.x - s.x, fallen.z - s.z) < 1) {
        bot.intent.dirX = 0;
        bot.intent.dirZ = 0;
      }
      return;
    }

    // A better weapon nearby (or bare-handed): go get it.
    const better = view.pickups.filter((pk) => weapon.id === 'FIST' || pk.tier > bot.state.weaponTier);
    if (better.length > 0) {
      const pk = [...better].sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0]!;
      if (Math.hypot(pk.x - s.x, pk.z - s.z) < 12) {
        this.go(bot, pk.x, pk.z);
        return;
      }
    }
    const targets = view.monsters.filter((m) => m.y < 1.5 + s.y || weapon.ranged);
    if (targets.length === 0) {
      // Guard (inside) the gate this wave comes from.
      const main = Number(view.sides.split(',')[bot.state.slot % 2] ?? view.sides.split(',')[0] ?? bot.state.slot % 4);
      const g = sidePoint(Number.isFinite(main) ? main : bot.state.slot % 4, MAP.wallIn - 3, (bot.state.slot - 1.5) * 1.5);
      this.go(bot, g.x, g.z);
      return;
    }
    // Most urgent: the monster closest to the gate, ties broken by distance to us.
    const target = targets.reduce((a, b) => (urgency(b, s) > urgency(a, s) ? b : a));
    const info = MONSTERS[target.kind as MonsterKind];
    const dx = target.x - s.x;
    const dz = target.z - s.z;
    const d = Math.hypot(dx, dz);
    const careful = bot.difficulty === 'SMART' || bot.difficulty === 'HARD';
    if (target.kind === 'DRAGON' && target.state === 'BREATH' && careful && d < 9) {
      // Step sideways out of the fire.
      bot.steerTo(s.x + (-dz / (d || 1)) * 4, s.z + (dx / (d || 1)) * 4);
      return;
    }
    const want = weapon.ranged ? Math.min(weapon.range * 0.6, 9) : weapon.range + info.radius - 0.4;
    this.go(bot, target.x, target.z);
    if (d < want) {
      // In range: stop and attack toward it (aiming up at flyers).
      bot.intent.dirX *= 0.15;
      bot.intent.dirZ *= 0.15;
      if (bot.shouldThink(dt, 6) && bot.chance(ATTACK_CHANCE[bot.difficulty])) {
        const yaw = Math.atan2(dx, dz);
        const pitch = Math.atan2(this.game.aimHeight(target) - (s.y + 1), d);
        io.attack(yaw, pitch);
      }
    }
    // Hop when stuck on a low wall.
    if (s.grounded && Math.hypot(s.vx, s.vz) < 0.5 && d > want && bot.chance(0.03)) bot.intent.jump = true;
  }
}

/** Monsters close to the castle (bombers above all) first, then the ones close to us. */
function urgency(m: { z: number; x: number; kind: string }, s: { x: number; z: number }): number {
  const toCastle = isBoss(m.kind) || m.kind === 'BAT' ? 30 : Math.max(Math.abs(m.x), Math.abs(m.z));
  return -toCastle - Math.hypot(m.x - s.x, m.z - s.z) * 0.6 + (m.kind === 'BOMBER' ? 8 : 0);
}

/** Inside the walls? */
function inside(x: number, z: number): boolean {
  return Math.max(Math.abs(x), Math.abs(z)) < MAP.wallIn;
}

/**
 * Next waypoint toward (tx, tz) around the castle: walls block straight lines, so leave / enter
 * through the gate on the target's side, and go round the corners outside.
 */
export function castleWaypoint(x: number, z: number, tx: number, tz: number): { x: number; z: number } {
  const meIn = inside(x, z);
  const goalIn = inside(tx, tz);
  if (meIn && goalIn) return { x: tx, z: tz };
  if (meIn !== goalIn) {
    // Through the gate on the outside point's side.
    const side = meIn ? sideOf(tx, tz) : sideOf(x, z);
    const inner = sidePoint(side, MAP.wallIn - 1.5, 0);
    const outer = sidePoint(side, MAP.wallOut + 1.5, 0);
    const first = meIn ? inner : outer;
    const second = meIn ? outer : inner;
    if (Math.hypot(first.x - x, first.z - z) > 1.2 && !nearDoor(x, z, side)) return first;
    return Math.hypot(second.x - x, second.z - z) > 1.2 ? second : { x: tx, z: tz };
  }
  // Both outside: if the straight line cuts through the castle, go via the nearest outside corner.
  if (!segmentHitsCastle(x, z, tx, tz)) return { x: tx, z: tz };
  const c = MAP.wallOut + 3.5;
  const corners = [{ x: c, z: c }, { x: -c, z: c }, { x: c, z: -c }, { x: -c, z: -c }];
  const best = corners
    .filter((k) => !segmentHitsCastle(x, z, k.x, k.z))
    .sort((a, b) => Math.hypot(a.x - x, a.z - z) + Math.hypot(tx - a.x, tz - a.z) - Math.hypot(b.x - x, b.z - z) - Math.hypot(tx - b.x, tz - b.z))[0];
  return best ?? { x: tx, z: tz };
}

function nearDoor(x: number, z: number, side: number): boolean {
  const p = sidePoint(side, (MAP.wallIn + MAP.wallOut) / 2, 0);
  return Math.hypot(p.x - x, p.z - z) < MAP.door;
}

function segmentHitsCastle(x0: number, z0: number, x1: number, z1: number): boolean {
  const lim = MAP.wallOut - 0.3; // the wall itself (monsters at a gate stand just outside it)
  for (let k = 1; k < 12; k++) {
    const f = k / 12;
    const x = x0 + (x1 - x0) * f;
    const z = z0 + (z1 - z0) * f;
    if (Math.abs(x) < lim && Math.abs(z) < lim) return true;
  }
  return false;
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
