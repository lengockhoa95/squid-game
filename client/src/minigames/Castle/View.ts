import * as THREE from 'three';
import {
  CASTLE, MONSTERS, RARITIES, WEAPONS, castleStep, createCastleWorld, isWeaponId,
  type MonsterKind, type QualityPreset,
} from '@sp/shared';
import type { SceneContext } from '../../core/GameScene.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';
import type { MinigameView, ViewFrame } from '../framework/MinigameView.ts';
import { StageLights, placeBox, setSky } from '../framework/stage.ts';
import { createWeaponModel } from '../../player/characters.ts';
import { MonsterModel, loadMonsters, monstersLoaded, type MonsterAnim } from './monsters.ts';
import { buildCastle, loadCastleKit } from './castleKit.ts';
import { Particles } from '../../fx/Particles.ts';

const DEG = Math.PI / 180;

interface MonsterEntity {
  /** Positioned holder (HP bar lives here, unrotated); the model inside it turns with the monster. */
  holder: THREE.Group;
  model: MonsterModel;
  kind: MonsterKind;
  hpBg: THREE.Sprite;
  hpFg: THREE.Sprite;
  lastHit: number;
  dead: boolean;
  punch: number;
  real: boolean;
}

interface PickupEntity {
  root: THREE.Group;
  model: THREE.Object3D | null;
}

/** Castle courtyard: wall + gate (reddens as it breaks), low walls, monsters with HP bars, weapon pickups. */
class CastleView implements MinigameView {
  readonly step = castleStep(createCastleWorld());
  readonly clickTargets: THREE.Object3D[] = [];
  readonly cameraPreset = { yaw: 0, pitch: 34 * DEG, distance: 12 };
  private readonly root: THREE.Object3D;
  private readonly lights: StageLights;
  private readonly gate: THREE.Mesh;
  private readonly gateMat: THREE.MeshLambertMaterial;
  private readonly monsters = new Map<number, MonsterEntity>();
  private readonly pickups = new Map<number, PickupEntity>();
  private readonly fallbackMat: THREE.Material;
  private readonly hpBgMat: THREE.SpriteMaterial;
  private readonly hpFgMat: THREE.SpriteMaterial;
  private readonly ringGeo: THREE.BufferGeometry;
  /** Pickup ring / light beam per rarity. */
  private readonly ringMats: THREE.Material[];
  private readonly beamGeo: THREE.BufferGeometry;
  private loaded = false;
  private readonly fx = new Particles();
  private disposed = false;
  private kitGate: THREE.Object3D | null = null;
  private time = 0;

  constructor(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker) {
    this.root = root;
    setSky(scene, 0x8ec5ff, 40, 120);
    this.lights = new StageLights(root, 22);
    const m = ctx.materials;
    const unit = res.track(new THREE.BoxGeometry(1, 1, 1));
    const h = CASTLE.halfWidth;
    const ground = placeBox(new THREE.Mesh(unit, m.lambert(0x7bbf5a)), -h - 6, h + 6, CASTLE.spawnZ - 12, CASTLE.gateZ + 8, -1, 0);
    ground.receiveShadow = true;
    root.add(ground);
    this.clickTargets.push(ground);
    const placeholders = new THREE.Group();
    root.add(placeholders);
    // Castle wall (a low parapet so the camera behind the players can see over it), towers, gate.
    const stone = m.lambert(0x9a96a8);
    placeholders.add(placeBox(new THREE.Mesh(unit, stone), -h, -2.2, CASTLE.gateZ + 0.5, CASTLE.gateZ + 2, 0, 1.5));
    placeholders.add(placeBox(new THREE.Mesh(unit, stone), 2.2, h, CASTLE.gateZ + 0.5, CASTLE.gateZ + 2, 0, 1.5));
    for (const x of [-h, h]) placeholders.add(placeBox(new THREE.Mesh(unit, m.lambert(0x857f96)), x - 1.5, x + 1.5, CASTLE.gateZ - 0.5, CASTLE.gateZ + 2.5, 0, 5));
    for (const x of [-3, 3]) placeholders.add(placeBox(new THREE.Mesh(unit, m.lambert(0x857f96)), x - 0.8, x + 0.8, CASTLE.gateZ + 0.3, CASTLE.gateZ + 2.2, 0, 2.4));
    this.gateMat = res.track(new THREE.MeshLambertMaterial({ color: 0x8b5a2b }));
    this.gate = placeBox(new THREE.Mesh(unit, this.gateMat), -2.2, 2.2, CASTLE.gateZ + 0.6, CASTLE.gateZ + 1, 0, 1.8);
    this.gate.castShadow = true;
    placeholders.add(this.gate);
    // Low walls (same as the collision world).
    for (const b of createCastleWorld().boxes.slice(1)) {
      const wall = placeBox(new THREE.Mesh(unit, stone), b.minX, b.maxX, b.minZ, b.maxZ, 0, b.top);
      wall.castShadow = true;
      placeholders.add(wall);
    }
    // Monster gate in the distance.
    placeholders.add(placeBox(new THREE.Mesh(unit, m.lambert(0x3b2d4a)), -6, 6, CASTLE.spawnZ - 3, CASTLE.spawnZ - 2, 0, 4));
    this.fallbackMat = m.lambert(0x6ad36a);
    this.hpBgMat = res.track(new THREE.SpriteMaterial({ color: 0x222233, depthTest: false }));
    this.hpFgMat = res.track(new THREE.SpriteMaterial({ color: 0xff4f6d, depthTest: false }));
    this.ringGeo = res.track(new THREE.RingGeometry(0.5, 0.65, 24).rotateX(-Math.PI / 2));
    this.ringMats = RARITIES.map((r) => m.basic(new THREE.Color(r.color).getHex(), 0.85));
    this.beamGeo = res.track(new THREE.CylinderGeometry(0.25, 0.4, 6, 10, 1, true).translate(0, 3, 0));
    void loadMonsters().then(() => {
      this.loaded = true;
    });
    // Kenney Castle Kit replaces the placeholder boxes once loaded.
    void loadCastleKit().then(() => {
      if (this.disposed) return;
      const kit = buildCastle();
      if (kit.root.children.length === 0) return;
      placeholders.visible = false;
      root.add(kit.root);
      this.kitGate = kit.gate;
    });
    root.add(this.fx.root);
    this.applyQuality(ctx.quality);
  }

  cameraFocus(): null {
    return null;
  }

  update(dt: number, frame: ViewFrame): void {
    this.time += dt;
    const castle = frame.state.castle;
    if (castle) {
      // Gate: wood → red as it breaks.
      const ratio = castle.gateMax > 0 ? castle.gate / castle.gateMax : 1;
      this.gateMat.color.setRGB(0.55 + (1 - ratio) * 0.45, 0.35 * ratio, 0.17 * ratio);
      this.gate.visible = castle.gate > 0;
      if (this.kitGate) {
        // Kit gate: sinks and shakes as it breaks.
        this.kitGate.visible = castle.gate > 0;
        this.kitGate.position.x = ratio < 0.5 ? Math.sin(this.time * 30) * 0.04 * (1 - ratio) : 0;
      }
      // Monsters: create/update/remove by id; rebuild placeholders once real models load.
      const seen = new Set<number>();
      castle.monsters.forEach((mon) => {
        seen.add(mon.id);
        let e = this.monsters.get(mon.id);
        if (e && !e.real && this.loaded && monstersLoaded()) {
          this.removeMonster(mon.id);
          e = undefined;
        }
        if (!e) e = this.addMonster(mon.id, mon.kind as MonsterKind, mon.x, mon.y, mon.z);
        const g = e.holder;
        const k = Math.min(1, dt * 12);
        g.position.x += (mon.x - g.position.x) * k;
        g.position.y += (mon.y - g.position.y) * k;
        g.position.z += (mon.z - g.position.z) * k;
        e.model.root.rotation.y = mon.yaw;
        const anim: MonsterAnim = mon.state === 'DIE' ? 'die' : mon.state === 'BREATH' ? 'breath' : mon.state === 'ATTACK' ? 'attack' : mon.state === 'LAND' || mon.state === 'STUN' ? 'idle' : 'move';
        e.model.play(anim);
        e.model.update(dt);
        const mid = { x: g.position.x, y: g.position.y + (e.kind === 'DRAGON' ? 2 : 0.6), z: g.position.z };
        if (mon.hitAt !== e.lastHit) {
          if (e.lastHit !== -1) this.fx.sparks(mid, 0xff6a4f, 5, 3);
          e.lastHit = mon.hitAt;
          e.punch = 0.18;
        }
        if (mon.state === 'DIE' && !e.dead) {
          e.dead = true;
          this.fx.smoke(mid, e.kind === 'DRAGON' ? 4 : 1.4, e.kind === 'DRAGON' ? 10 : 4);
        }
        e.punch = Math.max(0, e.punch - dt);
        e.model.root.scale.setScalar(1 + e.punch);
        const top = MONSTERS[e.kind].fly > 0 && e.kind !== 'DRAGON' ? 1.2 : e.kind === 'DRAGON' ? 4.2 : e.kind === 'SKELETON' ? 2 : 1.3;
        const width = e.kind === 'DRAGON' ? 3 : 1;
        const hp = Math.max(0, mon.hp / (mon.maxHp || 1));
        e.hpBg.position.set(0, top, 0);
        e.hpBg.scale.set(width, 0.12, 1);
        e.hpFg.position.set(-width / 2, top, 0);
        e.hpFg.scale.set(width * hp, 0.1, 1);
        e.hpBg.visible = e.hpFg.visible = mon.state !== 'DIE';
      });
      for (const id of [...this.monsters.keys()]) if (!seen.has(id)) this.removeMonster(id);
      // Weapon pickups.
      const seenP = new Set<number>();
      castle.pickups.forEach((pk) => {
        seenP.add(pk.id);
        let p = this.pickups.get(pk.id);
        if (!p) {
          const g = new THREE.Group();
          const model = isWeaponId(pk.weapon) ? createWeaponModel(WEAPONS[pk.weapon].model) : null;
          if (model) {
            model.scale.setScalar(2.6);
            g.add(model);
          }
          // Rarity colour: ring for everything, a light beam for Huyền thoại / Truyền thuyết.
          const mat = this.ringMats[Math.min(pk.tier, this.ringMats.length - 1)]!;
          const ring = new THREE.Mesh(this.ringGeo, mat);
          ring.position.y = 0.03;
          ring.scale.setScalar(1 + pk.tier * 0.15);
          g.add(ring);
          if (pk.tier >= 2) {
            const beam = new THREE.Mesh(this.beamGeo, mat);
            beam.renderOrder = 2;
            g.add(beam);
          }
          g.position.set(pk.x, 0, pk.z);
          this.root.add(g);
          p = { root: g, model };
          this.pickups.set(pk.id, p);
        }
        if (p.model) {
          p.model.rotation.y = this.time * 2;
          p.model.position.y = 0.4 + Math.sin(this.time * 3 + pk.id) * 0.1;
        }
      });
      for (const [id, p] of this.pickups) {
        if (seenP.has(id)) continue;
        p.root.removeFromParent();
        this.pickups.delete(id);
      }
    }
    this.fx.update(dt);
    this.lights.follow(frame.focus);
  }

  actionForClick(): null {
    return null;
  }

  actionForKey(): null {
    return null;
  }

  applyQuality(p: QualityPreset): void {
    this.lights.applyQuality(p);
  }

  dispose(): void {
    this.disposed = true;
    this.fx.dispose();
    for (const id of [...this.monsters.keys()]) this.removeMonster(id);
    for (const p of this.pickups.values()) p.root.removeFromParent();
    this.pickups.clear();
    this.lights.dispose();
  }

  private addMonster(id: number, kind: MonsterKind, x: number, y: number, z: number): MonsterEntity {
    const model = new MonsterModel(kind, this.fallbackMat);
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    holder.add(model.root);
    const hpBg = new THREE.Sprite(this.hpBgMat);
    const hpFg = new THREE.Sprite(this.hpFgMat);
    hpFg.center.set(0, 0.5); // grows from the left
    hpBg.renderOrder = 9;
    hpFg.renderOrder = 10;
    holder.add(hpBg, hpFg);
    this.root.add(holder);
    const e: MonsterEntity = { holder, model, kind, hpBg, hpFg, lastHit: -1, dead: false, punch: 0, real: monstersLoaded() };
    this.monsters.set(id, e);
    return e;
  }

  private removeMonster(id: number): void {
    const e = this.monsters.get(id);
    e?.model.dispose();
    e?.holder.removeFromParent();
    this.monsters.delete(id);
  }
}

export function createView(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker): MinigameView {
  return new CastleView(root, scene, ctx, res);
}
