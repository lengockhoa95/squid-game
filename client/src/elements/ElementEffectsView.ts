import * as THREE from 'three';
import { ELEMENT_FX, SLOT_LOOKS, createElementField, type ElementField } from '@sp/shared';
import type { ElementEffect, MatchState } from '@sp/shared/schema';
import type { MaterialLibrary } from '../core/MaterialLibrary.ts';
import { ResourceTracker } from '../core/ResourceTracker.ts';
import type { CharacterBody } from '../player/CharacterBody.ts';
import { createCharacterBody } from '../player/characters.ts';
import { NameTag } from '../player/NameTag.ts';
import { audio } from '../audio/AudioManager.ts';

interface Drawn {
  object: THREE.Object3D;
  kind: string;
  clone?: { model: CharacterBody; tag: NameTag | null };
}

interface StatusMarks {
  stun: THREE.Mesh;
  fire: THREE.Mesh;
}

/**
 * Draws element effects from the synced list (pillars, puddles, clones, flashes) and status marks
 * above players (stun halo, fire trail). Also mirrors pillars/puddles into an ElementField so the
 * local prediction steps through the same obstacles as the server.
 */
export class ElementEffectsView {
  readonly root = new THREE.Group();
  readonly field: ElementField = createElementField();
  private readonly materials: MaterialLibrary;
  private readonly res = new ResourceTracker();
  private readonly drawn = new Map<number, Drawn>();
  private readonly marks = new Map<string, StatusMarks>();
  private readonly seen = new Set<number>();
  private readonly live = new Set<number>();
  private readonly geo: Record<'pillar' | 'disc' | 'bolt' | 'ring' | 'cone' | 'torus' | 'beam' | 'arc' | 'breath', THREE.BufferGeometry>;
  private readonly mat: Record<'pillar' | 'puddle' | 'bolt' | 'wind' | 'blink' | 'swap' | 'dark' | 'fire' | 'stun' | 'rescue' | 'slash' | 'shot', THREE.Material>;
  /** Called once for every effect that appears (e.g. play the attacker's swing animation). */
  onNewEffect: ((e: ElementEffect) => void) | null = null;

  constructor(materials: MaterialLibrary) {
    this.materials = materials;
    const t = <G extends THREE.BufferGeometry>(g: G) => this.res.track(g);
    this.geo = {
      pillar: t(new THREE.CylinderGeometry(ELEMENT_FX.pillarRadius, ELEMENT_FX.pillarRadius * 1.15, ELEMENT_FX.pillarHeight, 7)),
      disc: t(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2)),
      bolt: t(new THREE.CylinderGeometry(0.12, 0.3, 14, 5)),
      ring: t(new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2)),
      cone: t(new THREE.ConeGeometry(0.35, 0.9, 6)),
      torus: t(new THREE.TorusGeometry(0.4, 0.06, 4, 12).rotateX(Math.PI / 2)),
      // Unit beam along +z starting at the origin (scaled to length).
      beam: t(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5)),
      // Swing arc in front (+z), flat.
      arc: t(new THREE.RingGeometry(0.7, 1, 20, 1, Math.PI / 2 - 1.1, 2.2).rotateX(-Math.PI / 2).rotateY(Math.PI)),
      // Fire cone pointing along +z, tip at the origin, unit length.
      breath: t(new THREE.ConeGeometry(0.5, 1, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 0.5)),
    };
    const basic = (color: number, opacity: number) =>
      this.res.track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    this.mat = {
      pillar: materials.lambert(0x8a5a32),
      puddle: basic(0x2f8fff, 0.55),
      bolt: basic(0xfff27a, 0.95),
      wind: basic(0xdff8ff, 0.8),
      blink: basic(0x9b7bff, 0.85),
      swap: basic(0xd27dff, 0.85),
      dark: basic(0x1a1030, 0.75),
      fire: basic(0xff7a2f, 0.85),
      stun: basic(0xffe14a, 0.95),
      rescue: basic(0xff4f6d, 0.9),
      slash: basic(0xffffff, 0.85),
      shot: basic(0xfff27a, 0.9),
    };
  }

  /** Rebuild the prediction field from the latest state (call on every snapshot). */
  syncField(state: MatchState): void {
    this.field.pillars.length = 0;
    this.field.puddles.length = 0;
    state.effects.forEach((e) => {
      if (e.kind === 'PILLAR') this.field.pillars.push({ x: e.x, y: e.y, z: e.z, until: e.until });
      else if (e.kind === 'PUDDLE') this.field.puddles.push({ x: e.x, y: e.y, z: e.z, until: e.until, owner: e.owner });
    });
  }

  update(dt: number, state: MatchState, gameTime: number, actorPosition: (id: string) => THREE.Vector3 | null): void {
    const live = this.live;
    live.clear();
    state.effects.forEach((e) => {
      live.add(e.id);
      let d = this.drawn.get(e.id);
      if (!d) {
        d = this.create(e, state);
        this.drawn.set(e.id, d);
        this.root.add(d.object);
        if (!this.seen.has(e.id)) {
          this.seen.add(e.id);
          this.playCue(e.kind);
          this.onNewEffect?.(e);
        }
      }
      this.animate(d, e, dt, gameTime);
    });
    for (const [id, d] of this.drawn) {
      if (live.has(id)) continue;
      d.object.removeFromParent();
      d.clone?.tag?.dispose();
      d.clone?.model.dispose();
      this.drawn.delete(id);
    }
    if (this.seen.size > 500) this.seen.clear();

    // Status marks follow the rendered characters.
    state.players.forEach((p) => {
      const stunned = gameTime < p.stunUntil;
      const hasted = gameTime < p.hasteUntil;
      let m = this.marks.get(p.id);
      if (!m && !stunned && !hasted) return;
      if (!m) {
        m = { stun: new THREE.Mesh(this.geo.torus, this.mat.stun), fire: new THREE.Mesh(this.geo.cone, this.mat.fire) };
        this.root.add(m.stun, m.fire);
        this.marks.set(p.id, m);
      }
      const pos = actorPosition(p.id);
      m.stun.visible = stunned && pos !== null;
      m.fire.visible = hasted && pos !== null;
      if (!pos) return;
      m.stun.position.set(pos.x, pos.y + 1.75, pos.z);
      m.stun.rotation.y += dt * 8;
      m.fire.position.set(pos.x, pos.y + 0.3, pos.z);
      m.fire.rotation.x = Math.PI; // flame points down = trail under the feet
      m.fire.scale.setScalar(0.8 + Math.sin(gameTime * 30) * 0.2);
    });
  }

  dispose(): void {
    for (const d of this.drawn.values()) {
      d.clone?.tag?.dispose();
      d.clone?.model.dispose();
    }
    this.drawn.clear();
    this.marks.clear();
    this.root.removeFromParent();
    this.root.clear();
    this.res.dispose();
  }

  private create(e: ElementEffect, state: MatchState): Drawn {
    switch (e.kind) {
      case 'PILLAR': {
        const m = new THREE.Mesh(this.geo.pillar, this.mat.pillar);
        m.castShadow = true;
        m.receiveShadow = true;
        return { object: m, kind: e.kind };
      }
      case 'PUDDLE':
        return { object: new THREE.Mesh(this.geo.disc, this.mat.puddle), kind: e.kind };
      case 'BOLT':
        return { object: new THREE.Mesh(this.geo.bolt, this.mat.bolt), kind: e.kind };
      case 'CLONE': {
        const look = SLOT_LOOKS[e.slot] ?? SLOT_LOOKS[0]!;
        const owner = state.players.get(e.owner);
        const model = createCharacterBody(this.materials, e.slot, owner?.character ?? '');
        model.setElement('CLONE'); // same body, tattoo and name as the caster: clones are indistinguishable
        let tag: NameTag | null = null;
        if (owner) {
          tag = new NameTag(owner.nickname, look.color);
          tag.attach(model.group, model.tagHeight);
        }
        return { object: model.group, kind: e.kind, clone: { model, tag } };
      }
      case 'SWAP': {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(this.geo.ring, this.mat.swap), new THREE.Mesh(this.geo.ring, this.mat.swap));
        return { object: g, kind: e.kind };
      }
      case 'BLINK': {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(this.geo.ring, this.mat.blink), new THREE.Mesh(this.geo.ring, this.mat.blink));
        return { object: g, kind: e.kind };
      }
      case 'WIND':
      case 'BUMP':
        return { object: new THREE.Mesh(this.geo.ring, this.mat.wind), kind: e.kind };
      case 'DARK':
        return { object: new THREE.Mesh(this.geo.disc, this.mat.dark), kind: e.kind };
      case 'RESCUE':
        return { object: new THREE.Mesh(this.geo.ring, this.mat.rescue), kind: e.kind };
      case 'SLASH':
        return { object: new THREE.Mesh(this.geo.arc, this.mat.slash), kind: e.kind };
      case 'SHOT':
        return { object: new THREE.Mesh(this.geo.beam, this.mat.shot), kind: e.kind };
      case 'BREATH':
        return { object: new THREE.Mesh(this.geo.breath, this.mat.fire), kind: e.kind };
      case 'GATE_HIT':
        return { object: new THREE.Mesh(this.geo.ring, this.mat.fire), kind: e.kind };
      case 'QUAKE':
        return { object: new THREE.Mesh(this.geo.ring, this.mat.fire), kind: e.kind };
      case 'FIRE':
      default:
        return { object: new THREE.Group(), kind: e.kind }; // FIRE is drawn as a status mark
    }
  }

  private animate(d: Drawn, e: ElementEffect, dt: number, gameTime: number): void {
    const age = Math.max(0, gameTime - e.start);
    const life = Math.max(0.01, e.until - e.start);
    const f = Math.min(1, age / life);
    const o = d.object;
    switch (d.kind) {
      case 'PILLAR': {
        const rise = Math.min(1, age / 0.25);
        const sink = Math.min(1, Math.max(0, (e.until - gameTime) / 0.3));
        const h = ELEMENT_FX.pillarHeight * Math.min(rise, sink);
        o.position.set(e.x, e.y + h - ELEMENT_FX.pillarHeight / 2, e.z);
        break;
      }
      case 'PUDDLE': {
        const r = ELEMENT_FX.puddleRadius * Math.min(1, age / 0.3);
        o.scale.set(r, 1, r);
        o.position.set(e.x, e.y + 0.03, e.z);
        break;
      }
      case 'BOLT':
        o.position.set(e.x, e.y + 7, e.z);
        o.visible = Math.floor(age * 30) % 2 === 0 || age > 0.25;
        o.scale.set(1 - f, 1, 1 - f);
        break;
      case 'CLONE': {
        const c = d.clone!;
        const g = c.model.group;
        if (age < 0.05) g.position.set(e.x, e.y, e.z);
        const k = Math.min(1, dt * 12);
        g.position.x += (e.x - g.position.x) * k;
        g.position.z += (e.z - g.position.z) * k;
        g.position.y = e.y;
        g.rotation.y = e.yaw;
        c.model.animate(dt, ELEMENT_FX.cloneSpeed, true);
        break;
      }
      case 'RESCUE': {
        const r = 0.8 + f * 0.6;
        o.scale.set(r, 1, r);
        o.position.set(e.x, e.y + 0.2 + f * 2.2, e.z);
        break;
      }
      case 'BUMP': {
        const r = 0.4 + 1.6 * f;
        o.scale.set(r, 1, r);
        o.position.set(e.x, e.y + 0.6, e.z);
        break;
      }
      case 'WIND': {
        const r = 0.5 + ELEMENT_FX.windRadius * f;
        o.scale.set(r, 1, r);
        o.position.set(e.x, e.y + 0.4, e.z);
        break;
      }
      case 'DARK': {
        const r = ELEMENT_FX.darkRadius * Math.min(1, f * 3);
        o.scale.set(r, 1, r);
        o.position.set(e.x, e.y + 0.05, e.z);
        break;
      }
      case 'SLASH': {
        const dx = e.x2 - e.x;
        const dz = e.z2 - e.z;
        const reach = Math.max(1, Math.hypot(dx, dz));
        o.position.set(e.x, e.y + 0.7, e.z);
        o.rotation.y = Math.atan2(dx, dz);
        o.scale.setScalar(reach * (0.7 + 0.3 * Math.min(1, f * 4)));
        o.visible = age < 0.25;
        break;
      }
      case 'SHOT': {
        const dx = e.x2 - e.x;
        const dz = e.z2 - e.z;
        o.position.set(e.x, e.y + 0.8, e.z);
        o.rotation.y = Math.atan2(dx, dz);
        const w = 0.08 * (1 - Math.min(1, f * 3));
        o.scale.set(w, w, Math.max(0.1, Math.hypot(dx, dz)));
        o.visible = age < 0.25;
        break;
      }
      case 'BREATH': {
        const dx = e.x2 - e.x;
        const dz = e.z2 - e.z;
        const len = Math.max(1, Math.hypot(dx, dz));
        o.position.set(e.x, 1, e.z);
        o.rotation.y = Math.atan2(dx, dz);
        const grow = Math.min(1, f * 2.5);
        o.scale.set(len * 0.55 * grow, len * 0.4 * grow, len * grow);
        break;
      }
      case 'QUAKE': {
        const r = 0.5 + 6 * Math.min(1, f * 2);
        o.scale.set(r, 1, r);
        o.position.set(e.x, e.y + 0.15, e.z);
        o.visible = f < 0.6;
        break;
      }
      case 'GATE_HIT': {
        const r = 0.5 + 2 * f;
        o.scale.set(r, 1, r);
        o.position.set(e.x, 1.2, e.z - 0.5);
        o.rotation.x = Math.PI / 2;
        break;
      }
      case 'SWAP':
      case 'BLINK': {
        const [a, b] = (o as THREE.Group).children as [THREE.Object3D, THREE.Object3D];
        const r = 0.6 + 1.2 * f;
        a.position.set(e.x, e.y + 0.1 + 1.5 * f, e.z);
        b.position.set(e.x2, e.y + 0.1 + 1.5 * f, e.z2);
        a.scale.set(r, 1, r);
        b.scale.set(r, 1, r);
        break;
      }
    }
  }

  private playCue(kind: string): void {
    if (kind === 'BOLT') audio.play('zap', 0.16);
    else if (kind === 'RESCUE') audio.play('pass', 0.2);
    else if (kind === 'PILLAR') audio.play('rumble', 0.2);
    else if (kind === 'SLASH') audio.play('whoosh', 0.12);
    else if (kind === 'SHOT') audio.play('zap', 0.08);
    else if (kind === 'BREATH') audio.play('rumble', 0.25);
    else if (kind === 'GATE_HIT') audio.play('rumble', 0.08);
    else if (kind === 'QUAKE') audio.play('rumble', 0.35);
    else if (kind === 'WIND' || kind === 'BLINK' || kind === 'SWAP' || kind === 'BUMP') audio.play('whoosh', 0.16);
    else audio.play('cast', 0.12);
  }
}
