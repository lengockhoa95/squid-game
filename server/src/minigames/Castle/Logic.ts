import {
  CASTLE, DRAGON, DROP_WEAPONS, MAX_TIER, MONSTERS, MONSTER_HIT, PERK_IDS, PERK_MAX, RAGE_DAMAGE, ULT,
  castleSpawn, castleStep, castleTimeLimit, castleWave, castleWaveCount, createCastleWorld, formatPerks,
  isPerkId, isWeaponId, parsePerks, rollRarity, ultimatesFor, weaponStats,
  type GameAction, type MonsterKind, type PerkId, type StepFn, type WeaponId,
} from '@sp/shared';
import { CastleState, Monster, WeaponPickup } from '@sp/shared/schema';
import type { GamePlayer, MinigameContext, RoundOutcome, ServerMinigame } from '../framework/types.ts';

interface MonsterBrain {
  m: Monster;
  /** Next time this monster may hit a player. */
  hitReady: number;
  /** Death animation end (then removed). */
  removeAt: number;
  // Dragon only
  phase?: 'FLY' | 'LAND';
  phaseUntil?: number;
  angle?: number;
  breathAt?: number;
  breathYaw?: number;
}

const DIE_SECONDS = 1.2;
const DRAGON_CIRCLE = 10;

/**
 * Thủ Thành: monsters come in waves toward the gate; players fight them with fists or dropped
 * weapons (right click). Every 5th wave is the dragon boss; the host picks how many waves.
 * Between waves everyone picks a weapon skill card; maxed lines (and Truyền thuyết weapons)
 * unlock ultimates, fired when the rage meter is full. Players are never eliminated by
 * monsters (only knocked back and stunned); the round ranks by points.
 * PlayerState.score = points (kills, boss damage).
 */
export class Castle implements ServerMinigame {
  readonly id = 'CASTLE' as const;
  private readonly world = createCastleWorld();
  readonly step: StepFn = castleStep(this.world);
  readonly bounds = this.world.bounds;
  private ctx!: MinigameContext;
  private state!: CastleState;
  private brains: MonsterBrain[] = [];
  private pending: Array<{ at: number; kind: MonsterKind; hpMul: number }> = [];
  private waves = 10;
  /** WAVE = monsters on the field; BREAK = between waves (cards). */
  private mode: 'BREAK' | 'WAVE' = 'BREAK';
  private cleared = false;
  /** No weapon swap right after picking one up (two drops on one spot would ping-pong). */
  private readonly swapReady = new Map<string, number>();
  timeLimit = castleTimeLimit(10);
  private nextId = 1;
  private readonly attackReady = new Map<string, number>();
  private readonly points = new Map<string, number>();
  private readonly kills = new Map<string, number>();
  private readonly pickupExpire = new Map<number, number>();
  private bossKills = 0;
  private elapsed = 0;

  initialize(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.state = new CastleState();
    this.state.gate = CASTLE.gateHp;
    this.state.gateMax = CASTLE.gateHp;
    this.waves = castleWaveCount(ctx.match.castleWaves);
    this.timeLimit = castleTimeLimit(this.waves);
    this.state.waves = this.waves;
    this.state.wave = 0;
    this.state.breakUntil = CASTLE.prepSeconds;
    ctx.match.castle = this.state;
    for (const p of ctx.players) {
      const s = castleSpawn(p.state.slot);
      p.sim.reset(s.x, s.z, s.yaw);
      this.resetPlayer(p);
      p.state.score = 0;
      this.points.set(p.id, 0);
    }
  }

  start(): void {}

  handlePlayerInput(_playerId: string, _action: GameAction): void {
    // Movement + ATTACK messages.
  }

  handleAttack(id: string, t: number): void {
    const p = this.ctx.players.find((pl) => pl.id === id);
    if (!p || p.state.roundState !== 'ACTIVE' || t < (this.attackReady.get(id) ?? 0)) return;
    const weapon: WeaponId = isWeaponId(p.state.weapon) ? p.state.weapon : 'FIST';
    const perks = parsePerks(p.state.perks);
    const w = weaponStats(weapon, p.state.weaponTier, perks);
    this.attackReady.set(id, t + w.cooldown);
    // Full rage + an unlocked ultimate: this attack also fires it.
    const ults = ultimatesFor(perks, weapon, p.state.weaponTier);
    if (p.state.rage >= 1 && ults.length > 0) {
      p.state.rage = 0;
      for (const u of ults) this.ultimate(u, p, w.power, t);
    }
    const s = p.sim.state;
    const fx = Math.sin(s.yaw);
    const fz = Math.cos(s.yaw);
    const roll = () => (this.ctx.rng() < w.crit ? w.damage * 2 : w.damage);
    if (w.ranged) {
      // First monster along the shot line (all of them with a piercing shot).
      const hits: Array<{ b: MonsterBrain; along: number }> = [];
      for (const b of this.alive()) {
        const dx = b.m.x - s.x;
        const dz = b.m.z - s.z;
        const along = dx * fx + dz * fz;
        if (along < 0 || along > w.range) continue;
        const off = Math.abs(dx * fz - dz * fx);
        if (off > MONSTERS[b.m.kind as MonsterKind].radius + 0.4) continue;
        hits.push({ b, along });
      }
      hits.sort((a, b) => a.along - b.along);
      const struck = w.pierce ? hits : hits.slice(0, 1);
      const reach = w.pierce || struck.length === 0 ? w.range : struck[0]!.along;
      this.ctx.flash?.('SHOT', id, s.x, s.z, s.x + fx * reach, s.z + fz * reach);
      for (const h of struck) this.damage(h.b, roll(), p, t);
      return;
    }
    this.ctx.flash?.('SLASH', id, s.x, s.z, s.x + fx * w.range, s.z + fz * w.range);
    for (const b of this.alive()) {
      const info = MONSTERS[b.m.kind as MonsterKind];
      if (b.m.y > 2.4) continue; // flying out of reach (the dragon in the air)
      const dx = b.m.x - s.x;
      const dz = b.m.z - s.z;
      const d = Math.hypot(dx, dz);
      if (d > w.range + info.radius) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / (d || 1))));
      if (d > info.radius && ang > w.arc) continue;
      this.damage(b, roll(), p, t);
      if (b.m.kind !== 'DRAGON' && d > 0.01) {
        b.m.x += (dx / d) * 0.8; // knocked back a little
        b.m.z += (dz / d) * 0.8;
      }
    }
  }

  /** Weapon card pick between waves. */
  handlePick(id: string, choice: string): void {
    const p = this.ctx.players.find((pl) => pl.id === id);
    if (!p || !isPerkId(choice) || !p.state.perkOffer.split(',').includes(choice)) return;
    this.applyPerk(p, choice);
    p.state.perkOffer = '';
  }

  /** Public for bots and tests. */
  offerOf(id: string): PerkId[] {
    const p = this.ctx.players.find((pl) => pl.id === id);
    return p ? p.state.perkOffer.split(',').filter(isPerkId) : [];
  }

  update(dt: number, t: number): void {
    this.elapsed = t;
    this.waveFlow(t);
    this.spawnPending(t);
    const active = this.ctx.players.filter((p) => p.state.roundState === 'ACTIVE');
    for (const b of this.brains) {
      if (b.m.state === 'DIE') continue;
      if (b.m.kind === 'DRAGON') this.dragon(b, active, dt, t);
      else this.walker(b, active, dt, t);
    }
    this.separate();
    // Remove the dead after their death animation.
    for (let i = this.brains.length - 1; i >= 0; i--) {
      const b = this.brains[i]!;
      if (b.m.state === 'DIE' && t >= b.removeAt) {
        this.brains.splice(i, 1);
        const idx = this.state.monsters.indexOf(b.m);
        if (idx >= 0) this.state.monsters.splice(idx, 1);
      }
    }
    this.pickups(active, t);
    for (const p of this.ctx.players) p.state.score = Math.floor(this.points.get(p.id) ?? 0);
  }

  /** Public for bots: living monsters and weapon pickups (everyone sees them). */
  view(): { monsters: readonly Monster[]; pickups: readonly WeaponPickup[] } {
    return { monsters: this.alive().map((b) => b.m), pickups: [...this.state.pickups] };
  }

  getState(): CastleState {
    return this.state;
  }

  isFinished(): boolean {
    return this.cleared || this.state.gate <= 0 || this.ctx.players.every((p) => p.state.roundState !== 'ACTIVE');
  }

  finish(): RoundOutcome {
    const ranking = [...this.ctx.players].sort((a, b) => (this.points.get(b.id) ?? 0) - (this.points.get(a.id) ?? 0)).map((p) => p.id);
    const passed = new Set(ranking);
    if (ranking.length > 1) passed.delete(ranking[ranking.length - 1]!);
    const details = new Map<string, string>();
    const end = this.cleared
      ? ` · thủ thành thành công ${this.waves} đợt!`
      : this.state.gate <= 0
        ? ` · cổng sập ở đợt ${this.state.wave}`
        : ` · tới đợt ${this.state.wave}/${this.waves}`;
    for (const p of this.ctx.players) {
      details.set(p.id, `${Math.floor(this.points.get(p.id) ?? 0)} điểm · diệt ${this.kills.get(p.id) ?? 0} quái${end}`);
    }
    return { ranking, passed, details };
  }

  dispose(): void {
    for (const p of this.ctx.players) this.resetPlayer(p);
    this.ctx.match.castle = undefined;
  }

  // --- monsters ------------------------------------------------------------------------------

  private alive(): MonsterBrain[] {
    return this.brains.filter((b) => b.m.state !== 'DIE');
  }

  /** BREAK → next wave once the timer runs out (or everyone picked); WAVE → BREAK once cleared. */
  private waveFlow(t: number): void {
    const st = this.state;
    if (this.mode === 'BREAK') {
      const waiting = this.ctx.players.some((p) => p.state.roundState === 'ACTIVE' && p.state.perkOffer !== '');
      if (st.wave > 0 && !waiting) st.breakUntil = Math.min(st.breakUntil, t + 1.2);
      if (t < st.breakUntil) return;
      // Anyone who didn't pick gets the first card.
      for (const p of this.ctx.players) {
        const first = this.offerOf(p.id)[0];
        if (first) this.applyPerk(p, first);
        p.state.perkOffer = '';
      }
      st.wave++;
      st.breakUntil = 0;
      this.mode = 'WAVE';
      for (const sp of castleWave(st.wave, this.ctx.players.length)) {
        for (let i = 0; i < sp.count; i++) this.pending.push({ at: t + i * 0.6, kind: sp.kind, hpMul: sp.hpMul });
      }
      return;
    }
    if (this.pending.length > 0 || this.brains.some((b) => b.m.state !== 'DIE')) return;
    if (st.wave >= this.waves) {
      this.cleared = true;
      return;
    }
    // Wave cleared: repair the gate a bit and deal weapon cards.
    this.mode = 'BREAK';
    st.breakUntil = t + CASTLE.breakSeconds;
    st.gate = Math.min(st.gateMax, st.gate + st.gateMax * CASTLE.gateRepair);
    for (const p of this.ctx.players) {
      if (p.state.roundState === 'ACTIVE') p.state.perkOffer = this.dealPerks(p).join(',');
    }
  }

  private dealPerks(p: GamePlayer): PerkId[] {
    const perks = parsePerks(p.state.perks);
    const pool = PERK_IDS.filter((id) =>
      // Forging stops at Huyền thoại: Truyền thuyết only drops (bosses, late waves).
      id === 'FORGE' ? isWeaponId(p.state.weapon) && p.state.weapon !== 'FIST' && p.state.weaponTier < MAX_TIER - 1 : (perks[id] ?? 0) < PERK_MAX,
    );
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.ctx.rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool.slice(0, 3);
  }

  private applyPerk(p: GamePlayer, perk: PerkId): void {
    if (perk === 'FORGE') {
      p.state.weaponTier = Math.min(MAX_TIER - 1, p.state.weaponTier + 1);
      return;
    }
    const perks = parsePerks(p.state.perks);
    perks[perk] = Math.min(PERK_MAX, (perks[perk] ?? 0) + 1);
    p.state.perks = formatPerks(perks);
  }

  private resetPlayer(p: GamePlayer): void {
    p.state.weapon = '';
    p.state.weaponTier = 0;
    p.state.perks = '';
    p.state.perkOffer = '';
    p.state.rage = 0;
  }

  private ultimate(kind: PerkId, p: GamePlayer, power: number, t: number): void {
    const s = p.sim.state;
    const near = (r: number) => this.alive().filter((b) => Math.hypot(b.m.x - s.x, b.m.z - s.z) <= r + MONSTERS[b.m.kind as MonsterKind].radius);
    switch (kind) {
      case 'POWER': // Địa Chấn: everything around (not the dragon in the air) is blasted back.
        this.ctx.flash?.('QUAKE', p.id, s.x, s.z);
        for (const b of near(ULT.quakeRadius)) {
          if (b.m.y > 2.4) continue;
          this.damage(b, ULT.quakeDamage * power, p, t, true);
          const dx = b.m.x - s.x;
          const dz = b.m.z - s.z;
          const d = Math.hypot(dx, dz) || 1;
          if (b.m.kind !== 'DRAGON') {
            b.m.x += (dx / d) * 2.5;
            b.m.z += (dz / d) * 2.5;
          }
        }
        break;
      case 'HASTE': // Bão Đạn: 12 shots all around.
        for (let i = 0; i < ULT.fanShots; i++) {
          const a = s.yaw + (i / ULT.fanShots) * Math.PI * 2;
          const fx = Math.sin(a);
          const fz = Math.cos(a);
          let best: MonsterBrain | null = null;
          let bestT: number = ULT.fanRange;
          for (const b of this.alive()) {
            const dx = b.m.x - s.x;
            const dz = b.m.z - s.z;
            const along = dx * fx + dz * fz;
            if (along < 0 || along > bestT || Math.abs(dx * fz - dz * fx) > MONSTERS[b.m.kind as MonsterKind].radius + 0.5) continue;
            best = b;
            bestT = along;
          }
          this.ctx.flash?.('SHOT', p.id, s.x, s.z, s.x + fx * bestT, s.z + fz * bestT);
          if (best) this.damage(best, ULT.fanDamage * power, p, t, true);
        }
        break;
      case 'REACH': // Mưa Tên: every monster in range, flying ones too.
        for (const b of near(ULT.rainRange)) {
          this.ctx.flash?.('SHOT', p.id, s.x, s.z, b.m.x, b.m.z);
          this.damage(b, ULT.rainDamage * power, p, t, true);
        }
        break;
      case 'CRIT': // Thiên Lôi: the 5 toughest monsters anywhere.
        for (const b of [...this.alive()].sort((a, c) => c.m.hp - a.m.hp).slice(0, ULT.boltTargets)) {
          this.ctx.flash?.('BOLT', p.id, b.m.x, b.m.z);
          this.damage(b, ULT.boltDamage * power, p, t, true);
        }
        break;
      case 'FORGE':
        break;
    }
  }

  private spawnPending(t: number): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const pd = this.pending[i]!;
      if (t < pd.at) continue;
      this.spawn(pd.kind, t, pd.hpMul);
      this.pending.splice(i, 1);
    }
  }

  private spawn(kind: MonsterKind, t: number, hpMul = 1): void {
    const info = MONSTERS[kind];
    const m = new Monster();
    m.id = this.nextId++;
    m.kind = kind;
    m.x = (this.ctx.rng() * 2 - 1) * (CASTLE.halfWidth - 3);
    m.z = CASTLE.spawnZ;
    m.y = info.fly;
    m.yaw = 0;
    m.maxHp = Math.round((kind === 'DRAGON' ? DRAGON.hpPerPlayer * this.ctx.players.length : info.hp) * hpMul);
    m.hp = m.maxHp;
    m.state = kind === 'DRAGON' ? 'FLY' : 'WALK';
    this.state.monsters.push(m);
    const b: MonsterBrain = { m, hitReady: t + 1, removeAt: 0 };
    if (kind === 'DRAGON') {
      b.phase = 'FLY';
      b.phaseUntil = t + DRAGON.flySeconds;
      b.angle = 0;
    }
    this.brains.push(b);
  }

  /** Slimes/skeletons walk to the gate; bats hunt players. Contact knocks players back. */
  private walker(b: MonsterBrain, players: readonly GamePlayer[], dt: number, t: number): void {
    const m = b.m;
    const info = MONSTERS[m.kind as MonsterKind];
    let tx = m.x;
    let tz = CASTLE.gateZ - info.radius;
    const prey = this.nearest(players, m.x, m.z, info.huntsPlayers ? 99 : 2.5);
    if (prey) {
      tx = prey.sim.state.x;
      tz = prey.sim.state.z;
    }
    const dx = tx - m.x;
    const dz = tz - m.z;
    const d = Math.hypot(dx, dz);
    const atGate = !info.huntsPlayers && m.z >= CASTLE.gateZ - info.radius - 0.05 && !prey;
    if (atGate) {
      m.state = 'ATTACK';
      this.state.gate = Math.max(0, this.state.gate - info.gateDps * dt);
      if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) this.ctx.flash?.('GATE_HIT', '', m.x, CASTLE.gateZ);
    } else if (d > 0.3) {
      m.state = 'WALK';
      const step = Math.min(d, info.speed * dt);
      m.x += (dx / d) * step;
      m.z += (dz / d) * step;
      m.yaw = Math.atan2(dx, dz);
    }
    if (info.fly) m.y = info.fly + Math.sin(t * 4 + m.id) * 0.25;
    // Contact hit on players.
    if (prey && t >= b.hitReady) {
      const ps = prey.sim.state;
      const pd = Math.hypot(ps.x - m.x, ps.z - m.z);
      if (pd < info.radius + 0.6 && Math.abs(ps.y + 0.8 - m.y) < 1.6) {
        b.hitReady = t + MONSTER_HIT.cooldown;
        m.state = 'ATTACK';
        this.hitPlayer(prey, m.x, m.z, t, MONSTER_HIT.knockback, MONSTER_HIT.stun);
      }
    }
  }

  /** Dragon: circle in the air, land near the players, breathe fire, take off again. */
  private dragon(b: MonsterBrain, players: readonly GamePlayer[], dt: number, t: number): void {
    const m = b.m;
    if (b.phase === 'FLY') {
      b.angle = (b.angle ?? 0) + dt * 0.5;
      const tx = Math.cos(b.angle) * DRAGON_CIRCLE;
      const tz = -4 + Math.sin(b.angle) * DRAGON_CIRCLE;
      this.moveToward(m, tx, tz, MONSTERS.DRAGON.speed * 1.5, dt);
      m.y += (MONSTERS.DRAGON.fly - m.y) * Math.min(1, dt * 1.5);
      m.state = 'FLY';
      if (t >= (b.phaseUntil ?? 0)) {
        b.phase = 'LAND';
        b.phaseUntil = t + DRAGON.landSeconds;
        b.breathAt = t + DRAGON.breathDelay;
      }
      return;
    }
    // Landed (vulnerable to melee).
    const prey = this.nearest(players, m.x, m.z, 99);
    m.y += (0 - m.y) * Math.min(1, dt * 3);
    if (prey && m.y < 0.6) {
      const dx = prey.sim.state.x - m.x;
      const dz = prey.sim.state.z - m.z;
      if (t < (b.breathAt ?? 0)) {
        m.yaw = Math.atan2(dx, dz);
        m.state = 'LAND';
        if (Math.hypot(dx, dz) > 5) this.moveToward(m, prey.sim.state.x, prey.sim.state.z, MONSTERS.DRAGON.speed * 0.6, dt);
      } else if (t < (b.breathAt ?? 0) + DRAGON.breathSeconds) {
        if (m.state !== 'BREATH') {
          m.state = 'BREATH';
          b.breathYaw = m.yaw;
          const by = b.breathYaw;
          this.ctx.flash?.('BREATH', '', m.x, m.z, m.x + Math.sin(by) * DRAGON.breathRange, m.z + Math.cos(by) * DRAGON.breathRange);
        }
        // Fire cone: knock players inside back and stun them.
        for (const p of players) {
          const ps = p.sim.state;
          const px = ps.x - m.x;
          const pz = ps.z - m.z;
          const pdist = Math.hypot(px, pz);
          if (pdist > DRAGON.breathRange || t < p.state.stunUntil) continue;
          const ang = Math.acos(Math.max(-1, Math.min(1, (px * Math.sin(b.breathYaw!) + pz * Math.cos(b.breathYaw!)) / (pdist || 1))));
          if (ang < DRAGON.breathArc) this.hitPlayer(p, m.x, m.z, t, 12, 1.4);
        }
      } else {
        m.state = 'LAND';
      }
    }
    if (t >= (b.phaseUntil ?? 0)) {
      b.phase = 'FLY';
      b.phaseUntil = t + DRAGON.flySeconds;
      b.angle = Math.atan2(m.z + 4, m.x);
    }
  }

  /** `fromUlt`: ultimate damage does not refill rage (no ultimate chains). */
  private damage(b: MonsterBrain, amount: number, by: GamePlayer, t: number, fromUlt = false): void {
    const m = b.m;
    const dealt = Math.min(m.hp, amount);
    m.hp -= dealt;
    m.hitAt = t;
    if (!fromUlt) by.state.rage = Math.min(1, by.state.rage + dealt / RAGE_DAMAGE);
    if (m.kind === 'DRAGON') this.addPoints(by.id, dealt * DRAGON.pointsPerHp);
    if (m.hp > 0) return;
    m.state = 'DIE';
    b.removeAt = t + DIE_SECONDS;
    this.kills.set(by.id, (this.kills.get(by.id) ?? 0) + 1);
    if (m.kind === 'DRAGON') {
      this.addPoints(by.id, DRAGON.killBonus);
      this.bossKills++;
      // Boss loot: one Huyền thoại+ weapon per player around the corpse.
      const n = this.ctx.players.length;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const tier = this.ctx.rng() < 0.35 + this.bossKills * 0.15 ? MAX_TIER : MAX_TIER - 1;
        this.drop(m.x + Math.cos(a) * 2.5, m.z + Math.sin(a) * 2.5, tier, t);
      }
      return;
    }
    this.addPoints(by.id, MONSTERS[m.kind as MonsterKind].points);
    if (this.ctx.rng() < CASTLE.dropChance) this.drop(m.x, m.z, rollRarity(this.state.wave, this.ctx.rng()), t);
  }

  private drop(x: number, z: number, tier: number, t: number): void {
    const h = CASTLE.halfWidth - 1;
    const drop = new WeaponPickup();
    drop.id = this.nextId++;
    drop.weapon = DROP_WEAPONS[Math.floor(this.ctx.rng() * DROP_WEAPONS.length)]!;
    drop.tier = tier;
    drop.x = Math.max(-h, Math.min(h, x));
    drop.z = Math.max(CASTLE.spawnZ, Math.min(z, CASTLE.gateZ - 1));
    this.state.pickups.push(drop);
    this.pickupExpire.set(drop.id, t + CASTLE.pickupSeconds * (tier >= MAX_TIER - 1 ? 2 : 1));
  }

  private pickups(players: readonly GamePlayer[], t: number): void {
    const list = this.state.pickups;
    for (let i = list.length - 1; i >= 0; i--) {
      const pk = list[i]!;
      if (!this.pickupExpire.has(pk.id)) this.pickupExpire.set(pk.id, t + CASTLE.pickupSeconds);
      if (t >= this.pickupExpire.get(pk.id)!) {
        list.splice(i, 1);
        continue;
      }
      // Walk over to take it — unless it is worse than what you hold (no accidental downgrades).
      const taker = players.find((p) => {
        if (Math.hypot(p.sim.state.x - pk.x, p.sim.state.z - pk.z) >= CASTLE.pickupRadius) return false;
        if (t < (this.swapReady.get(p.id) ?? 0)) return false;
        const bare = !isWeaponId(p.state.weapon) || p.state.weapon === 'FIST';
        return bare || pk.tier > p.state.weaponTier || (pk.tier === p.state.weaponTier && pk.weapon !== p.state.weapon);
      });
      if (!taker) continue;
      taker.state.weapon = pk.weapon;
      taker.state.weaponTier = pk.tier;
      this.swapReady.set(taker.id, t + 1.5);
      list.splice(i, 1);
    }
  }

  private hitPlayer(p: GamePlayer, fromX: number, fromZ: number, t: number, speed: number, stun: number): void {
    const s = p.sim.state;
    const dx = s.x - fromX;
    const dz = s.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    s.vx = (dx / d) * speed;
    s.vz = (dz / d) * speed;
    s.vy = 5;
    s.grounded = false;
    p.state.stunUntil = Math.max(p.state.stunUntil, t + stun);
  }

  private nearest(players: readonly GamePlayer[], x: number, z: number, within: number): GamePlayer | null {
    let best: GamePlayer | null = null;
    let bestD = within;
    for (const p of players) {
      const d = Math.hypot(p.sim.state.x - x, p.sim.state.z - z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private moveToward(m: Monster, x: number, z: number, speed: number, dt: number): void {
    const dx = x - m.x;
    const dz = z - m.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const step = Math.min(d, speed * dt);
    m.x += (dx / d) * step;
    m.z += (dz / d) * step;
    m.yaw = Math.atan2(dx, dz);
  }

  /** Keep walkers from stacking into one blob. */
  private separate(): void {
    const list = this.alive().filter((b) => b.m.kind !== 'DRAGON');
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!.m;
        const b = list[j]!.m;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = MONSTERS[a.kind as MonsterKind].radius + MONSTERS[b.kind as MonsterKind].radius;
        if (d >= min || d < 1e-4) continue;
        const push = (min - d) / 2;
        a.x -= (dx / d) * push;
        a.z -= (dz / d) * push;
        b.x += (dx / d) * push;
        b.z += (dz / d) * push;
      }
    }
    const h = CASTLE.halfWidth - 0.5;
    for (const b of list) b.m.x = Math.max(-h, Math.min(h, b.m.x));
  }

  private addPoints(id: string, n: number): void {
    this.points.set(id, (this.points.get(id) ?? 0) + n);
  }
}
