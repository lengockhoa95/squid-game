import { CASTLE, MONSTERS, WEAPONS, isWeaponId, parsePerks, type Difficulty, type MonsterKind } from '@sp/shared';
import type { NPCBot, BotIO, NpcStrategy } from '../../npc/NPCBot.ts';
import type { Castle } from './Logic.ts';

const ATTACK_CHANCE: Record<Difficulty, number> = { EASY: 0.35, NORMAL: 0.6, HARD: 0.85, SMART: 0.95 };

/**
 * Castle bots: grab a nearby weapon when bare-handed, then fight the monster closest to the gate
 * (or the dragon). They walk into range, face the target and swing/shoot. SMART/HARD step out of
 * the dragon's fire.
 */
export class CastleStrategy implements NpcStrategy {
  private readonly game: Castle;

  constructor(game: Castle) {
    this.game = game;
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

    // A better weapon nearby (or bare-handed): go get it.
    const better = view.pickups.filter((pk) => weapon.id === 'FIST' || pk.tier > bot.state.weaponTier);
    if (better.length > 0) {
      const pk = [...better].sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0]!;
      if (Math.hypot(pk.x - s.x, pk.z - s.z) < 12) {
        bot.steerTo(pk.x, pk.z);
        return;
      }
    }
    const targets = view.monsters.filter((m) => m.kind !== 'DRAGON' || m.y < 1 || weapon.ranged);
    if (targets.length === 0) {
      bot.steerTo(s.x * 0.9, CASTLE.gateZ - 6); // guard the gate
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
    bot.steerTo(target.x, target.z);
    if (d < want) {
      // In range: just turn to face (a gentle step keeps the facing yaw on target).
      bot.intent.dirX *= 0.15;
      bot.intent.dirZ *= 0.15;
      const facing = Math.abs(angleDiff(Math.atan2(dx, dz), s.yaw));
      if (facing < 0.5 && bot.shouldThink(dt, 6) && bot.chance(ATTACK_CHANCE[bot.difficulty])) io.attack();
    }
    // Hop when stuck on a low wall.
    if (s.grounded && Math.hypot(s.vx, s.vz) < 0.5 && d > want && bot.chance(0.03)) bot.intent.jump = true;
  }
}

function urgency(m: { z: number; x: number; kind: string }, s: { x: number; z: number }): number {
  const toGate = m.kind === 'BAT' || m.kind === 'DRAGON' ? 0 : m.z; // bats/dragon hunt players, not the gate
  return toGate - Math.hypot(m.x - s.x, m.z - s.z) * 0.6;
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
