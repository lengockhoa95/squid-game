import * as THREE from 'three';
import { ELEMENT_FX, SLOT_LOOKS, createElementField, type ElementField } from '@sp/shared';
import type { ElementEffect, MatchState } from '@sp/shared/schema';
import type { MaterialLibrary } from '../core/MaterialLibrary.ts';
import { ResourceTracker } from '../core/ResourceTracker.ts';
import type { CharacterBody } from '../player/CharacterBody.ts';
import { createCharacterBody } from '../player/characters.ts';
import { NameTag } from '../player/NameTag.ts';
import { audio } from '../audio/AudioManager.ts';
import { Particles } from '../fx/Particles.ts';
import { shake } from '../core/CameraManager.ts';

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
  private readonly geo: Record<'pillar' | 'disc' | 'bolt' | 'ring' | 'cone' | 'torus', THREE.BufferGeometry>;
  private readonly mat: Record<'pillar' | 'puddle' | 'bolt' | 'wind' | 'blink' | 'swap' | 'dark' | 'fire' | 'stun' | 'rescue', THREE.Material>;
  /** Called once for every effect that appears (e.g. play the attacker's swing animation). */
  onNewEffect: ((e: ElementEffect) => void) | null = null;
  private actorPos: ((id: string) => THREE.Vector3 | null) | null = null;
  private readonly ropeMat = new THREE.LineBasicMaterial({ color: 0xe8d9b8 });
  /** Kenney particle textures for combat effects. */
  readonly fx = new Particles();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();

  constructor(materials: MaterialLibrary) {
    this.materials = materials;
    this.root.add(this.fx.root);
    const t = <G extends THREE.BufferGeometry>(g: G) => this.res.track(g);
    this.geo = {
      pillar: t(new THREE.CylinderGeometry(ELEMENT_FX.pillarRadius, ELEMENT_FX.pillarRadius * 1.15, ELEMENT_FX.pillarHeight, 7)),
      disc: t(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2)),
      bolt: t(new THREE.CylinderGeometry(0.12, 0.3, 14, 5)),
      ring: t(new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2)),
      cone: t(new THREE.ConeGeometry(0.35, 0.9, 6)),
      torus: t(new THREE.TorusGeometry(0.4, 0.06, 4, 12).rotateX(Math.PI / 2)),
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

  /** The local player's id (their own shots shake the screen). */
  localId = '';

  update(dt: number, state: MatchState, gameTime: number, actorPosition: (id: string) => THREE.Vector3 | null): void {
    this.actorPos = actorPosition;
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
          this.spawnFx(e, state);
          this.onNewEffect?.(e);
        }
      }
      this.animate(d, e, dt, gameTime);
    });
    for (const [id, d] of this.drawn) {
      if (live.has(id)) continue;
      d.object.removeFromParent();
      if (d.kind === 'HOOK') ((d.object as THREE.Group).children[0] as THREE.Line).geometry.dispose();
      d.clone?.tag?.dispose();
      d.clone?.model.dispose();
      this.drawn.delete(id);
    }
    if (this.seen.size > 500) this.seen.clear();
    this.fx.update(dt);

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
    this.fx.dispose();
    this.ropeMat.dispose();
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
      case 'HOOK': {
        // The rope: a line from the thrower's hand to the anchor, plus a little hook at the end.
        const g = new THREE.Group();
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
        const line = new THREE.Line(geo, this.ropeMat);
        line.frustumCulled = false;
        const head = new THREE.Mesh(this.geo.torus, this.mat.stun);
        head.scale.setScalar(0.5);
        g.add(line, head);
        return { object: g, kind: e.kind };
      }
      case 'SLASH':
      case 'SHOT':
      case 'ORB':
      case 'SMASH':
      case 'MSHOT':
      case 'EXPLODE':
      case 'GATE_BREAK':
      case 'ENRAGE':
      case 'TORNADO':
      case 'THRUST':
      case 'BREATH':
      case 'GATE_HIT':
      case 'QUAKE':
        return { object: new THREE.Group(), kind: e.kind }; // particles (spawnFx / animate)
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
      case 'HOOK': {
        const g = o as THREE.Group;
        const line = g.children[0] as THREE.Line;
        const head = g.children[1]!;
        const from = this.actorPos?.(e.owner);
        const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
        // Shoot out quickly, then stay attached while being reeled in.
        const k = Math.min(1, age / 0.12);
        const ox = from ? from.x : e.x;
        const oy = from ? from.y + 1.2 : e.y1;
        const oz = from ? from.z : e.z;
        const hx = ox + (e.x2 - ox) * k;
        const hy = oy + (e.y2 - oy) * k;
        const hz = oz + (e.z2 - oz) * k;
        pos.setXYZ(0, ox, oy, oz);
        pos.setXYZ(1, hx, hy, hz);
        pos.needsUpdate = true;
        head.position.set(hx, hy, hz);
        g.visible = f < 0.95;
        break;
      }
      case 'TORNADO': {
        // Lốc Kiếm: a spinning column of wind flying along its path.
        const p = Math.min(1, f);
        const x = e.x + (e.x2 - e.x) * p;
        const z = e.z + (e.z2 - e.z) * p;
        for (let k = 0; k < 3; k++) {
          const a = gameTime * 14 + k * 2.1;
          const yy = 0.3 + k * 0.7;
          const r = 0.4 + k * 0.35;
          this.fx.sprite({ tex: 'twirl_01', color: k === 1 ? 0xbfffe0 : 0x7bffb0, pos: { x: x + Math.cos(a) * r, y: e.y + yy, z: z + Math.sin(a) * r }, life: 0.25, size: 0.9 + k * 0.4, size1: 0.3, spin: 8, opacity: 0.9, additive: false });
        }
        break;
      }
      case 'BREATH': {
        // Keep the fire stream going while the effect lives.
        const yaw = Math.atan2(e.x2 - e.x, e.z2 - e.z);
        for (let k = 0; k < 3; k++) {
          const a = yaw + (Math.random() - 0.5) * 0.9;
          const sp = 9 + Math.random() * 5;
          this.fx.sprite({
            tex: Math.random() < 0.5 ? 'flame_01' : 'fire_01', color: Math.random() < 0.5 ? 0xff7a2f : 0xffc23f,
            pos: { x: e.x + Math.sin(yaw) * 1.6, y: 1.6, z: e.z + Math.cos(yaw) * 1.6 },
            vel: { x: Math.sin(a) * sp, y: -0.5 + Math.random(), z: Math.cos(a) * sp },
            life: 0.55 + Math.random() * 0.25, size: 0.8, size1: 2.8, spin: 2,
          });
        }
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

  /** One-shot particle bursts when an effect first appears. */
  private spawnFx(e: ElementEffect, state: MatchState): void {
    const fx = this.fx;
    switch (e.kind) {
      case 'SHOT': {
        const weapon = state.players.get(e.owner)?.weapon ?? '';
        const bow = weapon === 'BOW';
        const sniper = weapon === 'CROSSBOW';
        const shotgun = weapon === 'SHOTGUN';
        const yaw = Math.atan2(e.x2 - e.x, e.z2 - e.z);
        // 3D shots carry absolute start/end heights (y1, y2); older flashes use the floor height.
        const has3d = e.y1 !== 0 || e.y2 !== 0;
        const from = this.tmpA.set(e.x + Math.sin(yaw) * 0.5, has3d ? e.y1 : e.y + 0.75, e.z + Math.cos(yaw) * 0.5).clone();
        const to = this.tmpB.set(e.x2, has3d ? e.y2 : e.y + 0.75, e.z2).clone();
        if (!bow) {
          fx.sprite({ tex: 'muzzle_01', color: 0xffd23f, pos: from, life: 0.1, size: 1.4, size1: 0.6 });
          fx.sprite({ tex: 'light_01', color: 0xffb040, pos: from, life: 0.12, size: 1.6, size1: 0.4 });
        }
        const hit = from.distanceTo(to) > 0.5;
        // Slower and wider than real bullets so every shot is easy to follow.
        const color = sniper ? 0x6ff7ff : shotgun ? 0xff9a3f : bow ? 0xe8fff0 : 0xffe040;
        fx.streak('trace_01', color, from, to, sniper ? 90 : bow ? 30 : 45, sniper ? 9 : shotgun ? 2 : bow ? 3.5 : 4.5, sniper ? 0.9 : shotgun ? 0.7 : bow ? 1.1 : 1.3, () => {
          if (hit) fx.sparks(to, color, sniper ? 10 : 7, 3.5);
        }, sniper ? 1.4 : shotgun ? 0.6 : bow ? 1 : 1.2);
        if (e.owner === this.localId && (sniper || shotgun)) shake(sniper ? 0.12 : 0.08);
        break;
      }
      case 'SLASH': {
        const yaw = Math.atan2(e.x2 - e.x, e.z2 - e.z);
        const reach = Math.max(1.2, Math.hypot(e.x2 - e.x, e.z2 - e.z));
        // A solid swing band (white core + coloured rim) plus sparks along its edge.
        const at = { x: e.x, y: e.y + 0.8, z: e.z };
        fx.arc(at, yaw, reach * 0.45, reach, 1.15, -0.7, 0xffffff, 0.24);
        fx.arc(at, yaw, reach * 0.85, reach * 1.08, 1.2, -0.7, 0x5ab8ff, 0.28);
        fx.arc(at, yaw, reach * 0.3, reach * 0.95, 1.1, -0.7, 0xfff0a0, 0.2, true);
        for (let k = -2; k <= 2; k++) {
          const a = yaw + k * 0.45;
          fx.sprite({
            tex: 'spark_01', color: 0xbfe8ff, pos: { x: e.x + Math.sin(a) * reach * 0.9, y: e.y + 0.8, z: e.z + Math.cos(a) * reach * 0.9 },
            life: 0.2, size: 0.5, size1: 0.1, vel: { x: Math.sin(a) * 3, y: 1, z: Math.cos(a) * 3 },
          });
        }
        break;
      }
      case 'THRUST': {
        // Thương Xuyên Thấu: a long pink lance of light.
        const from = this.tmpA.set(e.x, e.y1 || e.y + 0.8, e.z).clone();
        const to = this.tmpB.set(e.x2, e.y2 || e.y + 0.8, e.z2).clone();
        fx.streak('trace_01', 0xff7bd5, from, to, 60, 6, 1.4, () => fx.sparks(to, 0xff9be0, 6, 3), 1.2);
        break;
      }
      case 'MSHOT': {
        // Monster arrow: red, real speed — you can see it coming and step aside.
        const from = this.tmpA.set(e.x, e.y1, e.z).clone();
        const to = this.tmpB.set(e.x2, e.y2, e.z2).clone();
        fx.streak('trace_01', 0xff4f3f, from, to, 26, 2.2, 0.8, () => fx.sparks(to, 0xff6a4f, 4, 2.5), 0.7);
        break;
      }
      case 'EXPLODE': {
        shake(0.3);
        // Fireball + smoke + shock ring.
        const c = { x: e.x, y: e.y + 0.6, z: e.z };
        fx.sprite({ tex: 'light_01', color: 0xffc23f, pos: c, life: 0.35, size: 6, size1: 2 });
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const sp = 4 + Math.random() * 4;
          fx.sprite({
            tex: Math.random() < 0.5 ? 'flame_01' : 'fire_01', color: Math.random() < 0.5 ? 0xff7a2f : 0xffc23f, pos: c,
            vel: { x: Math.cos(a) * sp, y: 1.5 + Math.random() * 3, z: Math.sin(a) * sp }, life: 0.5 + Math.random() * 0.3, size: 1.2, size1: 2.6, spin: 3,
          });
        }
        fx.smoke(c, 3, 8);
        fx.decal('circle_01', 0xffa040, { x: e.x, y: e.y + 0.12, z: e.z }, 0, 0, 1, 9, 0.45);
        fx.decal('scorch_01', 0x2a1a10, { x: e.x, y: e.y + 0.06, z: e.z }, Math.random() * 6, 0, 4, 4.5, 2, false, 0.75);
        break;
      }
      case 'ORB': {
        // Pháo Tay: a glowing shell arcs to the target and bursts.
        const from = this.tmpA.set(e.x, e.y1 || e.y + 1, e.z).clone();
        const to = this.tmpB.set(e.x2, e.y2 || e.y + 0.5, e.z2).clone();
        fx.streak('trace_01', 0xff8a2f, from, to, 34, 2.5, 1.1, () => {
          fx.sprite({ tex: 'light_01', color: 0xffc23f, pos: to, life: 0.3, size: 5, size1: 1.5 });
          for (let k = 0; k < 10; k++) {
            const a = (k / 10) * Math.PI * 2;
            fx.sprite({ tex: 'flame_01', color: 0xff7a2f, pos: to, vel: { x: Math.cos(a) * 5, y: 2 + Math.random() * 2, z: Math.sin(a) * 5 }, life: 0.45, size: 1, size1: 2.2, spin: 3 });
          }
          fx.smoke(to, 2, 4);
          if (e.owner === this.localId) shake(0.18);
        }, 1.3);
        break;
      }
      case 'SMASH':
        // Búa Tạ: a shock ring, dust and stones.
        fx.decal('circle_01', 0xffe0a0, { x: e.x, y: e.y + 0.1, z: e.z }, 0, 0, 0.6, 6, 0.4);
        fx.decal('scorch_01', 0x3a2a1a, { x: e.x, y: e.y + 0.05, z: e.z }, Math.random() * 6, 0, 2.6, 3.2, 1.6, false, 0.6);
        fx.smoke({ x: e.x, y: e.y + 0.3, z: e.z }, 1.8, 6);
        fx.sparks({ x: e.x, y: e.y + 0.3, z: e.z }, 0xc9a27e, 10, 5);
        shake(e.owner === this.localId ? 0.35 : 0.1);
        break;
      case 'GATE_BREAK': {
        shake(0.5);
        const c = { x: e.x, y: 1.4, z: e.z };
        fx.smoke(c, 4, 12);
        fx.sparks(c, 0xffb040, 16, 6);
        fx.sprite({ tex: 'light_01', color: 0xff5a2f, pos: c, life: 0.5, size: 7, size1: 2 });
        break;
      }
      case 'ENRAGE':
        fx.decal('magic_01', 0xff2a1a, { x: e.x, y: e.y + 0.2, z: e.z }, 0, 0, 2, 10, 0.8);
        fx.sprite({ tex: 'light_01', color: 0xff3b3b, pos: { x: e.x, y: e.y + 2.5, z: e.z }, life: 0.7, size: 4, size1: 9 });
        break;
      case 'HOOK':
        fx.sprite({ tex: 'star_01', color: 0xd9f6ff, pos: { x: e.x2, y: e.y2, z: e.z2 }, life: 0.35, size: 1.2, size1: 0.3 });
        break;
      case 'QUAKE':
        fx.decal('circle_01', 0xffa040, { x: e.x, y: e.y + 0.1, z: e.z }, 0, 0, 1, 13, 0.5);
        fx.decal('scorch_01', 0x2a1a10, { x: e.x, y: e.y + 0.05, z: e.z }, Math.random() * 6, 0, 5, 6, 1.5, false, 0.7);
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          fx.smoke({ x: e.x + Math.cos(a) * 3, y: e.y + 0.3, z: e.z + Math.sin(a) * 3 }, 1.4, 1);
        }
        break;
      case 'GATE_HIT':
        fx.sparks({ x: e.x, y: 1.2, z: e.z - 0.6 }, 0xffb040, 4, 3);
        break;
      case 'BOLT':
        fx.sprite({ tex: 'light_01', color: 0xfff27a, pos: { x: e.x, y: e.y + 0.6, z: e.z }, life: 0.3, size: 3, size1: 1 });
        fx.sparks({ x: e.x, y: e.y + 0.3, z: e.z }, 0xfff27a, 8, 5);
        break;
      case 'WIND':
        fx.decal('twirl_01', 0xdff8ff, { x: e.x, y: e.y + 0.4, z: e.z }, 0, 0, 2, ELEMENT_FX.windRadius * 2.2, 0.5, true, 0.8);
        break;
      case 'PILLAR':
        fx.smoke({ x: e.x, y: e.y + 0.2, z: e.z }, 1.6, 5);
        break;
      case 'DARK':
        fx.sprite({ tex: 'magic_01', color: 0x7a4aff, pos: { x: e.x, y: e.y + 1, z: e.z }, life: 0.8, size: 2, size1: 7, spin: 1, opacity: 0.8 });
        break;
      case 'BLINK':
      case 'SWAP':
        fx.sprite({ tex: 'magic_01', color: e.kind === 'BLINK' ? 0x9b7bff : 0xd27dff, pos: { x: e.x, y: e.y + 0.8, z: e.z }, life: 0.5, size: 1.5, size1: 0.2, spin: 4 });
        fx.sprite({ tex: 'magic_01', color: e.kind === 'BLINK' ? 0x9b7bff : 0xd27dff, pos: { x: e.x2, y: e.y + 0.8, z: e.z2 }, life: 0.5, size: 0.2, size1: 1.8, spin: -4 });
        break;
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
    else if (kind === 'EXPLODE' || kind === 'GATE_BREAK') audio.play('rumble', 0.45);
    else if (kind === 'ENRAGE') audio.play('rumble', 0.3);
    else if (kind === 'HOOK') audio.play('whoosh', 0.2);
    else if (kind === 'MSHOT') audio.play('whoosh', 0.06);
    else if (kind === 'WIND' || kind === 'BLINK' || kind === 'SWAP' || kind === 'BUMP') audio.play('whoosh', 0.16);
    else audio.play('cast', 0.12);
  }
}
