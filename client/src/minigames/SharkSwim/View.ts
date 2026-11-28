import * as THREE from 'three';
import { SEA, createSeaWorld, seaStep, type QualityPreset } from '@sp/shared';
import type { SceneContext } from '../../core/GameScene.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';
import type { MinigameView, ViewFrame } from '../framework/MinigameView.ts';
import { StageLights, placeBox, setSky } from '../framework/stage.ts';

const DEG = Math.PI / 180;

interface SharkMesh {
  root: THREE.Group;
  tail: THREE.Object3D;
}

/** Tropical sea: sand beach, palm island, a glassy water surface and low-poly sharks whose fins break the surface. */
class SharkView implements MinigameView {
  readonly step = seaStep(createSeaWorld());
  readonly clickTargets: THREE.Object3D[] = [];
  readonly cameraPreset = { yaw: 0, pitch: 32 * DEG, distance: 11 };
  private readonly lights: StageLights;
  private readonly water: THREE.Mesh;
  private readonly sharks: SharkMesh[] = [];
  private readonly root: THREE.Object3D;
  private readonly res: ResourceTracker;
  private readonly ctx: SceneContext;
  private time = 0;

  constructor(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker) {
    this.root = root;
    this.res = res;
    this.ctx = ctx;
    setSky(scene, 0x9fe3ff, 50, 150);
    this.lights = new StageLights(root, 22, 0xfff6e0, 0x5aa0c8);
    const m = ctx.materials;
    const unit = res.track(new THREE.BoxGeometry(1, 1, 1));
    const hw = SEA.halfWidth;
    const sand = m.lambert(0xf3d9a4);
    for (const [z0, z1] of [[SEA.beachZ, SEA.beachZ + 8], [SEA.islandZ - 12, SEA.islandZ]] as const) {
      const land = placeBox(new THREE.Mesh(unit, sand), -hw, hw, z0, z1, -3, 0);
      land.receiveShadow = true;
      root.add(land);
      this.clickTargets.push(land);
    }
    root.add(placeBox(new THREE.Mesh(unit, sand), -hw, hw, SEA.islandZ, SEA.islandZ + 1.2, -3, -0.3));
    root.add(placeBox(new THREE.Mesh(unit, sand), -hw, hw, SEA.islandZ + 1.2, SEA.islandZ + 2.4, -3, -0.6));
    const seabed = placeBox(new THREE.Mesh(unit, m.lambert(0x2a7a8c)), -hw - 30, hw + 30, SEA.islandZ - 40, SEA.beachZ + 40, -4, -3);
    root.add(seabed);
    // Palm trees on the island.
    const trunk = res.track(new THREE.CylinderGeometry(0.18, 0.26, 3.4, 6));
    const leaves = res.track(new THREE.ConeGeometry(1.6, 1, 7));
    for (const [x, z] of [[-9, -70], [-4, -74], [6, -71], [10, -75], [0, -77]] as const) {
      const t = new THREE.Mesh(trunk, m.lambert(0x8b5a2b));
      t.position.set(x, 1.7, z);
      t.castShadow = true;
      const l = new THREE.Mesh(leaves, m.lambert(0x2fbf71));
      l.position.set(x, 3.5, z);
      l.castShadow = true;
      root.add(t, l);
    }
    // Water surface (swimmers sit at SEA.swimY, head above it).
    const waterMat = res.track(new THREE.MeshStandardMaterial({ color: 0x1fa8d6, transparent: true, opacity: 0.72, roughness: 0.15, metalness: 0.1 }));
    this.water = new THREE.Mesh(res.track(new THREE.PlaneGeometry(hw * 2 + 60, SEA.beachZ - SEA.islandZ + 80, 1, 1).rotateX(-Math.PI / 2)), waterMat);
    this.water.position.set(0, -0.15, (SEA.beachZ + SEA.islandZ) / 2);
    this.water.renderOrder = 2;
    root.add(this.water);
    this.clickTargets.push(this.water);
    this.applyQuality(ctx.quality);
  }

  cameraFocus(): null {
    return null;
  }

  update(dt: number, frame: ViewFrame): void {
    this.time += dt;
    this.water.position.y = -0.15 + Math.sin(this.time * 1.4) * 0.04;
    const fins = frame.state.sea?.sharks;
    if (fins) {
      while (this.sharks.length < fins.length) this.sharks.push(this.makeShark());
      fins.forEach((f, i) => {
        const sh = this.sharks[i]!;
        const k = Math.min(1, dt * 10);
        sh.root.position.x += (f.x - sh.root.position.x) * k;
        sh.root.position.z += (f.z - sh.root.position.z) * k;
        sh.root.position.y = -0.55 + (f.lunge ? 0.2 : 0) + Math.sin(this.time * 2 + i) * 0.05;
        sh.root.rotation.y = f.yaw;
        sh.tail.rotation.y = Math.sin(this.time * (f.lunge ? 14 : 6) + i) * 0.5;
      });
    }
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
    this.lights.dispose();
  }

  /** Low-poly shark: grey body, white belly, dorsal fin above the water, wagging tail. */
  private makeShark(): SharkMesh {
    const m = this.ctx.materials;
    const root = new THREE.Group();
    const body = new THREE.Mesh(this.res.track(new THREE.SphereGeometry(0.55, 8, 6).scale(0.8, 0.6, 2.2)), m.lambert(0x6f7f8f));
    const belly = new THREE.Mesh(this.res.track(new THREE.SphereGeometry(0.5, 8, 6).scale(0.75, 0.4, 2)), m.lambert(0xe8edf2));
    belly.position.y = -0.12;
    const fin = new THREE.Mesh(this.res.track(new THREE.ConeGeometry(0.35, 0.9, 4).scale(0.35, 1, 1)), m.lambert(0x55626f));
    fin.position.set(0, 0.62, -0.1);
    fin.rotation.x = -0.35;
    const tailPivot = new THREE.Group();
    tailPivot.position.z = -1.2;
    const tail = new THREE.Mesh(this.res.track(new THREE.ConeGeometry(0.5, 0.9, 4).scale(0.25, 1, 1)), m.lambert(0x6f7f8f));
    tail.rotation.x = Math.PI / 2;
    tail.position.z = -0.35;
    tailPivot.add(tail);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(this.res.track(new THREE.SphereGeometry(0.06, 6, 4)), m.lambert(0x111111));
      eye.position.set(side * 0.33, 0.12, 0.95);
      root.add(eye);
    }
    root.add(body, belly, fin, tailPivot);
    root.traverse((o) => {
      o.castShadow = true;
    });
    this.root.add(root);
    return { root, tail: tailPivot };
  }
}

export function createView(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker): MinigameView {
  return new SharkView(root, scene, ctx, res);
}
