import * as THREE from 'three';
import {
  MAP, MOAT, MONSTERS, PIT, PLAYER_HP, castleStairs, sidePoint, RARITIES, WEAPONS, applyPitTiles, castleStep, createCastleWorld, isBoss, isWeaponId,
  type MonsterKind, type QualityPreset,
} from '@sp/shared';
import type { MatchState } from '@sp/shared/schema';
import { CastleHazardsView } from './hazardsView.ts';
import type { SceneContext } from '../../core/GameScene.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';
import type { MinigameView, ViewFrame } from '../framework/MinigameView.ts';
import { StageLights, placeBox, setSky } from '../framework/stage.ts';
import { createWeaponModel } from '../../player/characters.ts';
import { MonsterModel, loadMonsters, monstersLoaded, type MonsterAnim } from './monsters.ts';
import { buildCastle, loadCastleKit } from './castleKit.ts';
import { grassTexture, roadTexture } from './ground.ts';
import { Particles } from '../../fx/Particles.ts';
import { DamageNumbers } from '../../fx/DamageNumbers.ts';
import { shake } from '../../core/CameraManager.ts';

const DEG = Math.PI / 180;
/** Where damage numbers start (above the head). */
const MONSTER_TOP: Record<string, number> = { SLIME: 1.1, SKELETON: 1.9, BAT: 1.2, ARCHER: 1.9, SHIELD: 1.9, BOMBER: 1.4, DRAGON: 4.2, MINOTAUR: 4.8, SLIME_KING: 3.4 };
/** Elite affix colours. */
const ELITE_COLOR: Record<string, number> = { FAST: 0xffd23f, ARMOR: 0x9fb3d6, EXPLODE: 0xff5a2f, GIANT: 0xc77dff };

interface MonsterEntity {
  /** Positioned holder (HP bar lives here, unrotated); the model inside it turns with the monster. */
  holder: THREE.Group;
  model: MonsterModel;
  kind: MonsterKind;
  hpBg: THREE.Sprite;
  hpFg: THREE.Sprite;
  lastHit: number;
  dead: boolean;
  /** Health last frame (damage numbers) and the elite / enraged look applied. */
  prevHp: number;
  scale: number;
  look: string;
  punch: number;
  real: boolean;
}

interface PickupEntity {
  root: THREE.Group;
  model: THREE.Object3D | null;
}

/** Castle courtyard: wall + gate (reddens as it breaks), low walls, monsters with HP bars, weapon pickups. */
interface PlayerBar {
  bg: THREE.Sprite;
  fg: THREE.Sprite;
  ring: THREE.Mesh;
  x: number;
  y: number;
  z: number;
}

class CastleView implements MinigameView {
  /** Client copy of the collision world: pit tiles follow the synced state. */
  private readonly cw = createCastleWorld();
  readonly step = castleStep(this.cw);
  /** Walls, towers, keep, stairs: the aim ray stops on them (hook anchors). */
  readonly aimBoxes = this.cw.world.boxes.filter((b) => b.top > 0.5 && b.bottom === undefined);
  private tilesSig = '';
  private readonly hazards: CastleHazardsView;
  private readonly bars = new Map<string, PlayerBar>();
  private readonly barBgMat: THREE.SpriteMaterial;
  private readonly barFgMat: THREE.SpriteMaterial;
  private readonly barLowMat: THREE.SpriteMaterial;
  private readonly reviveMat: THREE.Material;
  private readonly reviveGeo: THREE.BufferGeometry;
  private readonly materials: SceneContext['materials'];
  readonly clickTargets: THREE.Object3D[] = [];
  readonly cameraPreset = { yaw: 0, pitch: 34 * DEG, distance: 12 };
  private readonly root: THREE.Object3D;
  private readonly lights: StageLights;
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
  private readonly numbers = new DamageNumbers();
  private disposed = false;
  private kitGates: Array<THREE.Object3D | null> = [];
  private time = 0;

  constructor(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker) {
    this.root = root;
    setSky(scene, 0x8ec5ff, 40, 120);
    this.lights = new StageLights(root, 22);
    const m = ctx.materials;
    const unit = res.track(new THREE.BoxGeometry(1, 1, 1));
    // Textured grass on every floor box of the collision world (the four pit bands are holes),
    // plus a wide skirt beyond the battlefield.
    const grass = res.track(grassTexture());
    grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
    const groundMat = res.track(new THREE.MeshLambertMaterial({ map: grass }));
    const tileSet = new Set(this.cw.tiles);
    const groundPiece = (x0: number, x1: number, z0: number, z1: number) => {
      const geo = res.track(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2));
      // World-space UVs so neighbouring pieces line up (one texture tile per 8 m).
      const uv = geo.getAttribute('uv');
      const pos = geo.getAttribute('position');
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (pos.getX(k) + (x0 + x1) / 2) / 8, (pos.getZ(k) + (z0 + z1) / 2) / 8);
      const g = new THREE.Mesh(geo, groundMat);
      g.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      g.receiveShadow = true;
      root.add(g);
      this.clickTargets.push(g);
    };
    for (const b of this.cw.world.boxes) {
      if (b.top === 0 && b.bottom === -1 && !tileSet.has(b)) groundPiece(b.minX, b.maxX, b.minZ, b.maxZ);
    }
    const H = MAP.half;
    const F = H + 40;
    groundPiece(-F, F, -F, -H);
    groundPiece(-F, F, H, F);
    groundPiece(-F, -H, -H, H);
    groundPiece(H, F, -H, H);
    // Dirt roads from each lair to its gate (cut by the moat and the pit band).
    const pitOut = PIT.rIn + PIT.rows * PIT.tile;
    for (let side = 0; side < 4; side++) {
      for (const [r0, r1] of [[MAP.wallOut, MOAT.rIn], [MOAT.rOut, PIT.rIn], [pitOut, MAP.lairR + 1]] as const) {
        const tex = res.track(roadTexture());
        tex.repeat.set(1, (r1 - r0) / 8);
        const a = sidePoint(side, (r0 + r1) / 2, 0);
        const mesh = new THREE.Mesh(
          res.track(new THREE.PlaneGeometry(7, r1 - r0).rotateX(-Math.PI / 2)),
          res.track(new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false })),
        );
        mesh.position.set(a.x, 0.02, a.z);
        mesh.rotation.y = side % 2 === 0 ? 0 : Math.PI / 2;
        mesh.receiveShadow = true;
        root.add(mesh);
      }
    }
    this.hazards = new CastleHazardsView(root, m, res);
    this.materials = m;
    // Simple stone blocks (the collision boxes) until the Castle Kit models are loaded.
    const placeholders = new THREE.Group();
    root.add(placeholders);
    const stone = m.lambert(0x9a96a8);
    const stairs = new Set(castleStairs().map((b) => `${b.minX},${b.minZ},${b.top}`));
    for (const b of this.cw.world.boxes) {
      if (b.bottom !== undefined || b.top <= 0.5 || stairs.has(`${b.minX},${b.minZ},${b.top}`)) continue;
      const block = placeBox(new THREE.Mesh(unit, stone), b.minX, b.maxX, b.minZ, b.maxZ, 0, b.top);
      block.castShadow = true;
      placeholders.add(block);
    }
    this.fallbackMat = m.lambert(0x6ad36a);
    this.hpBgMat = res.track(new THREE.SpriteMaterial({ color: 0x222233, depthTest: false }));
    this.hpFgMat = res.track(new THREE.SpriteMaterial({ color: 0xff4f6d, depthTest: false }));
    this.ringGeo = res.track(new THREE.RingGeometry(0.5, 0.65, 24).rotateX(-Math.PI / 2));
    this.ringMats = RARITIES.map((r) => m.basic(new THREE.Color(r.color).getHex(), 0.85));
    this.beamGeo = res.track(new THREE.CylinderGeometry(0.25, 0.4, 6, 10, 1, true).translate(0, 3, 0));
    this.barBgMat = res.track(new THREE.SpriteMaterial({ color: 0x1a1a24, depthTest: false }));
    this.barFgMat = res.track(new THREE.SpriteMaterial({ color: 0x5be07a, depthTest: false }));
    this.barLowMat = res.track(new THREE.SpriteMaterial({ color: 0xff4f6d, depthTest: false }));
    this.reviveMat = m.basic(0x7bffb0, 0.85);
    this.reviveGeo = res.track(new THREE.RingGeometry(0.75, 1, 32).rotateX(-Math.PI / 2));
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
      this.kitGates = kit.gates;
    });
    root.add(this.fx.root, this.numbers.root);
    this.applyQuality(ctx.quality);
  }

  cameraFocus(): null {
    return null;
  }

  update(dt: number, frame: ViewFrame): void {
    this.time += dt;
    const castle = frame.state.castle;
    if (castle) {
      // Pit tiles: keep the local collision world in step with the server.
      const sig = castle.tiles.join('');
      if (sig !== this.tilesSig) {
        this.tilesSig = sig;
        applyPitTiles(this.cw, castle.tiles);
      }
      this.hazards.update(dt, castle);
      this.updateBars(dt, frame.state);
      // Gates shake when badly damaged and vanish when broken.
      this.kitGates.forEach((g, i) => {
        if (!g) return;
        const ratio = castle.gateMax > 0 ? (castle.gates[i] ?? 0) / castle.gateMax : 1;
        g.visible = ratio > 0;
        g.position.y = 1.7 + (ratio < 0.4 ? Math.sin(this.time * 30 + i) * 0.05 : 0);
      });
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
        const anim: MonsterAnim =
          mon.state === 'DIE' ? 'die'
            : mon.state === 'BREATH' ? 'breath'
              : mon.state === 'ATTACK' ? 'attack'
                : mon.state === 'CHARGE' ? 'charge'
                  : mon.state === 'LAND' || mon.state === 'STUN' ? 'idle' : 'move';
        e.model.play(anim);
        // Frozen (Băng Giá): no animation at all.
        if (mon.fx !== 'F') e.model.update(dt);
        const boss = isBoss(e.kind);
        const mid = { x: g.position.x, y: g.position.y + (boss ? 2 : 0.6), z: g.position.z };
        if (mon.hitAt !== e.lastHit) {
          if (e.lastHit !== -1) {
            this.fx.sparks(mid, mon.crit ? 0xffd23f : 0xff6a4f, mon.crit ? 9 : 5, 3);
            if (mon.crit) shake(0.07);
          }
          e.lastHit = mon.hitAt;
          e.punch = mon.crit ? 0.28 : 0.18;
        }
        if (mon.hp < e.prevHp) {
          const h = (MONSTER_TOP[e.kind] ?? 1.5) * e.scale;
          this.numbers.show(g.position.x, g.position.y + h, g.position.z, e.prevHp - mon.hp, mon.crit);
        }
        e.prevHp = mon.hp;
        // Elites: bigger, tinted and glowing by affix; enraged bosses glow red.
        const look = `${mon.elite}|${mon.enraged}|${mon.fx}`;
        if (look !== e.look) {
          e.look = look;
          e.scale = mon.elite === 'GIANT' ? 1.8 : mon.elite ? 1.35 : 1;
          const color = ELITE_COLOR[mon.elite] ?? 0xff3b3b;
          // Tint: ice when frozen / slowed, else the elite colour (or none).
          if (mon.fx === 'F') e.model.tint(0xbfefff, 0.7);
          else if (mon.fx === 'S') e.model.tint(0x8fe3ff, 0.3);
          else e.model.tint(color, mon.elite ? 0.3 : 0);
          e.model.glow(mon.enraged ? 0xff2a1a : mon.fx === 'B' ? 0xff6a1a : color, mon.enraged ? 0.6 : mon.fx === 'B' ? 0.45 : mon.elite ? 0.35 : 0);
        }
        // Burning: flames lick up from the monster.
        if (mon.fx === 'B' && Math.random() < dt * 14) {
          this.fx.sprite({ tex: 'flame_01', color: 0xff7a2f, pos: { x: g.position.x + (Math.random() - 0.5) * 0.6, y: g.position.y + 0.3, z: g.position.z + (Math.random() - 0.5) * 0.6 }, vel: { x: 0, y: 1.6, z: 0 }, life: 0.45, size: 0.6, size1: 0.2 });
        }
        if (mon.state === 'DIE' && !e.dead) {
          e.dead = true;
          this.fx.smoke(mid, boss ? 4 : 1.4, boss ? 10 : 4);
        }
        e.punch = Math.max(0, e.punch - dt);
        e.model.root.scale.setScalar(e.scale * (1 + e.punch));
        const top = (MONSTER_TOP[e.kind] ?? 1.5) * e.scale + 0.1;
        const width = boss ? 3 : 1;
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
            // Same on-ground size whatever the model's units (blasters are long, the hammer tiny).
            const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
            model.scale.setScalar(1.1 / Math.max(0.05, size.x, size.y, size.z));
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
    this.numbers.update(dt);
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
    this.numbers.dispose();
    this.hazards.dispose();
    for (const b of this.bars.values()) {
      b.bg.removeFromParent();
      b.fg.removeFromParent();
      b.ring.removeFromParent();
    }
    this.bars.clear();
    for (const id of [...this.monsters.keys()]) this.removeMonster(id);
    for (const p of this.pickups.values()) p.root.removeFromParent();
    this.pickups.clear();
    this.lights.dispose();
  }

  private addMonster(id: number, kind: MonsterKind, x: number, y: number, z: number): MonsterEntity {
    const model = new MonsterModel(kind, this.fallbackMat, this.materials);
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
    const e: MonsterEntity = { holder, model, kind, hpBg, hpFg, lastHit: -1, dead: false, punch: 0, real: monstersLoaded(), prevHp: Infinity, scale: 1, look: '' };
    this.monsters.set(id, e);
    return e;
  }

  /** Health bars over players (red when low) and a filling ring under downed ones. */
  private updateBars(dt: number, state: MatchState): void {
    const seen = new Set<string>();
    const k = Math.min(1, dt * 10);
    state.players.forEach((p) => {
      if (!p.alive || p.roundState !== 'ACTIVE') return;
      seen.add(p.id);
      let b = this.bars.get(p.id);
      if (!b) {
        const bg = new THREE.Sprite(this.barBgMat);
        const fg = new THREE.Sprite(this.barFgMat);
        fg.center.set(0, 0.5);
        bg.renderOrder = 9;
        fg.renderOrder = 10;
        const ring = new THREE.Mesh(this.reviveGeo, this.reviveMat);
        this.root.add(bg, fg, ring);
        b = { bg, fg, ring, x: p.x, y: p.y, z: p.z };
        this.bars.set(p.id, b);
      }
      b.x += (p.x - b.x) * k;
      b.y += (p.y - b.y) * k;
      b.z += (p.z - b.z) * k;
      const ratio = Math.max(0, Math.min(1, p.hp / PLAYER_HP.max));
      const y = b.y + (p.downed ? 0.9 : 2.25);
      b.bg.position.set(b.x, y, b.z);
      b.bg.scale.set(0.9, 0.09, 1);
      b.fg.material = ratio < 0.35 ? this.barLowMat : this.barFgMat;
      b.fg.position.set(b.x - 0.45, y, b.z);
      b.fg.scale.set(0.9 * ratio, 0.07, 1);
      b.bg.visible = b.fg.visible = p.downed || ratio < 1;
      b.ring.visible = p.downed;
      if (p.downed) {
        b.ring.position.set(b.x, b.y + 0.06, b.z);
        b.ring.scale.setScalar(PLAYER_HP.reviveRadius * (0.35 + 0.65 * p.revive) + Math.sin(this.time * 6) * 0.05);
      }
    });
    for (const [id, b] of this.bars) {
      if (seen.has(id)) continue;
      b.bg.removeFromParent();
      b.fg.removeFromParent();
      b.ring.removeFromParent();
      this.bars.delete(id);
    }
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
