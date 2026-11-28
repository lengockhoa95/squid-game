import { staticWorldStep, type StepFn } from '../sim/step.ts';
import type { Box, SimWorld } from '../sim/kinematics.ts';

/**
 * Thủ Thành: defend the castle gate against waves of monsters (slimes, skeletons, bats); every
 * 5th wave is a dragon boss. Right click attacks; monsters drop weapons of 4 rarities; after each
 * wave everyone picks a weapon skill card (max level unlocks an ultimate).
 */
export const CASTLE = {
  halfWidth: 16,
  /** Gate line (monsters walk toward +z and hit the gate here). */
  gateZ: 14,
  spawnZ: -30,
  gateHp: 120,
  /** Seconds before the first wave. */
  prepSeconds: 4,
  dropChance: 0.3,
  pickupRadius: 1.2,
  pickupSeconds: 20,
  /** Break between waves (weapon card pick); ends early once everyone picked. */
  breakSeconds: 9,
  /** Gate repaired by this fraction of its max between waves. */
  gateRepair: 0.15,
} as const;

export type WeaponId = 'FIST' | 'SWORD' | 'SPEAR' | 'BOW' | 'GUN';

export interface WeaponInfo {
  id: WeaponId;
  name: string;
  /** Kenney model file (none for fists). */
  model: string;
  damage: number;
  /** Reach (melee) or range (ranged), metres. */
  range: number;
  /** Half-angle of the hit arc (rad); ranged weapons hit the first monster along the line. */
  arc: number;
  ranged: boolean;
  cooldown: number;
}

export const WEAPONS: Readonly<Record<WeaponId, WeaponInfo>> = {
  FIST: { id: 'FIST', name: 'Tay không', model: '', damage: 1, range: 2.2, arc: 1, ranged: false, cooldown: 0.4 },
  SWORD: { id: 'SWORD', name: 'Kiếm', model: 'weapon-sword', damage: 3, range: 3.4, arc: 1.4, ranged: false, cooldown: 0.45 },
  SPEAR: { id: 'SPEAR', name: 'Giáo', model: 'weapon-spear', damage: 3.5, range: 5, arc: 0.55, ranged: false, cooldown: 0.55 },
  BOW: { id: 'BOW', name: 'Cung', model: 'weapon-bow', damage: 4, range: 26, arc: 0, ranged: true, cooldown: 0.9 },
  GUN: { id: 'GUN', name: 'Súng', model: 'weapon-shooter', damage: 1.6, range: 24, arc: 0, ranged: true, cooldown: 0.22 },
};

export const DROP_WEAPONS: readonly WeaponId[] = ['SWORD', 'SPEAR', 'BOW', 'GUN'];

export function isWeaponId(v: unknown): v is WeaponId {
  return typeof v === 'string' && v in WEAPONS;
}

export type MonsterKind = 'SLIME' | 'SKELETON' | 'BAT' | 'DRAGON';

export interface MonsterInfo {
  kind: MonsterKind;
  hp: number;
  speed: number;
  /** Damage per second to the gate while touching it. */
  gateDps: number;
  /** Flight height (0 = walks). */
  fly: number;
  points: number;
  radius: number;
  /** Bats chase players instead of the gate. */
  huntsPlayers: boolean;
}

export const MONSTERS: Readonly<Record<MonsterKind, MonsterInfo>> = {
  SLIME: { kind: 'SLIME', hp: 3, speed: 2.1, gateDps: 2, fly: 0, points: 1, radius: 0.6, huntsPlayers: false },
  SKELETON: { kind: 'SKELETON', hp: 6, speed: 2.9, gateDps: 3, fly: 0, points: 2, radius: 0.5, huntsPlayers: false },
  BAT: { kind: 'BAT', hp: 3, speed: 4, gateDps: 0, fly: 1.3, points: 2, radius: 0.5, huntsPlayers: true },
  DRAGON: { kind: 'DRAGON', hp: 70, speed: 4, gateDps: 0, fly: 6, points: 0, radius: 2, huntsPlayers: true },
};

/** Host setting: how many waves (a boss every BOSS_EVERY waves, the last wave is always a boss). */
export const CASTLE_WAVE_OPTIONS = [5, 10, 15, 20] as const;
export const CASTLE_DEFAULT_WAVES = 10;
export const BOSS_EVERY = 5;

export function castleWaveCount(v: number): number {
  return (CASTLE_WAVE_OPTIONS as readonly number[]).includes(v) ? v : CASTLE_DEFAULT_WAVES;
}

export function isBossWave(wave: number): boolean {
  return wave > 0 && wave % BOSS_EVERY === 0;
}

/** Round time limit for a castle with this many waves (generous: waves end when cleared). */
export function castleTimeLimit(waves: number): number {
  return waves * 55 + 30;
}

export interface WaveSpawn {
  kind: MonsterKind;
  count: number;
  /** HP multiplier (later stages are tougher). */
  hpMul: number;
}

/** Monsters of wave `wave` (1-based) for `players` players. Every 5th wave is the dragon. */
export function castleWave(wave: number, players: number): WaveSpawn[] {
  const stage = Math.floor((wave - 1) / BOSS_EVERY); // 0 for waves 1–5, 1 for 6–10…
  const hpMul = 1 + (wave - 1) * 0.25 + stage * 0.4;
  const n = Math.max(1, players);
  const count = (perPlayer: number) => Math.max(3, Math.round(perPlayer * n * (1 + (wave - 1) * 0.08 + stage * 0.2)));
  if (isBossWave(wave)) {
    const out: WaveSpawn[] = [{ kind: 'DRAGON', count: 1, hpMul: 1 + stage * 0.7 }];
    if (stage > 0) out.push({ kind: 'BAT', count: count(0.5 + stage * 0.25), hpMul });
    return out;
  }
  switch (wave % BOSS_EVERY) {
    case 1:
      return [{ kind: 'SLIME', count: count(3), hpMul }];
    case 2:
      return [{ kind: 'SLIME', count: count(1.8), hpMul }, { kind: 'SKELETON', count: count(1.6), hpMul }];
    case 3:
      return [{ kind: 'SKELETON', count: count(2), hpMul }, { kind: 'BAT', count: count(1.4), hpMul }];
    default:
      return [{ kind: 'SLIME', count: count(1.5), hpMul }, { kind: 'SKELETON', count: count(2), hpMul }, { kind: 'BAT', count: count(1.6), hpMul }];
  }
}

// --- Weapon rarity -----------------------------------------------------------------------------

export interface RarityInfo {
  name: string;
  color: string;
  /** Damage multiplier. */
  mul: number;
  /** Cooldown multiplier. */
  speed: number;
}

/** 0 Thường · 1 Hiếm · 2 Huyền thoại · 3 Truyền thuyết (unlocks the weapon's ultimate). */
export const RARITIES: readonly RarityInfo[] = [
  { name: 'Thường', color: '#d9d9e3', mul: 1, speed: 1 },
  { name: 'Hiếm', color: '#3aa0ff', mul: 1.3, speed: 1 },
  { name: 'Huyền thoại', color: '#c77dff', mul: 1.65, speed: 0.95 },
  { name: 'Truyền thuyết', color: '#ffb020', mul: 2.1, speed: 0.9 },
];
export const MAX_TIER = RARITIES.length - 1;

/** Drop rarity: better odds in later waves. `r` is a uniform random number in [0, 1). */
export function rollRarity(wave: number, r: number): number {
  const w = [Math.max(20, 65 - wave * 2.5), 25, 6 + wave, 0.5 + wave * 0.35];
  const total = w.reduce((a, b) => a + b, 0);
  let x = r * total;
  for (let i = 0; i < w.length; i++) {
    x -= w[i]!;
    if (x < 0) return i;
  }
  return MAX_TIER;
}

// --- Weapon skill cards (after each wave) -----------------------------------------------------

export type PerkId = 'POWER' | 'HASTE' | 'REACH' | 'CRIT' | 'FORGE';
export const PERK_IDS: readonly PerkId[] = ['POWER', 'HASTE', 'REACH', 'CRIT', 'FORGE'];
export const PERK_MAX = 3;

export interface PerkInfo {
  id: PerkId;
  name: string;
  color: string;
  desc: string;
  /** Ultimate unlocked at max level (none for FORGE). */
  ult?: { name: string; desc: string };
}

export const PERKS: Readonly<Record<PerkId, PerkInfo>> = {
  POWER: { id: 'POWER', name: 'Sức Mạnh', color: '#ff5a4f', desc: '+20% sát thương', ult: { name: 'Địa Chấn', desc: 'Dậm đất, quái quanh 6m văng & mất máu' } },
  HASTE: { id: 'HASTE', name: 'Tốc Đánh', color: '#ffd23f', desc: 'Đánh nhanh hơn 10%', ult: { name: 'Bão Đạn', desc: 'Bắn 12 tia ra mọi hướng' } },
  REACH: { id: 'REACH', name: 'Tầm Xa', color: '#3ad1ff', desc: '+25% tầm đánh; cấp 3: bắn xuyên', ult: { name: 'Mưa Tên', desc: 'Trúng mọi quái trong 15m (cả rồng bay)' } },
  CRIT: { id: 'CRIT', name: 'Chí Mạng', color: '#c77dff', desc: '+15% cơ hội x2 sát thương', ult: { name: 'Thiên Lôi', desc: 'Sét đánh 5 quái máu cao nhất' } },
  FORGE: { id: 'FORGE', name: 'Rèn Vũ Khí', color: '#ffb020', desc: 'Nâng vũ khí đang cầm lên 1 bậc (tối đa Huyền thoại)' },
};

export function isPerkId(v: unknown): v is PerkId {
  return typeof v === 'string' && (PERK_IDS as readonly string[]).includes(v);
}

/** "POWER:2,CRIT:1" → levels. */
export function parsePerks(s: string): Partial<Record<PerkId, number>> {
  const out: Partial<Record<PerkId, number>> = {};
  for (const part of s.split(',')) {
    const [id, lv] = part.split(':');
    if (isPerkId(id)) out[id] = Math.max(0, Math.min(PERK_MAX, Number(lv) || 0));
  }
  return out;
}

export function formatPerks(p: Partial<Record<PerkId, number>>): string {
  return PERK_IDS.filter((id) => (p[id] ?? 0) > 0).map((id) => `${id}:${p[id]}`).join(',');
}

/** Each weapon's own ultimate when it is Truyền thuyết. */
export const WEAPON_ULT: Readonly<Record<WeaponId, PerkId>> = { FIST: 'POWER', SWORD: 'POWER', SPEAR: 'CRIT', BOW: 'REACH', GUN: 'HASTE' };

/** Ultimates this player can fire (all maxed perk lines, plus the weapon's own at Truyền thuyết). */
export function ultimatesFor(perks: Partial<Record<PerkId, number>>, weapon: WeaponId, tier: number): PerkId[] {
  const out = PERK_IDS.filter((id) => id !== 'FORGE' && (perks[id] ?? 0) >= PERK_MAX);
  if (tier >= MAX_TIER && weapon !== 'FIST' && !out.includes(WEAPON_ULT[weapon])) out.push(WEAPON_ULT[weapon]);
  return out;
}

/** Damage dealt that fills the rage meter once (then the next attack fires the ultimate). */
export const RAGE_DAMAGE = 45;

/** Ultimate tuning (damage before rarity/power multipliers). */
export const ULT = {
  quakeRadius: 6,
  quakeDamage: 6,
  fanShots: 12,
  fanRange: 12,
  fanDamage: 4,
  rainRange: 15,
  rainDamage: 4,
  boltTargets: 5,
  boltDamage: 12,
} as const;

export interface WeaponStats {
  damage: number;
  cooldown: number;
  range: number;
  arc: number;
  ranged: boolean;
  crit: number;
  pierce: boolean;
  /** Multiplier for ultimates. */
  power: number;
}

export function weaponStats(weapon: WeaponId, tier: number, perks: Partial<Record<PerkId, number>>): WeaponStats {
  const w = WEAPONS[weapon];
  const r = RARITIES[Math.max(0, Math.min(MAX_TIER, tier))]!;
  const power = r.mul * (1 + 0.2 * (perks.POWER ?? 0));
  const reach = 1 + 0.25 * (perks.REACH ?? 0);
  return {
    damage: w.damage * power,
    cooldown: w.cooldown * r.speed * (1 - 0.1 * (perks.HASTE ?? 0)),
    range: w.range * reach,
    arc: w.arc,
    ranged: w.ranged,
    crit: 0.15 * (perks.CRIT ?? 0),
    pierce: (perks.REACH ?? 0) >= PERK_MAX,
    power,
  };
}

/** Dragon boss rhythm. */
export const DRAGON = {
  hpPerPlayer: 160,
  /** Circles in the air for this long, then lands. */
  flySeconds: 7,
  landSeconds: 6,
  /** Fire breath (while landed): starts this long after landing, lasts breathSeconds. */
  breathDelay: 2,
  breathSeconds: 1.5,
  breathRange: 8,
  breathArc: 0.5,
  /** Points for damage dealt to the boss (per hp) and for the final blow. */
  pointsPerHp: 0.3,
  killBonus: 10,
} as const;

/** Monster contact with players: knockback speed and stun. */
export const MONSTER_HIT = { knockback: 9, stun: 0.6, cooldown: 1.4 } as const;

export function createCastleWorld(): SimWorld {
  const h = CASTLE.halfWidth;
  const boxes: Box[] = [
    // Castle wall behind the gate (players stay in the courtyard).
    { minX: -h, maxX: h, minZ: CASTLE.gateZ + 0.5, maxZ: CASTLE.gateZ + 2, top: 4 },
    // A few low walls to fight around.
    { minX: -9, maxX: -5, minZ: -4, maxZ: -3, top: 1 },
    { minX: 5, maxX: 9, minZ: -4, maxZ: -3, top: 1 },
    { minX: -2, maxX: 2, minZ: -14, maxZ: -13, top: 1 },
  ];
  return { bounds: { minX: -h, maxX: h, minZ: CASTLE.spawnZ - 4, maxZ: CASTLE.gateZ + 0.5 }, boxes, killY: -10 };
}

export function castleStep(world: SimWorld): StepFn {
  return staticWorldStep(world);
}

export function castleSpawn(slot: number): { x: number; z: number; yaw: number } {
  return { x: -4.5 + slot * 3, z: CASTLE.gateZ - 7, yaw: Math.PI };
}
