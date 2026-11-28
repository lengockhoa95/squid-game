import {
  ARCHER_AI, BOMBER_AI, BOSS_HP_PER_PLAYER, CASTLE, DRAGON, DROP_WEAPONS, ELEMENT_FX, ELITE, ELITE_AFFIXES, ENRAGE, HOOK,
  KEEP, MAP, MAX_TIER, MINOTAUR, MOAT, MONSTERS, MONSTER_HIT, PERK_IDS, PERK_MAX, PIT, PLAYER_HP, RAGE_DAMAGE, SHIELD_AI, SKILL,
  SLIME_KING, ULT,
  castleSpawn, castleStep, castleTimeLimit, castleWave, castleWaveCount, createCastleWorld, eliteChance, formatPerks, inMoat,
  isBoss, isPerkId, isWeaponId, parsePerks, pitTileAt, rayBox, rollRarity, sideFrame, sidePoint, ultimatesFor, weaponStats,
  type Box, type EliteAffix, type GameAction, type MonsterKind, type PerkId, type StepFn, type WeaponId,
} from '@sp/shared';
import { CastleState, Monster, WeaponPickup } from '@sp/shared/schema';
import type { GamePlayer, MinigameContext, RoundOutcome, ServerMinigame } from '../framework/types.ts';
import { CastleHazards, type MoatPrey } from './Hazards.ts';

interface MonsterBrain {
  m: Monster;
  /** Which gate (side) this monster attacks. */
  side: number;
  /** Lateral offset it lines up on at its gate (spreads the crowd). */
  lane: number;
  /** Inside the castle walls (came through a broken gate). */
  inside: boolean;
  hitReady: number;
  removeAt: number;
  stunUntil: number;
  confusedUntil: number;
  wanderYaw: number;
  elite: EliteAffix | '';
  speedMul: number;
  // Dragon
  phase?: 'FLY' | 'LAND';
  phaseUntil?: number;
  angle?: number;
  breathAt?: number;
  breathYaw?: number;
  // Minotaur / Vua Slime
  bossPhase?: 'CHASE' | 'WIND' | 'CHARGE' | 'HOP';
  bossUntil?: number;
  chargeYaw?: number;
  hopFromX?: number;
  hopFromZ?: number;
  hopToX?: number;
  hopToZ?: number;
  splits?: number;
  hitIds?: Set<string>;
  // Archer / bomber
  shootReady?: number;
  fuseAt?: number;
}

/** Elements against monsters (Thủ Thành). */
const PVE = {
  thunderRadius: 3.5,
  thunderDamage: 5,
  thunderStun: 2,
  windRadius: 5,
  windPush: 4,
  windDamage: 2,
  swapRadius: 4,
  darkConfuse: 3.5,
  pillarDamage: 4,
  puddleSlow: 0.35,
  fireMul: 1.5,
} as const;

const DIE_SECONDS = 1.2;
const DRAGON_CIRCLE = 24;
/** Model heights (centre of a monster = y + height / 2 × scale). */
const HEIGHT: Record<MonsterKind, number> = {
  SLIME: 0.9, SKELETON: 1.6, BAT: 0.9, ARCHER: 1.6, SHIELD: 1.6, BOMBER: 0.9, DRAGON: 3.6, MINOTAUR: 4.5, SLIME_KING: 2.8,
};

interface Tornado {
  owner: GamePlayer;
  x: number;
  z: number;
  dx: number;
  dz: number;
  until: number;
  damage: number;
  hit: Set<number>;
}

interface Arrow {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  until: number;
}

/**
 * Thủ Thành ("bao vây 4 phía"): the castle stands in the middle with a gate on every side and a
 * keep at the heart; monsters pour in from four lairs, mostly from one or two sides per wave.
 * When a gate breaks they run for the keep — the castle falls with the keep. Players fight with
 * dropped weapons (aimed in 3D), elements, weapon cards and ultimates, climb the walls (stairs,
 * jump pads, double jump or the grappling hook) and revive each other. Ranked by points.
 */
export class Castle implements ServerMinigame {
  readonly id = 'CASTLE' as const;
  private readonly cw = createCastleWorld();
  readonly step: StepFn = castleStep(this.cw);
  readonly bounds = this.cw.world.bounds;
  timeLimit = castleTimeLimit(10);
  private ctx!: MinigameContext;
  private state!: CastleState;
  private hazards!: CastleHazards;
  private brains: MonsterBrain[] = [];
  private pending: Array<{ at: number; kind: MonsterKind; hpMul: number; side: number }> = [];
  private waves = 10;
  private mode: 'BREAK' | 'WAVE' = 'BREAK';
  private cleared = false;
  private nextId = 1;
  private bossKills = 0;
  private readonly tornadoes: Tornado[] = [];
  private readonly arrows: Arrow[] = [];
  private readonly swings = new Map<string, number>();
  private readonly attackReady = new Map<string, number>();
  private readonly hookReady = new Map<string, number>();
  private readonly swapReady = new Map<string, number>();
  private readonly points = new Map<string, number>();
  private readonly kills = new Map<string, number>();
  private readonly pickupExpire = new Map<number, number>();
  private readonly hurtAt = new Map<string, number>();
  private readonly downAt = new Map<string, number>();
  private readonly downs = new Map<string, number>();
  private readonly regen = new Map<string, number>();
  /** Element field read each tick (Đất, Nước, Phân thân). */
  private pillars: Array<{ x: number; z: number }> = [];
  private puddles: Array<{ x: number; z: number }> = [];
  private clones: Array<{ x: number; z: number }> = [];
  private readonly seenPillars = new Set<number>();
  /** Ledges the hook can grab (everything standing above the ground). */
  private readonly ledges: Box[];

  constructor() {
    this.ledges = this.cw.world.boxes.filter((b) => b.top > 0.5 && b.bottom === undefined);
  }

  initialize(ctx: MinigameContext): void {
    this.ctx = ctx;
    this.state = new CastleState();
    for (let i = 0; i < 4; i++) this.state.gates.push(CASTLE.gateHp);
    this.state.gateMax = CASTLE.gateHp;
    this.state.keep = CASTLE.keepHp;
    this.state.keepMax = CASTLE.keepHp;
    this.waves = castleWaveCount(ctx.match.castleWaves);
    this.timeLimit = castleTimeLimit(this.waves);
    this.state.waves = this.waves;
    this.state.wave = 0;
    this.state.breakUntil = CASTLE.prepSeconds;
    this.state.sides = '';
    this.hazards = new CastleHazards(this.state, this.cw, ctx.rng);
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
    // Movement + ATTACK / HOOK messages.
  }

  // --- attacks -------------------------------------------------------------------------------

  handleAttack(id: string, t: number, aimYaw?: number, aimPitch?: number): void {
    const p = this.player(id);
    if (!p || p.state.roundState !== 'ACTIVE' || p.state.downed || t < (this.attackReady.get(id) ?? 0)) return;
    const weapon: WeaponId = isWeaponId(p.state.weapon) ? p.state.weapon : 'FIST';
    const perks = parsePerks(p.state.perks);
    const w = weaponStats(weapon, p.state.weaponTier, perks);
    this.attackReady.set(id, t + w.cooldown);
    const ults = ultimatesFor(perks, weapon, p.state.weaponTier);
    if (p.state.rage >= 1 && ults.length > 0) {
      p.state.rage = 0;
      for (const u of ults) this.ultimate(u, p, w.power, t);
    }
    const s = p.sim.state;
    const yaw = aimYaw !== undefined && Number.isFinite(aimYaw) ? aimYaw : s.yaw;
    const pitch = Math.max(-1.2, Math.min(1.4, aimPitch !== undefined && Number.isFinite(aimPitch) ? aimPitch : 0));
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const fire = t < p.state.hasteUntil ? PVE.fireMul : 1;
    const roll = (): { dmg: number; crit: boolean } => {
      const crit = this.ctx.rng() < w.crit;
      return { dmg: (crit ? w.damage * 2 : w.damage) * fire, crit };
    };
    const eyeY = s.y + 1.0;
    if (w.ranged) {
      // A 3D ray: aim up to hit the dragon in the sky.
      const cp = Math.cos(pitch);
      const dx = fx * cp;
      const dy = Math.sin(pitch);
      const dz = fz * cp;
      const hits: Array<{ b: MonsterBrain; along: number }> = [];
      for (const b of this.alive()) {
        const ox = b.m.x - s.x;
        const oy = this.centerY(b) - eyeY;
        const oz = b.m.z - s.z;
        const along = ox * dx + oy * dy + oz * dz;
        if (along < 0 || along > w.range) continue;
        if (Math.hypot(ox - dx * along, oy - dy * along, oz - dz * along) > this.radius(b) + 0.45) continue;
        hits.push({ b, along });
      }
      hits.sort((a, b) => a.along - b.along);
      const struck = w.pierce ? hits : hits.slice(0, 1);
      const reach = w.pierce || struck.length === 0 ? w.range : struck[0]!.along;
      this.ctx.flash?.('SHOT', id, s.x, s.z, s.x + dx * reach, s.z + dz * reach, eyeY, eyeY + dy * reach);
      for (const h of struck) {
        const r = roll();
        this.damage(h.b, r.dmg, p, t, { crit: r.crit, fromX: s.x, fromZ: s.z });
      }
      const bounces = perks.BOUNCE ?? 0;
      if (bounces > 0 && struck[0]) this.bounce(struck[0].b, bounces, w.damage * SKILL.bounceDamage * fire, p, t);
      return;
    }
    this.ctx.flash?.('SLASH', id, s.x, s.z, s.x + fx * w.range, s.z + fz * w.range);
    const reachable = (b: MonsterBrain) => Math.abs(this.centerY(b) - (s.y + 0.9)) <= 1.6 + this.radius(b) * 0.5;
    const hitNow = new Set<MonsterBrain>();
    const pierce = perks.PIERCE ?? 0;
    if (pierce > 0) {
      const len = w.range * (1 + SKILL.pierceReach * pierce);
      this.ctx.flash?.('THRUST', id, s.x, s.z, s.x + fx * len, s.z + fz * len, eyeY - 0.2, eyeY - 0.2);
      for (const b of this.alive()) {
        if (!reachable(b)) continue;
        const dx = b.m.x - s.x;
        const dz = b.m.z - s.z;
        const along = dx * fx + dz * fz;
        if (along < 0 || along > len + this.radius(b)) continue;
        if (Math.abs(dx * fz - dz * fx) > SKILL.pierceWidth + this.radius(b)) continue;
        hitNow.add(b);
        const r = roll();
        this.damage(b, r.dmg * (1 + SKILL.pierceDamage * pierce + (pierce >= PERK_MAX ? 0.3 : 0)), p, t, { crit: r.crit, fromX: s.x, fromZ: s.z });
      }
    }
    const tornado = perks.TORNADO ?? 0;
    if (tornado > 0) {
      const n = (this.swings.get(id) ?? 0) + 1;
      this.swings.set(id, n);
      if (n % Math.max(1, 4 - tornado) === 0) {
        const len = SKILL.tornadoSpeed * SKILL.tornadoSeconds;
        this.ctx.flash?.('TORNADO', id, s.x, s.z, s.x + fx * len, s.z + fz * len);
        this.tornadoes.push({ owner: p, x: s.x, z: s.z, dx: fx, dz: fz, until: t + SKILL.tornadoSeconds, damage: w.damage * SKILL.tornadoDamage * (1 + tornado * 0.25), hit: new Set() });
      }
    }
    for (const b of this.alive()) {
      if (hitNow.has(b) || !reachable(b)) continue;
      const dx = b.m.x - s.x;
      const dz = b.m.z - s.z;
      const d = Math.hypot(dx, dz);
      if (d > w.range + this.radius(b)) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / (d || 1))));
      if (d > this.radius(b) && ang > w.arc) continue;
      const r = roll();
      this.damage(b, r.dmg, p, t, { crit: r.crit, fromX: s.x, fromZ: s.z });
      if (!isBoss(b.m.kind) && d > 0.01) {
        b.m.x += (dx / d) * 0.8;
        b.m.z += (dz / d) * 0.8;
      }
    }
  }

  /** Móc câu: the first ledge along the aim; the player is reeled up onto its top. */
  handleHook(id: string, t: number, aimYaw: number, aimPitch: number): void {
    const p = this.player(id);
    if (!p || p.state.roundState !== 'ACTIVE' || p.state.downed || t < (this.hookReady.get(id) ?? 0) || t < p.state.stunUntil) return;
    const s = p.sim.state;
    const ox = s.x;
    const oy = s.y + 1.2;
    const oz = s.z;
    const cp = Math.cos(aimPitch);
    const dx = Math.sin(aimYaw) * cp;
    const dy = Math.sin(aimPitch);
    const dz = Math.cos(aimYaw) * cp;
    let best: number = HOOK.range;
    let anchor: { x: number; y: number; z: number } | null = null;
    for (const b of this.ledges) {
      if (b.top < s.y + 0.6) continue; // only ledges above you
      const hit = rayBox(ox, oy, oz, dx, dy, dz, b);
      if (hit === null || hit >= best) continue;
      best = hit;
      const hx = ox + dx * hit;
      const hz = oz + dz * hit;
      anchor = {
        x: Math.max(b.minX + 0.45, Math.min(b.maxX - 0.45, hx)),
        y: b.top,
        z: Math.max(b.minZ + 0.45, Math.min(b.maxZ - 0.45, hz)),
      };
    }
    this.hookReady.set(id, t + (anchor ? HOOK.cooldown : 0.6));
    if (!anchor) {
      const miss = HOOK.range * 0.6;
      this.ctx.flash?.('HOOK', id, ox, oz, ox + dx * miss, oz + dz * miss, oy, oy + dy * miss);
      return;
    }
    const dist = Math.hypot(anchor.x - s.x, anchor.y - s.y, anchor.z - s.z);
    p.state.hookX = anchor.x;
    p.state.hookY = anchor.y;
    p.state.hookZ = anchor.z;
    p.state.hookUntil = t + Math.min(HOOK.maxSeconds, dist / 24 + 0.12);
    this.ctx.flash?.('HOOK', id, ox, oz, anchor.x, anchor.z, oy, anchor.y + 0.3);
  }

  /** Elements in Thủ Thành hit monsters instead of other players. */
  elementCast(element: string, casterId: string, x: number, z: number, t: number): boolean | undefined {
    const p = this.player(casterId);
    if (!p) return false;
    const me = p.sim.state;
    const within = (cx: number, cz: number, r: number) => this.alive().filter((b) => Math.hypot(b.m.x - cx, b.m.z - cz) <= r + this.radius(b));
    switch (element) {
      case 'THUNDER': {
        const hit = within(x, z, PVE.thunderRadius);
        if (hit.length === 0) this.ctx.flash?.('BOLT', casterId, x, z);
        for (const b of hit) {
          this.ctx.flash?.('BOLT', casterId, b.m.x, b.m.z);
          this.damage(b, PVE.thunderDamage, p, t, { magic: true });
          b.stunUntil = t + PVE.thunderStun * (isBoss(b.m.kind) ? 0.4 : 1);
        }
        return true;
      }
      case 'WIND':
        this.ctx.flash?.('WIND', casterId, me.x, me.z);
        for (const b of within(me.x, me.z, PVE.windRadius)) {
          this.damage(b, PVE.windDamage, p, t, { magic: true });
          if (isBoss(b.m.kind)) continue;
          const dx = b.m.x - me.x;
          const dz = b.m.z - me.z;
          const d = Math.hypot(dx, dz) || 1;
          b.m.x += (dx / d) * PVE.windPush;
          b.m.z += (dz / d) * PVE.windPush;
          b.stunUntil = Math.max(b.stunUntil, t + 0.6);
        }
        return true;
      case 'SWAP': {
        // Hoán đổi: the monster nearest the cursor is sent back to its lair.
        const target = within(x, z, PVE.swapRadius).filter((b) => !isBoss(b.m.kind))
          .sort((a, b) => Math.hypot(a.m.x - x, a.m.z - z) - Math.hypot(b.m.x - x, b.m.z - z))[0];
        if (!target) return false;
        const home = sidePoint(target.side, MAP.lairR, target.lane * 2);
        this.ctx.flash?.('SWAP', casterId, target.m.x, target.m.z, home.x, home.z);
        target.m.x = home.x;
        target.m.z = home.z;
        target.inside = false;
        return true;
      }
      case 'DARK':
        this.ctx.flash?.('DARK', casterId, x, z);
        for (const b of within(x, z, 5)) {
          b.confusedUntil = t + PVE.darkConfuse * (isBoss(b.m.kind) ? 0.4 : 1);
          b.wanderYaw = this.ctx.rng() * Math.PI * 2;
        }
        return true;
      default:
        return undefined; // Đất / Nước / Lửa / Phân thân / Không gian: normal effect (monsters react to it)
    }
  }

  /** Bots aim elements at the most urgent monster (closest to the castle). */
  elementTarget(botId: string): { x: number; z: number } | null {
    const bot = this.player(botId);
    const alive = this.alive();
    if (!bot || alive.length === 0) return null;
    const s = bot.sim.state;
    const score = (b: MonsterBrain) => -Math.hypot(b.m.x, b.m.z) - Math.hypot(b.m.x - s.x, b.m.z - s.z) * 0.5;
    const best = alive.reduce((a, b) => (score(b) > score(a) ? b : a));
    return { x: best.m.x, z: best.m.z };
  }

  allowElementPick(): boolean {
    return this.mode === 'BREAK';
  }

  handlePick(id: string, choice: string): void {
    const p = this.player(id);
    if (!p || !isPerkId(choice) || !p.state.perkOffer.split(',').includes(choice)) return;
    this.applyPerk(p, choice);
    p.state.perkOffer = '';
  }

  offerOf(id: string): PerkId[] {
    const p = this.player(id);
    return p ? p.state.perkOffer.split(',').filter(isPerkId) : [];
  }

  // --- tick ----------------------------------------------------------------------------------

  update(dt: number, t: number): void {
    this.waveFlow(t);
    this.spawnPending(t);
    const active = this.ctx.players.filter((p) => p.state.roundState === 'ACTIVE');
    const standing = active.filter((p) => !p.state.downed);
    this.health(dt, t, active);
    this.hazards.updatePit(t, this.mode === 'WAVE');
    this.hazards.updateSharks(dt, t, this.moatPrey(active, t));
    this.updateTornadoes(dt, t);
    this.updateArrows(dt, t, standing);
    this.readElementField(t);
    for (const b of this.brains) {
      if (b.m.state === 'DIE') continue;
      if (t < b.stunUntil) {
        b.m.state = 'STUN';
        continue;
      }
      if (t < b.confusedUntil) this.wander(b, dt);
      else if (b.m.kind === 'DRAGON') this.dragon(b, standing, dt, t);
      else if (b.m.kind === 'MINOTAUR') this.minotaur(b, standing, dt, t);
      else if (b.m.kind === 'SLIME_KING') this.slimeKing(b, standing, dt, t);
      else if (b.m.kind === 'ARCHER') this.archer(b, standing, dt, t);
      else if (b.m.kind === 'BOMBER') this.bomber(b, dt, t);
      else this.walker(b, standing, dt, t);
      if (b.m.state === 'DIE') continue;
      if (!MONSTERS[b.m.kind as MonsterKind].fly) {
        this.confine(b);
        // Sàn sụp: walkers on a dropped tile fall (bosses are too big to fall).
        if (!isBoss(b.m.kind)) {
          const tile = pitTileAt(b.m.x, b.m.z);
          if (tile >= 0 && this.hazards.tileGone(tile)) this.kill(b, t);
        }
      }
    }
    this.pillarBlock();
    this.separate();
    for (let i = this.brains.length - 1; i >= 0; i--) {
      const b = this.brains[i]!;
      if (b.m.state === 'DIE' && t >= b.removeAt) {
        this.brains.splice(i, 1);
        const idx = this.state.monsters.indexOf(b.m);
        if (idx >= 0) this.state.monsters.splice(idx, 1);
      }
    }
    this.pickups(standing, t);
    for (const p of this.ctx.players) p.state.score = Math.floor(this.points.get(p.id) ?? 0);
  }

  /** Public for bots. */
  view(): {
    monsters: readonly Monster[];
    pickups: readonly WeaponPickup[];
    downed: ReadonlyArray<{ id: string; x: number; z: number }>;
    gates: readonly number[];
    sides: string;
  } {
    const downed = this.ctx.players.filter((p) => p.state.downed).map((p) => ({ id: p.id, x: p.sim.state.x, z: p.sim.state.z }));
    return { monsters: this.alive().map((b) => b.m), pickups: [...this.state.pickups], downed, gates: [...this.state.gates], sides: this.state.sides };
  }

  /** Monster centre height (bots aim their shots there). */
  aimHeight(m: Monster): number {
    const b = this.brains.find((x) => x.m === m);
    return b ? this.centerY(b) : m.y + 0.8;
  }

  getState(): CastleState {
    return this.state;
  }

  isFinished(): boolean {
    return this.cleared || this.state.keep <= 0 || this.ctx.players.every((p) => p.state.roundState !== 'ACTIVE');
  }

  finish(): RoundOutcome {
    const ranking = [...this.ctx.players].sort((a, b) => (this.points.get(b.id) ?? 0) - (this.points.get(a.id) ?? 0)).map((p) => p.id);
    const passed = new Set(ranking);
    if (ranking.length > 1) passed.delete(ranking[ranking.length - 1]!);
    const details = new Map<string, string>();
    const end = this.cleared
      ? ` · thủ thành thành công ${this.waves} đợt!`
      : this.state.keep <= 0
        ? ` · lâu đài thất thủ ở đợt ${this.state.wave}`
        : ` · tới đợt ${this.state.wave}/${this.waves}`;
    for (const p of this.ctx.players) {
      const downs = this.downs.get(p.id) ?? 0;
      details.set(p.id, `${Math.floor(this.points.get(p.id) ?? 0)} điểm · diệt ${this.kills.get(p.id) ?? 0} quái${downs ? ` · gục ${downs} lần` : ''}${end}`);
    }
    return { ranking, passed, details };
  }

  dispose(): void {
    for (const p of this.ctx.players) this.resetPlayer(p);
    this.ctx.match.castle = undefined;
  }

  // --- waves ---------------------------------------------------------------------------------

  private alive(): MonsterBrain[] {
    return this.brains.filter((b) => b.m.state !== 'DIE');
  }

  private player(id: string): GamePlayer | undefined {
    return this.ctx.players.find((pl) => pl.id === id);
  }

  /** Main attack directions: the weakest gate is the favourite target. */
  private pickSides(wave: number): number[] {
    const gates = [...this.state.gates];
    const order = [0, 1, 2, 3].sort((a, b) => (gates[a] ?? 0) - (gates[b] ?? 0) + (this.ctx.rng() - 0.5) * 20);
    const first = this.ctx.rng() < 0.6 ? order[0]! : Math.floor(this.ctx.rng() * 4);
    if (wave < 3) return [first];
    let second = Math.floor(this.ctx.rng() * 4);
    if (second === first) second = (second + 1 + Math.floor(this.ctx.rng() * 3)) % 4;
    return [first, second];
  }

  private waveFlow(t: number): void {
    const st = this.state;
    if (this.mode === 'BREAK') {
      const waiting = this.ctx.players.some((p) => p.state.roundState === 'ACTIVE' && p.state.perkOffer !== '');
      if (st.wave > 0 && !waiting) st.breakUntil = Math.min(st.breakUntil, t + 1.2);
      if (t < st.breakUntil) return;
      for (const p of this.ctx.players) {
        const first = this.offerOf(p.id)[0];
        if (first) this.applyPerk(p, first);
        p.state.perkOffer = '';
      }
      st.wave++;
      st.breakUntil = 0;
      this.mode = 'WAVE';
      const main = this.pickSides(st.wave);
      st.sides = main.join(',');
      let k = 0;
      for (const sp of castleWave(st.wave, this.ctx.players.length, this.waves)) {
        for (let i = 0; i < sp.count; i++) {
          // Three in four come from the main sides, the rest from anywhere.
          const side = isBoss(sp.kind) || this.ctx.rng() < 0.75 ? main[k++ % main.length]! : Math.floor(this.ctx.rng() * 4);
          this.pending.push({ at: t + i * 0.5 + this.ctx.rng() * 0.4, kind: sp.kind, hpMul: sp.hpMul, side });
        }
      }
      return;
    }
    if (this.pending.length > 0 || this.brains.some((b) => b.m.state !== 'DIE')) return;
    if (st.wave >= this.waves) {
      this.cleared = true;
      return;
    }
    this.mode = 'BREAK';
    st.breakUntil = t + CASTLE.breakSeconds;
    st.sides = '';
    for (let i = 0; i < 4; i++) st.gates[i] = Math.min(st.gateMax, (st.gates[i] ?? 0) + st.gateMax * CASTLE.gateRepair);
    st.keep = Math.min(st.keepMax, st.keep + st.keepMax * 0.1);
    this.arrows.length = 0;
    for (const p of this.ctx.players) {
      if (p.state.roundState !== 'ACTIVE') continue;
      p.state.perkOffer = this.dealPerks(p).join(',');
      if (p.state.downed) this.standUp(p, PLAYER_HP.reviveHp, t);
      p.state.hp = Math.min(PLAYER_HP.max, p.state.hp + PLAYER_HP.waveHeal);
    }
  }

  private dealPerks(p: GamePlayer): PerkId[] {
    const perks = parsePerks(p.state.perks);
    const pool = PERK_IDS.filter((id) =>
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
    p.state.hp = PLAYER_HP.max;
    p.state.downed = false;
    p.state.revive = 0;
    p.state.hookUntil = 0;
  }

  private spawnPending(t: number): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const pd = this.pending[i]!;
      if (t < pd.at) continue;
      this.spawn(pd.kind, t, pd.hpMul, pd.side);
      this.pending.splice(i, 1);
    }
  }

  private spawn(kind: MonsterKind, t: number, hpMul: number, side: number, at?: { x: number; z: number }): MonsterBrain {
    const info = MONSTERS[kind];
    const m = new Monster();
    m.id = this.nextId++;
    m.kind = kind;
    const boss = isBoss(kind);
    const lane = (this.ctx.rng() * 2 - 1) * (MAP.door - 0.6);
    const pos = at ?? sidePoint(side, MAP.lairR, boss ? 0 : (this.ctx.rng() * 2 - 1) * MAP.lairSpread);
    m.x = pos.x;
    m.z = pos.z;
    m.y = info.fly;
    m.yaw = 0;
    let elite: EliteAffix | '' = '';
    if (!boss && !at && this.ctx.rng() < eliteChance(this.state.wave)) elite = ELITE_AFFIXES[Math.floor(this.ctx.rng() * ELITE_AFFIXES.length)]!;
    const bossHp = BOSS_HP_PER_PLAYER[kind];
    let hp = (bossHp ? bossHp * this.ctx.players.length : info.hp) * hpMul;
    if (elite) hp *= ELITE.hpMul * (elite === 'GIANT' ? ELITE.giantHpMul : 1);
    m.maxHp = Math.round(hp);
    m.hp = m.maxHp;
    m.elite = elite;
    m.state = kind === 'DRAGON' ? 'FLY' : 'WALK';
    this.state.monsters.push(m);
    const b: MonsterBrain = {
      m, side, lane, inside: false, hitReady: t + 1, removeAt: 0, stunUntil: 0, confusedUntil: 0, wanderYaw: 0,
      elite, speedMul: elite === 'FAST' ? ELITE.fastMul : 1, shootReady: t + 1 + this.ctx.rng(),
    };
    if (kind === 'DRAGON') {
      b.phase = 'FLY';
      b.phaseUntil = t + DRAGON.flySeconds;
      b.angle = Math.atan2(m.z, m.x);
    } else if (kind === 'MINOTAUR' || kind === 'SLIME_KING') {
      b.bossPhase = 'CHASE';
      b.bossUntil = t + (kind === 'MINOTAUR' ? MINOTAUR.chaseSeconds : SLIME_KING.hopEvery);
      b.splits = 0;
    }
    this.brains.push(b);
    return b;
  }

  // --- monster helpers ---------------------------------------------------------------------------

  private scale(b: MonsterBrain): number {
    return b.elite === 'GIANT' ? 1.8 : b.elite ? 1.35 : 1;
  }

  private radius(b: MonsterBrain): number {
    return MONSTERS[b.m.kind as MonsterKind].radius * this.scale(b);
  }

  private centerY(b: MonsterBrain): number {
    return b.m.y + (HEIGHT[b.m.kind as MonsterKind] * this.scale(b)) / 2;
  }

  private speed(b: MonsterBrain): number {
    return MONSTERS[b.m.kind as MonsterKind].speed * b.speedMul * (b.m.enraged ? ENRAGE.speedMul : 1);
  }

  /** Can a ground monster reach this player (not up on a wall / tower)? */
  private reachable(b: MonsterBrain, p: GamePlayer): boolean {
    return Math.abs(p.sim.state.y - b.m.y) < 1.4;
  }

  /**
   * Best prey for a hunter: close, alone, hurt and reachable — smarter monsters pick off
   * stragglers instead of charging the group.
   */
  private prey(b: MonsterBrain, players: readonly GamePlayer[], within: number, needReach: boolean): GamePlayer | null {
    let best: GamePlayer | null = null;
    let bestScore = Infinity;
    for (const p of players) {
      if (p.state.downed || (needReach && !this.reachable(b, p))) continue;
      const s = p.sim.state;
      const d = Math.hypot(s.x - b.m.x, s.z - b.m.z);
      if (d > within) continue;
      const alone = !players.some((o) => o !== p && Math.hypot(o.sim.state.x - s.x, o.sim.state.z - s.z) < 6);
      const score = d - (alone ? 5 : 0) + (p.state.hp < 40 ? -3 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  /** Where a walker heads: its gate (the keep once the gate is down) — via the bridge, around holes. */
  private objective(b: MonsterBrain): { x: number; z: number; atTarget: boolean } {
    const m = b.m;
    const rad = this.radius(b);
    const gateDown = (this.state.gates[b.side] ?? 0) <= 0;
    const { r, l } = sideFrame(b.side, m.x, m.z);
    if (b.inside || (gateDown && r < MAP.wallOut + rad + 0.5 && Math.abs(l) < MAP.door)) {
      const p = sidePoint(b.side, KEEP.lowHalf + rad, b.lane * 0.6);
      return { ...p, atTarget: b.inside && r <= KEEP.lowHalf + rad + 0.25 };
    }
    const target = gateDown ? sidePoint(b.side, MAP.wallOut - 0.5, 0) : sidePoint(b.side, MAP.wallOut + rad, b.lane);
    // Smart: cross the moat on the bridge instead of wading with the sharks.
    if (r > MOAT.rOut - 0.2 && r < MOAT.rOut + 6 && Math.abs(l) > MOAT.bridge - 0.6) {
      return { ...sidePoint(b.side, MOAT.rOut + 0.5, Math.max(-(MOAT.bridge - 0.8), Math.min(MOAT.bridge - 0.8, l))), atTarget: false };
    }
    // Smart: step around cracking / missing floor tiles ahead.
    if (r > PIT.rIn - 2 && r < PIT.rIn + PIT.rows * PIT.tile + 1) {
      const ahead = sidePoint(b.side, r - 1.8, l);
      const tile = pitTileAt(ahead.x, ahead.z);
      if (tile >= 0 && this.state.tiles[tile] !== 0) {
        const dodge = l >= 0 ? 3.2 : -3.2;
        return { ...sidePoint(b.side, r - 0.4, l + dodge), atTarget: false };
      }
    }
    return { ...target, atTarget: !gateDown && r <= MAP.wallOut + rad + 0.15 && Math.abs(l - b.lane) < 1 };
  }

  private breakGate(side: number, amount: number): void {
    const st = this.state;
    const before = st.gates[side] ?? 0;
    if (before <= 0) {
      st.keep = Math.max(0, st.keep - amount);
      return;
    }
    st.gates[side] = Math.max(0, before - amount);
    if (st.gates[side] === 0) {
      const g = sidePoint(side, MAP.wallOut, 0);
      this.ctx.flash?.('GATE_BREAK', '', g.x, g.z);
    }
  }

  /** Hit the gate (or the keep once inside). */
  private siege(b: MonsterBrain, dps: number, dt: number, t: number): void {
    b.m.state = 'ATTACK';
    // Inside, the keep's thick walls take half damage.
    if (b.inside) this.state.keep = Math.max(0, this.state.keep - dps * 0.5 * dt);
    else this.breakGate(b.side, dps * dt);
    if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) this.ctx.flash?.('GATE_HIT', '', b.m.x, b.m.z);
  }

  /** Walls stop everything that walks: only a broken gate lets monsters into the yard. */
  private confine(b: MonsterBrain): void {
    const m = b.m;
    const rad = this.radius(b);
    if (b.inside) {
      const lim = MAP.wallIn - rad;
      m.x = Math.max(-lim, Math.min(lim, m.x));
      m.z = Math.max(-lim, Math.min(lim, m.z));
      const k = KEEP.lowHalf + rad;
      if (Math.abs(m.x) < k && Math.abs(m.z) < k) {
        if (Math.abs(m.x) > Math.abs(m.z)) m.x = Math.sign(m.x || 1) * k;
        else m.z = Math.sign(m.z || 1) * k;
      }
      return;
    }
    const ring = Math.max(Math.abs(m.x), Math.abs(m.z));
    if (ring >= MAP.wallOut + rad) return;
    const side = Math.abs(m.z) >= Math.abs(m.x) ? (m.z < 0 ? 0 : 2) : m.x > 0 ? 1 : 3;
    const f = sideFrame(side, m.x, m.z);
    if ((this.state.gates[side] ?? 0) <= 0 && Math.abs(f.l) < MAP.door - rad * 0.5) {
      // Through the broken doorway.
      b.side = side;
      if (f.r < MAP.wallIn - rad) b.inside = true;
      return;
    }
    const out = sidePoint(side, MAP.wallOut + rad, f.l);
    m.x = out.x;
    m.z = out.z;
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

  private slowAt(b: MonsterBrain): number {
    const m = b.m;
    if (MONSTERS[m.kind as MonsterKind].fly) return 1;
    let k = 1;
    if (this.puddles.some((pd) => Math.hypot(pd.x - m.x, pd.z - m.z) < ELEMENT_FX.puddleRadius)) k *= PVE.puddleSlow;
    if (inMoat(m.x, m.z)) k *= MOAT.slow;
    return k;
  }

  /** Contact attack on a player next to the monster. */
  private contact(b: MonsterBrain, p: GamePlayer, t: number): void {
    if (t < b.hitReady) return;
    const s = p.sim.state;
    const m = b.m;
    if (Math.hypot(s.x - m.x, s.z - m.z) > this.radius(b) + 0.6 || Math.abs(s.y + 0.8 - this.centerY(b)) > 1.6 + this.radius(b)) return;
    b.hitReady = t + MONSTER_HIT.cooldown * (m.enraged ? ENRAGE.cooldownMul : 1);
    m.state = 'ATTACK';
    this.hurt(p, PLAYER_HP.hit[m.kind as MonsterKind] * (b.elite ? 1.4 : 1), m.x, m.z, t, MONSTER_HIT.knockback, MONSTER_HIT.stun);
  }

  // --- monster kinds -----------------------------------------------------------------------------

  /** Slimes / skeletons / shields march on their gate (bats hunt players); players close by get hit. */
  private walker(b: MonsterBrain, players: readonly GamePlayer[], dt: number, t: number): void {
    const m = b.m;
    const info = MONSTERS[m.kind as MonsterKind];
    const prey = this.prey(b, players, info.huntsPlayers ? 99 : 2.5, !info.fly);
    const decoy = this.nearestClone(m.x, m.z, info.huntsPlayers ? 99 : 4);
    const decoyFirst = !!decoy && (!prey || decoy.d < Math.hypot(prey.sim.state.x - m.x, prey.sim.state.z - m.z) + 3);
    if (info.fly) m.y = info.fly + Math.sin(t * 4 + m.id) * 0.25 + (prey ? Math.max(0, prey.sim.state.y) : 0);
    if (decoyFirst && decoy) {
      m.state = 'WALK';
      this.moveToward(m, decoy.x, decoy.z, this.speed(b) * this.slowAt(b), dt);
      return;
    }
    if (prey) {
      m.state = 'WALK';
      const ps = prey.sim.state;
      if (Math.hypot(ps.x - m.x, ps.z - m.z) > this.radius(b) + 0.3) this.moveToward(m, ps.x, ps.z, this.speed(b) * this.slowAt(b), dt);
      this.contact(b, prey, t);
      return;
    }
    const goal = this.objective(b);
    if (goal.atTarget) {
      this.siege(b, info.gateDps * (b.elite ? 1.5 : 1), dt, t);
      return;
    }
    m.state = 'WALK';
    this.moveToward(m, goal.x, goal.z, this.speed(b) * this.slowAt(b), dt);
  }

  /** Cung thủ: keeps its distance and shoots real (dodgeable) arrows — wall-top players first. */
  private archer(b: MonsterBrain, players: readonly GamePlayer[], dt: number, t: number): void {
    const m = b.m;
    let target: GamePlayer | null = null;
    let bestScore = Infinity;
    for (const p of players) {
      const s = p.sim.state;
      const d = Math.hypot(s.x - m.x, s.z - m.z);
      if (d > ARCHER_AI.range + 6) continue;
      const score = d - s.y * 3; // players up high are the favourite targets
      if (score < bestScore) {
        bestScore = score;
        target = p;
      }
    }
    if (!target) {
      const goal = this.objective(b);
      if (goal.atTarget) this.siege(b, MONSTERS.ARCHER.gateDps, dt, t);
      else {
        m.state = 'WALK';
        this.moveToward(m, goal.x, goal.z, this.speed(b) * this.slowAt(b), dt);
      }
      return;
    }
    const s = target.sim.state;
    const d = Math.hypot(s.x - m.x, s.z - m.z);
    if (d > ARCHER_AI.range) {
      m.state = 'WALK';
      this.moveToward(m, s.x, s.z, this.speed(b) * this.slowAt(b), dt);
    } else if (d < ARCHER_AI.minRange) {
      m.state = 'WALK';
      this.moveToward(m, m.x * 2 - s.x, m.z * 2 - s.z, this.speed(b) * this.slowAt(b), dt); // back off
    } else {
      m.state = 'ATTACK';
      m.yaw = Math.atan2(s.x - m.x, s.z - m.z);
    }
    if (d <= ARCHER_AI.range && t >= (b.shootReady ?? 0)) {
      b.shootReady = t + ARCHER_AI.cooldown * (b.elite === 'FAST' ? 0.6 : 1) * (m.enraged ? ENRAGE.cooldownMul : 1);
      const fy = this.centerY(b) + 0.2;
      const ty = s.y + 1;
      const dist = Math.hypot(s.x - m.x, ty - fy, s.z - m.z) || 1;
      const v = ARCHER_AI.arrowSpeed;
      this.arrows.push({ x: m.x, y: fy, z: m.z, vx: ((s.x - m.x) / dist) * v, vy: ((ty - fy) / dist) * v, vz: ((s.z - m.z) / dist) * v, until: t + dist / v + 0.4 });
      this.ctx.flash?.('MSHOT', '', m.x, m.z, s.x, s.z, fy, ty);
    }
  }

  /** Yêu tinh ôm bom: ignores players, runs to its gate (or the keep) and blows up. */
  private bomber(b: MonsterBrain, dt: number, t: number): void {
    const m = b.m;
    if (b.fuseAt !== undefined) {
      m.state = 'ATTACK';
      if (t >= b.fuseAt) this.explode(b, t, true);
      return;
    }
    const goal = this.objective(b);
    if (goal.atTarget) {
      b.fuseAt = t + BOMBER_AI.fuse;
      return;
    }
    m.state = 'WALK';
    this.moveToward(m, goal.x, goal.z, this.speed(b) * this.slowAt(b), dt);
  }

  /** Boom: hurts players and monsters around; at a gate it also smashes the gate (or the keep). */
  private explode(b: MonsterBrain, t: number, atTarget: boolean, killer?: GamePlayer): void {
    const m = b.m;
    const radius = m.kind === 'BOMBER' ? BOMBER_AI.radius : ELITE.explodeRadius;
    this.ctx.flash?.('EXPLODE', '', m.x, m.z);
    if (atTarget) {
      if (b.inside) this.state.keep = Math.max(0, this.state.keep - BOMBER_AI.gateDamage);
      else this.breakGate(b.side, BOMBER_AI.gateDamage);
    }
    for (const p of this.ctx.players) {
      if (p.state.roundState !== 'ACTIVE' || p.state.downed) continue;
      const s = p.sim.state;
      if (Math.hypot(s.x - m.x, s.z - m.z) > radius || Math.abs(s.y - m.y) > 2) continue;
      this.hurt(p, (m.kind === 'BOMBER' ? BOMBER_AI.playerDamage : ELITE.explodeDamage) * (killer ? 0.5 : 1), m.x, m.z, t, 11, 0.6);
    }
    if (m.state !== 'DIE') {
      m.hp = 0;
      m.state = 'DIE';
      b.removeAt = t + 0.2;
    }
    for (const o of this.alive()) {
      if (Math.hypot(o.m.x - m.x, o.m.z - m.z) > radius + this.radius(o)) continue;
      if (killer) this.damage(o, BOMBER_AI.monsterDamage, killer, t, { magic: true });
      else {
        o.m.hp = Math.max(0, o.m.hp - BOMBER_AI.monsterDamage);
        o.m.hitAt = t;
        if (o.m.hp <= 0) this.kill(o, t);
      }
    }
  }

  /** Dragon: circles the castle, lands near the players, breathes fire, takes off again. */
  private dragon(b: MonsterBrain, players: readonly GamePlayer[], dt: number, t: number): void {
    const m = b.m;
    const rush = m.enraged ? ENRAGE.cooldownMul : 1;
    if (b.phase === 'FLY') {
      b.angle = (b.angle ?? 0) + dt * 0.35;
      this.moveToward(m, Math.cos(b.angle) * DRAGON_CIRCLE, Math.sin(b.angle) * DRAGON_CIRCLE, this.speed(b) * 1.8, dt);
      m.y += (MONSTERS.DRAGON.fly - m.y) * Math.min(1, dt * 1.5);
      m.state = 'FLY';
      if (t >= (b.phaseUntil ?? 0)) {
        b.phase = 'LAND';
        b.phaseUntil = t + DRAGON.landSeconds;
        b.breathAt = t + DRAGON.breathDelay * rush;
      }
      return;
    }
    const prey = this.prey(b, players, 99, false);
    const ground = prey ? Math.max(0, prey.sim.state.y) : 0;
    m.y += (ground - m.y) * Math.min(1, dt * 3);
    if (prey && Math.abs(m.y - ground) < 0.6) {
      const dx = prey.sim.state.x - m.x;
      const dz = prey.sim.state.z - m.z;
      if (t < (b.breathAt ?? 0)) {
        m.yaw = Math.atan2(dx, dz);
        m.state = 'LAND';
        if (Math.hypot(dx, dz) > 5) this.moveToward(m, prey.sim.state.x, prey.sim.state.z, this.speed(b) * 0.6, dt);
      } else if (t < (b.breathAt ?? 0) + DRAGON.breathSeconds) {
        if (m.state !== 'BREATH') {
          m.state = 'BREATH';
          b.breathYaw = m.yaw;
          const by = b.breathYaw;
          this.ctx.flash?.('BREATH', '', m.x, m.z, m.x + Math.sin(by) * DRAGON.breathRange, m.z + Math.cos(by) * DRAGON.breathRange, m.y + 1.6, m.y + 0.5);
        }
        for (const p of players) {
          const ps = p.sim.state;
          const px = ps.x - m.x;
          const pz = ps.z - m.z;
          const pdist = Math.hypot(px, pz);
          if (pdist > DRAGON.breathRange || t < p.state.stunUntil || Math.abs(ps.y - m.y) > 3) continue;
          const ang = Math.acos(Math.max(-1, Math.min(1, (px * Math.sin(b.breathYaw!) + pz * Math.cos(b.breathYaw!)) / (pdist || 1))));
          if (ang < DRAGON.breathArc) this.hurt(p, PLAYER_HP.breath, m.x, m.z, t, 12, 1.4);
        }
      } else {
        m.state = 'LAND';
      }
    }
    if (t >= (b.phaseUntil ?? 0)) {
      b.phase = 'FLY';
      b.phaseUntil = t + DRAGON.flySeconds * rush;
      b.angle = Math.atan2(m.z, m.x);
    }
  }

  /** Minotaur: chase, paw the ground (telegraph), charge in a straight line (smashes gates). */
  private minotaur(b: MonsterBrain, players: readonly GamePlayer[], dt: number, t: number): void {
    const m = b.m;
    const rush = m.enraged ? ENRAGE.cooldownMul : 1;
    const prey = this.prey(b, players, 99, true);
    if (b.bossPhase === 'CHASE') {
      m.state = 'WALK';
      if (prey) this.moveToward(m, prey.sim.state.x, prey.sim.state.z, this.speed(b) * this.slowAt(b), dt);
      else {
        const goal = this.objective(b);
        if (goal.atTarget) this.siege(b, MONSTERS.MINOTAUR.gateDps, dt, t);
        else this.moveToward(m, goal.x, goal.z, this.speed(b) * this.slowAt(b), dt);
      }
      if (t >= (b.bossUntil ?? 0)) {
        b.bossPhase = 'WIND';
        b.bossUntil = t + MINOTAUR.windSeconds * rush;
        const g = sidePoint(b.side, MAP.wallOut, 0);
        const tx = prey ? prey.sim.state.x : g.x;
        const tz = prey ? prey.sim.state.z : g.z;
        b.chargeYaw = Math.atan2(tx - m.x, tz - m.z);
        m.yaw = b.chargeYaw;
      }
    } else if (b.bossPhase === 'WIND') {
      m.state = 'ATTACK';
      if (t >= (b.bossUntil ?? 0)) {
        b.bossPhase = 'CHARGE';
        b.bossUntil = t + MINOTAUR.chargeSeconds;
        b.hitIds = new Set();
        this.ctx.flash?.('QUAKE', '', m.x, m.z);
      }
    } else {
      m.state = 'CHARGE';
      const yaw = b.chargeYaw ?? 0;
      m.x += Math.sin(yaw) * MINOTAUR.chargeSpeed * dt;
      m.z += Math.cos(yaw) * MINOTAUR.chargeSpeed * dt;
      for (const p of players) {
        if (b.hitIds?.has(p.id) || !this.reachable(b, p)) continue;
        if (Math.hypot(p.sim.state.x - m.x, p.sim.state.z - m.z) > this.radius(b) + 0.6) continue;
        b.hitIds?.add(p.id);
        this.hurt(p, MINOTAUR.damage, m.x, m.z, t, MINOTAUR.knock, 1);
      }
      // Rammed the castle: the gate on that side takes a big hit if it was in the way.
      const bx = m.x;
      const bz = m.z;
      this.confine(b);
      const blocked = Math.hypot(bx - m.x, bz - m.z) > 0.01;
      if (blocked) {
        const side = Math.abs(bz) >= Math.abs(bx) ? (bz < 0 ? 0 : 2) : bx > 0 ? 1 : 3;
        if (Math.abs(sideFrame(side, m.x, m.z).l) < 4) {
          this.breakGate(side, MINOTAUR.gateDamage);
          this.ctx.flash?.('GATE_HIT', '', m.x, m.z);
        }
      }
      const lim = MAP.half - 1;
      m.x = Math.max(-lim, Math.min(lim, m.x));
      m.z = Math.max(-lim, Math.min(lim, m.z));
      if (t >= (b.bossUntil ?? 0) || blocked) {
        b.bossPhase = 'CHASE';
        b.bossUntil = t + MINOTAUR.chaseSeconds * rush;
      }
    }
  }

  /** Vua Slime: creeps toward players or its gate; every few seconds hops onto someone and slams. */
  private slimeKing(b: MonsterBrain, players: readonly GamePlayer[], dt: number, t: number): void {
    const m = b.m;
    const rush = m.enraged ? ENRAGE.cooldownMul : 1;
    const prey = this.prey(b, players, 30, true);
    if (b.bossPhase === 'HOP') {
      const f = Math.min(1, 1 - ((b.bossUntil ?? t) - t) / SLIME_KING.hopSeconds);
      m.x = (b.hopFromX ?? m.x) + ((b.hopToX ?? m.x) - (b.hopFromX ?? m.x)) * f;
      m.z = (b.hopFromZ ?? m.z) + ((b.hopToZ ?? m.z) - (b.hopFromZ ?? m.z)) * f;
      m.y = Math.sin(f * Math.PI) * SLIME_KING.hopHeight;
      m.state = 'ATTACK';
      if (f >= 1) {
        m.y = 0;
        this.ctx.flash?.('QUAKE', '', m.x, m.z);
        for (const p of players) {
          if (this.reachable(b, p) && Math.hypot(p.sim.state.x - m.x, p.sim.state.z - m.z) < SLIME_KING.slamRadius) this.hurt(p, SLIME_KING.damage, m.x, m.z, t, SLIME_KING.knock, 0.8);
        }
        const { r, l } = sideFrame(b.side, m.x, m.z);
        if (!b.inside && r < MAP.wallOut + 4 && Math.abs(l) < 4) this.breakGate(b.side, 8);
        b.bossPhase = 'CHASE';
        b.bossUntil = t + SLIME_KING.hopEvery * rush;
      }
      return;
    }
    m.state = 'WALK';
    const goal = this.objective(b);
    const tx = prey ? prey.sim.state.x : goal.x;
    const tz = prey ? prey.sim.state.z : goal.z;
    if (!prey && goal.atTarget) this.siege(b, MONSTERS.SLIME_KING.gateDps, dt, t);
    else this.moveToward(m, tx, tz, this.speed(b) * this.slowAt(b), dt);
    if (t >= (b.bossUntil ?? 0)) {
      b.bossPhase = 'HOP';
      b.bossUntil = t + SLIME_KING.hopSeconds;
      b.hopFromX = m.x;
      b.hopFromZ = m.z;
      const dx = tx - m.x;
      const dz = tz - m.z;
      const d = Math.hypot(dx, dz);
      const k = d > 7 ? 7 / d : 1;
      b.hopToX = m.x + dx * k;
      b.hopToZ = m.z + dz * k;
    }
  }

  private spawnMinions(b: MonsterBrain, kind: MonsterKind, count: number, t: number): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const s = this.spawn(kind, t, 1 + this.state.wave * 0.1, b.side, { x: b.m.x + Math.cos(a) * 2.2, z: b.m.z + Math.sin(a) * 2.2 });
      s.inside = b.inside;
    }
  }

  /** Bóng tối: stumble around aimlessly. */
  private wander(b: MonsterBrain, dt: number): void {
    const m = b.m;
    b.wanderYaw += Math.sin(m.id * 7.3 + m.x) * 2 * dt;
    m.x += Math.sin(b.wanderYaw) * this.speed(b) * 0.5 * dt;
    m.z += Math.cos(b.wanderYaw) * this.speed(b) * 0.5 * dt;
    m.yaw = b.wanderYaw;
    m.state = 'WALK';
  }

  // --- damage ----------------------------------------------------------------------------------

  /**
   * Damage a monster. `fromX/Z` (weapon hits) lets shields block frontal hits; `magic` (elements,
   * skills) and `ult` skip that; ultimates do not refill rage.
   */
  private damage(b: MonsterBrain, amount: number, by: GamePlayer, t: number, opts: { crit?: boolean; fromX?: number; fromZ?: number; magic?: boolean; ult?: boolean } = {}): void {
    const m = b.m;
    if (m.state === 'DIE') return;
    let dmg = amount;
    if (b.elite === 'ARMOR') dmg *= ELITE.armorMul;
    if (m.kind === 'SHIELD' && opts.fromX !== undefined && opts.fromZ !== undefined && !opts.magic && !opts.ult) {
      // Hiệp sĩ khiên: blocks what comes from the front — go around!
      const ax = opts.fromX - m.x;
      const az = opts.fromZ - m.z;
      const ad = Math.hypot(ax, az) || 1;
      const front = Math.acos(Math.max(-1, Math.min(1, (ax * Math.sin(m.yaw) + az * Math.cos(m.yaw)) / ad)));
      if (front < SHIELD_AI.frontArc) dmg *= SHIELD_AI.frontMul;
    }
    const dealt = Math.min(m.hp, dmg);
    m.hp -= dealt;
    m.hitAt = t;
    m.crit = opts.crit === true;
    if (!opts.ult) by.state.rage = Math.min(1, by.state.rage + dealt / RAGE_DAMAGE);
    if (isBoss(m.kind)) this.addPoints(by.id, dealt * DRAGON.pointsPerHp);
    if (m.kind === 'SLIME_KING' && m.hp > 0) {
      const due = m.hp < m.maxHp / 3 ? 2 : m.hp < (m.maxHp * 2) / 3 ? 1 : 0;
      while ((b.splits ?? 0) < due) {
        b.splits = (b.splits ?? 0) + 1;
        this.spawnMinions(b, 'SLIME', SLIME_KING.splitCount, t);
      }
    }
    // Bosses enrage at half health: faster, shorter cooldowns, and they call for help once.
    if (isBoss(m.kind) && !m.enraged && m.hp > 0 && m.hp <= m.maxHp * ENRAGE.at) {
      m.enraged = true;
      this.ctx.flash?.('ENRAGE', '', m.x, m.z);
      this.spawnMinions(b, m.kind === 'DRAGON' ? 'BAT' : 'SKELETON', ENRAGE.minions, t);
    }
    if (m.hp > 0) return;
    m.state = 'DIE';
    b.removeAt = t + DIE_SECONDS;
    this.kills.set(by.id, (this.kills.get(by.id) ?? 0) + 1);
    if (m.kind === 'SLIME_KING') this.spawnMinions(b, 'SLIME', SLIME_KING.deathSplit, t);
    if (m.kind === 'BOMBER' || b.elite === 'EXPLODE') this.explode(b, t, false, by);
    if (isBoss(m.kind)) {
      this.addPoints(by.id, DRAGON.killBonus);
      this.bossKills++;
      const n = this.ctx.players.length;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const tier = this.ctx.rng() < 0.35 + this.bossKills * 0.15 ? MAX_TIER : MAX_TIER - 1;
        this.drop(m.x + Math.cos(a) * 2.5, m.z + Math.sin(a) * 2.5, tier, t);
      }
      return;
    }
    this.addPoints(by.id, MONSTERS[m.kind as MonsterKind].points * (b.elite ? ELITE.pointsMul : 1));
    if (b.elite) this.drop(m.x, m.z, Math.max(1, rollRarity(this.state.wave + 4, this.ctx.rng())), t);
    else if (this.ctx.rng() < CASTLE.dropChance) this.drop(m.x, m.z, rollRarity(this.state.wave, this.ctx.rng()), t);
  }

  /** Dies without a killer (fell into the pit, eaten by a shark). */
  private kill(b: MonsterBrain, t: number): void {
    if (b.m.state === 'DIE') return;
    b.m.hp = 0;
    b.m.state = 'DIE';
    b.removeAt = t + DIE_SECONDS;
    if (b.m.kind === 'BOMBER' || b.elite === 'EXPLODE') this.explode(b, t, false);
  }

  private drop(x: number, z: number, tier: number, t: number): void {
    const lim = MAP.half - 2;
    const drop = new WeaponPickup();
    drop.id = this.nextId++;
    drop.weapon = DROP_WEAPONS[Math.floor(this.ctx.rng() * DROP_WEAPONS.length)]!;
    drop.tier = tier;
    let px = Math.max(-lim, Math.min(lim, x));
    let pz = Math.max(-lim, Math.min(lim, z));
    // Not inside a wall: drops that land in the wall band slide out.
    const ring = Math.max(Math.abs(px), Math.abs(pz));
    if (ring > MAP.wallIn - 0.5 && ring < MAP.wallOut + 0.5) {
      const k = (MAP.wallOut + 0.8) / ring;
      px *= k;
      pz *= k;
    }
    drop.x = px;
    drop.z = pz;
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
      const taker = players.find((p) => {
        const s = p.sim.state;
        if (Math.hypot(s.x - pk.x, s.z - pk.z) >= CASTLE.pickupRadius || s.y > 1) return false;
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

  // --- ultimates / skills ----------------------------------------------------------------------

  private ultimate(kind: PerkId, p: GamePlayer, power: number, t: number): void {
    const s = p.sim.state;
    const eye = s.y + 1;
    const near = (r: number) => this.alive().filter((b) => Math.hypot(b.m.x - s.x, b.m.z - s.z) <= r + this.radius(b));
    switch (kind) {
      case 'POWER':
        this.ctx.flash?.('QUAKE', p.id, s.x, s.z);
        for (const b of near(ULT.quakeRadius)) {
          if (Math.abs(this.centerY(b) - eye) > 3) continue;
          this.damage(b, ULT.quakeDamage * power, p, t, { ult: true });
          const dx = b.m.x - s.x;
          const dz = b.m.z - s.z;
          const d = Math.hypot(dx, dz) || 1;
          if (!isBoss(b.m.kind)) {
            b.m.x += (dx / d) * 2.5;
            b.m.z += (dz / d) * 2.5;
          }
        }
        break;
      case 'HASTE':
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
            if (along < 0 || along > bestT || Math.abs(dx * fz - dz * fx) > this.radius(b) + 0.5) continue;
            best = b;
            bestT = along;
          }
          this.ctx.flash?.('SHOT', p.id, s.x, s.z, s.x + fx * bestT, s.z + fz * bestT, eye, best ? this.centerY(best) : eye);
          if (best) this.damage(best, ULT.fanDamage * power, p, t, { ult: true });
        }
        break;
      case 'REACH':
        for (const b of near(ULT.rainRange)) {
          this.ctx.flash?.('SHOT', p.id, s.x, s.z, b.m.x, b.m.z, eye + 6, this.centerY(b));
          this.damage(b, ULT.rainDamage * power, p, t, { ult: true });
        }
        break;
      case 'CRIT':
        for (const b of [...this.alive()].sort((a, c) => c.m.hp - a.m.hp).slice(0, ULT.boltTargets)) {
          this.ctx.flash?.('BOLT', p.id, b.m.x, b.m.z);
          this.damage(b, ULT.boltDamage * power, p, t, { ult: true });
        }
        break;
      default:
        break;
    }
  }

  private bounce(from: MonsterBrain, count: number, dmg: number, p: GamePlayer, t: number): void {
    const hit = new Set<MonsterBrain>([from]);
    let cur = from;
    for (let i = 0; i < count; i++) {
      let next: MonsterBrain | null = null;
      let best: number = SKILL.bounceRange;
      for (const b of this.alive()) {
        if (hit.has(b)) continue;
        const d = Math.hypot(b.m.x - cur.m.x, b.m.z - cur.m.z);
        if (d < best) {
          best = d;
          next = b;
        }
      }
      if (!next) return;
      this.ctx.flash?.('SHOT', p.id, cur.m.x, cur.m.z, next.m.x, next.m.z, this.centerY(cur), this.centerY(next));
      this.damage(next, dmg, p, t, { magic: true });
      hit.add(next);
      cur = next;
    }
  }

  private updateTornadoes(dt: number, t: number): void {
    for (let i = this.tornadoes.length - 1; i >= 0; i--) {
      const tw = this.tornadoes[i]!;
      tw.x += tw.dx * SKILL.tornadoSpeed * dt;
      tw.z += tw.dz * SKILL.tornadoSpeed * dt;
      for (const b of this.alive()) {
        if (b.m.y > 2.4 || Math.hypot(b.m.x - tw.x, b.m.z - tw.z) > SKILL.tornadoRadius + this.radius(b)) continue;
        if (!isBoss(b.m.kind)) {
          b.m.x += tw.dx * SKILL.tornadoSpeed * dt * 0.8;
          b.m.z += tw.dz * SKILL.tornadoSpeed * dt * 0.8;
        }
        if (tw.hit.has(b.m.id)) continue;
        tw.hit.add(b.m.id);
        this.damage(b, tw.damage, tw.owner, t, { magic: true });
      }
      if (t >= tw.until) this.tornadoes.splice(i, 1);
    }
  }

  /** Archer arrows in flight: they hit the first player they pass (step aside to dodge). */
  private updateArrows(dt: number, t: number, players: readonly GamePlayer[]): void {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i]!;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.z += a.vz * dt;
      const victim = players.find((p) => {
        const s = p.sim.state;
        return Math.hypot(s.x - a.x, s.z - a.z) < 0.55 && a.y > s.y && a.y < s.y + 1.6;
      });
      if (victim) {
        this.hurt(victim, ARCHER_AI.damage, a.x - a.vx, a.z - a.vz, t, 4, 0.2);
        this.arrows.splice(i, 1);
      } else if (t >= a.until || a.y < -1) this.arrows.splice(i, 1);
    }
  }

  // --- health ----------------------------------------------------------------------------------

  private hurt(p: GamePlayer, amount: number, fromX: number, fromZ: number, t: number, speed: number, stun: number): void {
    if (p.state.downed) return;
    this.hurtAt.set(p.id, t);
    p.state.hp = Math.max(0, p.state.hp - Math.round(amount));
    if (p.state.hp <= 0) {
      this.goDown(p, t);
      return;
    }
    const s = p.sim.state;
    const dx = s.x - fromX;
    const dz = s.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    if (speed > 0) {
      s.vx = (dx / d) * speed;
      s.vz = (dz / d) * speed;
      s.vy = 5;
      s.grounded = false;
    }
    p.state.stunUntil = Math.max(p.state.stunUntil, t + stun);
  }

  private goDown(p: GamePlayer, t: number): void {
    p.state.downed = true;
    p.state.hp = 0;
    p.state.revive = 0;
    p.state.stunUntil = t + 9999;
    p.state.rage = 0;
    p.state.hookUntil = 0;
    this.downAt.set(p.id, t);
    this.downs.set(p.id, (this.downs.get(p.id) ?? 0) + 1);
    const s = p.sim.state;
    s.vx = s.vz = 0;
  }

  private standUp(p: GamePlayer, hp: number, t: number): void {
    p.state.downed = false;
    p.state.revive = 0;
    p.state.hp = hp;
    p.state.stunUntil = t;
    this.hurtAt.set(p.id, t);
  }

  private health(dt: number, t: number, active: readonly GamePlayer[]): void {
    for (const p of active) {
      const s = p.sim.state;
      if (s.y < -3) {
        const sp = castleSpawn(p.state.slot);
        p.sim.reset(sp.x, sp.z, sp.yaw);
        this.hurt(p, PLAYER_HP.fall, sp.x, sp.z + 1, t, 0, 0.3);
        continue;
      }
      if (!p.state.downed) {
        if (t - (this.hurtAt.get(p.id) ?? -99) > PLAYER_HP.regenDelay && p.state.hp < PLAYER_HP.max) {
          const acc = (this.regen.get(p.id) ?? 0) + PLAYER_HP.regenPerSecond * dt;
          const whole = Math.floor(acc);
          this.regen.set(p.id, acc - whole);
          if (whole > 0) p.state.hp = Math.min(PLAYER_HP.max, p.state.hp + whole);
        }
        continue;
      }
      const helper = active.find((o) => o !== p && !o.state.downed && Math.hypot(o.sim.state.x - s.x, o.sim.state.z - s.z) < PLAYER_HP.reviveRadius && Math.abs(o.sim.state.y - s.y) < 1.5);
      p.state.revive = helper ? p.state.revive + dt / PLAYER_HP.reviveSeconds : Math.max(0, p.state.revive - dt * 0.5);
      if (p.state.revive >= 1) {
        this.standUp(p, PLAYER_HP.reviveHp, t);
        this.ctx.tryRescue?.(p.id);
        if (helper) this.addPoints(helper.id, 3);
        continue;
      }
      if (t - (this.downAt.get(p.id) ?? t) >= PLAYER_HP.autoReviveSeconds) {
        const sp = castleSpawn(p.state.slot);
        p.sim.reset(sp.x, sp.z, sp.yaw);
        this.standUp(p, PLAYER_HP.autoReviveHp, t);
        this.addPoints(p.id, -PLAYER_HP.downPenalty);
      }
    }
  }

  private moatPrey(active: readonly GamePlayer[], t: number): MoatPrey[] {
    const out: MoatPrey[] = [];
    for (const p of active) {
      const s = p.sim.state;
      if (p.state.downed || s.y > 0.3 || !inMoat(s.x, s.z)) continue;
      out.push({ x: s.x, z: s.z, bite: (fx, fz) => this.hurt(p, PLAYER_HP.shark, fx, fz, t, 10, 0.8) });
    }
    for (const b of this.alive()) {
      if (MONSTERS[b.m.kind as MonsterKind].fly || isBoss(b.m.kind) || !inMoat(b.m.x, b.m.z)) continue;
      out.push({
        x: b.m.x, z: b.m.z,
        bite: () => {
          b.m.hp = Math.max(0, b.m.hp - 3);
          b.m.hitAt = t;
          if (b.m.hp <= 0) this.kill(b, t);
        },
      });
    }
    return out;
  }

  // --- element field ---------------------------------------------------------------------------

  private readElementField(t: number): void {
    this.pillars = [];
    this.puddles = [];
    this.clones = [];
    this.ctx.match.effects.forEach((e) => {
      if (e.kind === 'PUDDLE') this.puddles.push({ x: e.x, z: e.z });
      else if (e.kind === 'CLONE') this.clones.push({ x: e.x, z: e.z });
      else if (e.kind === 'PILLAR') {
        this.pillars.push({ x: e.x, z: e.z });
        if (this.seenPillars.has(e.id)) return;
        this.seenPillars.add(e.id);
        const owner = this.player(e.owner);
        for (const b of this.alive()) {
          if (b.m.y > 2.4 || Math.hypot(b.m.x - e.x, b.m.z - e.z) > ELEMENT_FX.pillarRadius + this.radius(b) + 0.6) continue;
          if (owner) this.damage(b, PVE.pillarDamage, owner, t, { magic: true });
          b.stunUntil = Math.max(b.stunUntil, t + 0.8);
        }
      }
    });
  }

  private pillarBlock(): void {
    for (const pl of this.pillars) {
      for (const b of this.alive()) {
        if (MONSTERS[b.m.kind as MonsterKind].fly) continue;
        const dx = b.m.x - pl.x;
        const dz = b.m.z - pl.z;
        const d = Math.hypot(dx, dz);
        const min = ELEMENT_FX.pillarRadius + this.radius(b);
        if (d >= min) continue;
        const nx = d > 1e-3 ? dx / d : 1;
        const nz = d > 1e-3 ? dz / d : 0;
        b.m.x = pl.x + nx * min;
        b.m.z = pl.z + nz * min;
      }
    }
  }

  private nearestClone(x: number, z: number, within: number): { x: number; z: number; d: number } | null {
    let best: { x: number; z: number; d: number } | null = null;
    for (const c of this.clones) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < within && (!best || d < best.d)) best = { ...c, d };
    }
    return best;
  }

  /** Keep walkers from stacking into one blob. */
  private separate(): void {
    const list = this.alive().filter((b) => b.m.kind !== 'DRAGON');
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const c = list[j]!;
        const dx = c.m.x - a.m.x;
        const dz = c.m.z - a.m.z;
        const d = Math.hypot(dx, dz);
        const min = this.radius(a) + this.radius(c);
        if (d >= min || d < 1e-4) continue;
        const push = (min - d) / 2;
        a.m.x -= (dx / d) * push;
        a.m.z -= (dz / d) * push;
        c.m.x += (dx / d) * push;
        c.m.z += (dz / d) * push;
      }
    }
    const lim = MAP.half - 0.5;
    for (const b of list) {
      b.m.x = Math.max(-lim, Math.min(lim, b.m.x));
      b.m.z = Math.max(-lim, Math.min(lim, b.m.z));
    }
  }

  private addPoints(id: string, n: number): void {
    this.points.set(id, (this.points.get(id) ?? 0) + n);
  }
}
