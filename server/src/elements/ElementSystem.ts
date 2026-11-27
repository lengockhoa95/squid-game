import {
  ELEMENTS, ELEMENT_FX, cardMods, createElementField, effectStep, elementsFor,
  type CardMods, type EffectKind, type ElementField, type ElementId, type MinigameId, type StepFn,
} from '@sp/shared';
import { ElementEffect, type MatchState, type PlayerState } from '@sp/shared/schema';
import type { GamePlayer, ServerMinigame } from '../minigames/framework/types.ts';

/** First cast allowed this long after the round starts playing. */
const FIRST_CAST_DELAY = 1;
const CLONE_TURN_SECONDS = 1.1;

interface Clone {
  effect: ElementEffect;
  dirX: number;
  dirZ: number;
  baseYaw: number;
  turnIn: number;
}

export type CastResult = 'ok' | 'rejected';

/**
 * Element mode on the server. Owns the area field (pillars/puddles) used by the wrapped step
 * functions, the synced effect list, and every rule check: phase, participant, allowed element,
 * cooldown, stun and range. Effects change only server state; clients just draw them.
 */
export class ElementSystem {
  readonly field: ElementField = createElementField();
  private readonly state: MatchState;
  private readonly rng: () => number;
  private players: readonly GamePlayer[] = [];
  private game: ServerMinigame | null = null;
  private allowed: readonly ElementId[] = [];
  private clones: Clone[] = [];
  private nextId = 1;
  private readonly modsOf: (p: PlayerState) => CardMods;

  constructor(state: MatchState, rng: () => number, modsOf: (p: PlayerState) => CardMods = () => cardMods({})) {
    this.state = state;
    this.rng = rng;
    this.modsOf = modsOf;
  }

  /** A visual-only effect (e.g. a rescue sparkle). */
  flash(kind: EffectKind, owner: GamePlayer, x: number, z: number, t: number): void {
    this.addEffect(kind, owner, x, z, t, ELEMENT_FX.flashSeconds);
  }

  get enabled(): boolean {
    return this.state.elementsEnabled;
  }

  get movement(): boolean {
    return this.game?.step != null;
  }

  allowedElements(): readonly ElementId[] {
    return this.allowed;
  }

  /** New round: everyone gets a random allowed element (changeable during the intro). */
  beginRound(players: readonly GamePlayer[], game: ServerMinigame): void {
    this.clear();
    this.players = players;
    this.game = game;
    this.allowed = this.enabled ? elementsFor(game.id as MinigameId, game.step !== null) : [];
    for (const p of this.state.players.values()) p.element = ''; // spectators have no element
    for (const p of players) {
      const s = p.state;
      s.element = this.allowed.length > 0 ? this.allowed[Math.floor(this.rng() * this.allowed.length)]! : '';
      s.elementReadyAt = this.modsOf(s).instantFirstCast ? 0 : FIRST_CAST_DELAY;
      s.stunUntil = 0;
      s.hasteUntil = 0;
      s.blindUntil = 0;
    }
  }

  /** Step function for one participant: the game's step plus element effects. */
  wrapStep(base: StepFn, p: GamePlayer): StepFn {
    return effectStep(base, this.field, p.state, p.id);
  }

  pick(id: string, element: ElementId): boolean {
    const phase = this.state.phase;
    if (phase !== 'ROUND_INTRO' && phase !== 'ROUND_COUNTDOWN') return false;
    const p = this.players.find((pl) => pl.id === id);
    if (!p || !this.allowed.includes(element)) return false;
    p.state.element = element;
    return true;
  }

  cast(id: string, x: number, z: number, t: number): CastResult {
    if (this.state.phase !== 'ROUND_PLAYING' || !this.enabled) return 'rejected';
    const caster = this.players.find((pl) => pl.id === id);
    if (!caster || !caster.state.alive || caster.state.roundState !== 'ACTIVE') return 'rejected';
    const element = caster.state.element as ElementId;
    if (!this.allowed.includes(element)) return 'rejected';
    if (t < caster.state.elementReadyAt || t < caster.state.stunUntil) return 'rejected';
    const ok = this.movement ? this.castMovement(caster, element, x, z, t) : this.castAction(caster, element, t);
    if (!ok) return 'rejected';
    caster.state.elementReadyAt = t + ELEMENTS[element].cooldown * this.modsOf(caster.state).cooldownMul;
    return 'ok';
  }

  /** Expire effects and move clones. Called every tick while playing. */
  update(dt: number, t: number): void {
    const effects = this.state.effects;
    for (let i = effects.length - 1; i >= 0; i--) {
      if (t >= effects[i]!.until) effects.splice(i, 1);
    }
    this.field.pillars = this.field.pillars.filter((p) => t < p.until);
    this.field.puddles = this.field.puddles.filter((p) => t < p.until);
    this.clones = this.clones.filter((c) => t < c.effect.until);
    const b = this.game?.bounds;
    for (const c of this.clones) {
      c.turnIn -= dt;
      if (c.turnIn <= 0) {
        c.turnIn = CLONE_TURN_SECONDS;
        const yaw = c.baseYaw + (this.rng() * 2 - 1) * 1.1;
        c.dirX = Math.sin(yaw);
        c.dirZ = Math.cos(yaw);
      }
      const e = c.effect;
      let nx = e.x + c.dirX * ELEMENT_FX.cloneSpeed * dt;
      let nz = e.z + c.dirZ * ELEMENT_FX.cloneSpeed * dt;
      if (b) {
        if (nx < b.minX + 0.5 || nx > b.maxX - 0.5) { c.dirX = -c.dirX; nx = e.x; }
        if (nz < b.minZ + 0.5 || nz > b.maxZ - 0.5) { c.dirZ = -c.dirZ; nz = e.z; }
      }
      e.x = nx;
      e.z = nz;
      e.yaw = Math.atan2(c.dirX, c.dirZ);
    }
  }

  /** Round over / match aborted: remove every effect and status. */
  clear(): void {
    this.state.effects.clear();
    this.field.pillars = [];
    this.field.puddles = [];
    this.clones = [];
    for (const p of this.players) {
      p.state.stunUntil = 0;
      p.state.hasteUntil = 0;
      p.state.blindUntil = 0;
    }
    this.players = [];
    this.game = null;
    this.allowed = [];
  }

  // --- movement games -------------------------------------------------------------------------

  private castMovement(caster: GamePlayer, element: ElementId, rawX: number, rawZ: number, t: number): boolean {
    const me = caster.sim.state;
    const { x, z } = clampToRange(me.x, me.z, rawX, rawZ, ELEMENTS[element].range);
    switch (element) {
      case 'EARTH':
        this.field.pillars.push({ x, z, until: t + ELEMENT_FX.pillarSeconds });
        this.addEffect('PILLAR', caster, x, z, t, ELEMENT_FX.pillarSeconds);
        return true;
      case 'WATER':
        this.field.puddles.push({ x, z, until: t + ELEMENT_FX.puddleSeconds, owner: caster.id });
        this.addEffect('PUDDLE', caster, x, z, t, ELEMENT_FX.puddleSeconds);
        return true;
      case 'THUNDER': {
        let target = this.nearestOther(caster, x, z, ELEMENT_FX.thunderHitRadius);
        if (target && this.modsOf(target.state).reflect) target = caster; // Phản Xạ: bounced back
        if (target) this.stun(target, t, ELEMENT_FX.stunSeconds);
        const at = target ? target.sim.state : { x, z };
        this.addEffect('BOLT', caster, at.x, at.z, t, ELEMENT_FX.flashSeconds);
        return true;
      }
      case 'WIND':
        for (const p of this.activeOthers(caster)) {
          const s = p.sim.state;
          const dx = s.x - me.x;
          const dz = s.z - me.z;
          const d = Math.hypot(dx, dz);
          if (d > ELEMENT_FX.windRadius) continue;
          const nx = d > 1e-3 ? dx / d : Math.sin(me.yaw);
          const nz = d > 1e-3 ? dz / d : Math.cos(me.yaw);
          const taken = this.modsOf(p.state).windTaken;
          s.vx = nx * ELEMENT_FX.windSpeed * taken;
          s.vz = nz * ELEMENT_FX.windSpeed * taken;
          s.vy = ELEMENT_FX.windLift * taken;
          s.grounded = false;
        }
        this.addEffect('WIND', caster, me.x, me.z, t, ELEMENT_FX.flashSeconds);
        return true;
      case 'FIRE':
        caster.state.hasteUntil = t + ELEMENT_FX.hasteSeconds;
        this.addEffect('FIRE', caster, me.x, me.z, t, ELEMENT_FX.hasteSeconds);
        return true;
      case 'SWAP': {
        const target = this.nearestOther(caster, x, z, ELEMENT_FX.swapHitRadius);
        if (!target) return false; // nothing to swap with: keep the cooldown
        if (this.modsOf(target.state).reflect) {
          this.stun(caster, t, ELEMENT_FX.stunSeconds); // Phản Xạ: the swap backfires
          this.addEffect('BOLT', caster, me.x, me.z, t, ELEMENT_FX.flashSeconds);
          return true;
        }
        const o = target.sim.state;
        const e = this.addEffect('SWAP', caster, me.x, me.z, t, ELEMENT_FX.flashSeconds);
        e.x2 = o.x;
        e.z2 = o.z;
        const sx = me.x, sy = me.y, sz = me.z;
        me.x = o.x; me.y = o.y; me.z = o.z;
        o.x = sx; o.y = sy; o.z = sz;
        return true;
      }
      case 'CLONE': {
        for (let k = 0; k < ELEMENT_FX.cloneCount; k++) {
          const e = this.addEffect('CLONE', caster, me.x, me.z, t, ELEMENT_FX.cloneSeconds);
          e.y = me.y;
          const baseYaw = me.yaw + (k === 0 ? -0.6 : 0.6);
          e.yaw = baseYaw;
          this.clones.push({ effect: e, dirX: Math.sin(baseYaw), dirZ: Math.cos(baseYaw), baseYaw: me.yaw, turnIn: CLONE_TURN_SECONDS });
        }
        return true;
      }
      case 'BLINK': {
        const e = this.addEffect('BLINK', caster, x, z, t, ELEMENT_FX.flashSeconds);
        e.x2 = me.x;
        e.z2 = me.z;
        me.x = x;
        me.z = z;
        return true;
      }
      case 'DARK':
        for (const p of this.activeOthers(caster)) {
          const s = p.sim.state;
          if (Math.hypot(s.x - x, s.z - z) > ELEMENT_FX.darkRadius) continue;
          const victim = this.modsOf(p.state).reflect ? caster : p;
          victim.state.blindUntil = t + ELEMENT_FX.darkSeconds;
        }
        this.addEffect('DARK', caster, x, z, t, ELEMENT_FX.flashSeconds);
        return true;
    }
  }

  // --- non-movement games: the server picks the target ------------------------------------------

  private castAction(caster: GamePlayer, element: ElementId, t: number): boolean {
    const opponents = this.activeOthers(caster).filter((p) => caster.state.team < 0 || p.state.team !== caster.state.team);
    if (opponents.length === 0) return false;
    switch (element) {
      case 'THUNDER': {
        let target = opponents[Math.floor(this.rng() * opponents.length)]!;
        if (this.modsOf(target.state).reflect) target = caster;
        this.stun(target, t, ELEMENT_FX.actionStunSeconds);
        this.addEffect('BOLT', caster, target.state.x, target.state.z, t, ELEMENT_FX.flashSeconds);
        return true;
      }
      case 'DARK':
        for (const p of opponents) (this.modsOf(p.state).reflect ? caster : p).state.blindUntil = t + ELEMENT_FX.actionDarkSeconds;
        this.addEffect('DARK', caster, caster.state.x, caster.state.z, t, ELEMENT_FX.flashSeconds);
        return true;
      case 'SWAP': {
        const leader = [...opponents].sort((a, b) => b.state.score - a.state.score)[0]!;
        if (leader.state.score <= caster.state.score) return false; // nobody ahead
        if (this.modsOf(leader.state).reflect) {
          this.stun(caster, t, ELEMENT_FX.actionStunSeconds);
          this.addEffect('BOLT', caster, caster.state.x, caster.state.z, t, ELEMENT_FX.flashSeconds);
          return true;
        }
        const fromX = caster.state.x, fromZ = caster.state.z;
        if (!this.game?.swapPlayers?.(caster.id, leader.id)) return false;
        const e = this.addEffect('SWAP', caster, fromX, fromZ, t, ELEMENT_FX.flashSeconds);
        e.x2 = caster.state.x;
        e.z2 = caster.state.z;
        return true;
      }
      default:
        return false;
    }
  }

  /** Stun shortened by the victim's Phản Xạ card. */
  private stun(p: GamePlayer, t: number, seconds: number): void {
    p.state.stunUntil = Math.max(p.state.stunUntil, t + seconds * this.modsOf(p.state).stunMul);
  }

  private activeOthers(caster: GamePlayer): GamePlayer[] {
    return this.players.filter((p) => p.id !== caster.id && p.state.alive && p.state.roundState === 'ACTIVE');
  }

  private nearestOther(caster: GamePlayer, x: number, z: number, radius: number): GamePlayer | null {
    let best: GamePlayer | null = null;
    let bestD = radius;
    for (const p of this.activeOthers(caster)) {
      const d = Math.hypot(p.sim.state.x - x, p.sim.state.z - z);
      if (d <= bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  private addEffect(kind: EffectKind, owner: GamePlayer, x: number, z: number, t: number, seconds: number): ElementEffect {
    const e = new ElementEffect();
    e.id = this.nextId++;
    e.kind = kind;
    e.owner = owner.id;
    e.slot = owner.state.slot;
    e.x = x;
    e.z = z;
    e.x2 = x;
    e.z2 = z;
    e.y = 0;
    e.yaw = 0;
    e.start = t;
    e.until = t + seconds;
    this.state.effects.push(e);
    return e;
  }
}

function clampToRange(fromX: number, fromZ: number, x: number, z: number, range: number): { x: number; z: number } {
  const dx = x - fromX;
  const dz = z - fromZ;
  const d = Math.hypot(dx, dz);
  if (d <= range) return { x, z };
  return { x: fromX + (dx / d) * range, z: fromZ + (dz / d) * range };
}
