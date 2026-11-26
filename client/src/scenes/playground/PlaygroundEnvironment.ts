import * as THREE from 'three';
import { ARENA_HALF, PLAYGROUND_BOXES, scatterDecor, type DecorPlacement, type QualityPreset } from '@sp/shared';
import type { SceneContext } from '../../core/GameScene.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';

const SKY = 0x9fd8ff;
const FLOOR = 0x8fcf8a;
const SHADOW_RANGE = 18;

/**
 * Static visuals of the playground arena (floor, obstacles, fence, scenery, lights).
 * Shared by the offline playground and the online arena; gameplay lives in the scenes.
 */
export class PlaygroundEnvironment {
  readonly clickTargets: THREE.Object3D[] = [];
  private readonly sun: THREE.DirectionalLight;
  private readonly root: THREE.Scene;
  private readonly resources: ResourceTracker;

  constructor(root: THREE.Scene, ctx: SceneContext, resources: ResourceTracker) {
    this.root = root;
    this.resources = resources;
    root.background = new THREE.Color(SKY);
    root.fog = new THREE.Fog(SKY, 45, 110);

    root.add(new THREE.HemisphereLight(0xdff3ff, 0x6b5a7a, 1.8));
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    const cam = this.sun.shadow.camera;
    cam.left = -SHADOW_RANGE;
    cam.right = SHADOW_RANGE;
    cam.top = SHADOW_RANGE;
    cam.bottom = -SHADOW_RANGE;
    cam.near = 1;
    cam.far = 80;
    this.sun.shadow.bias = -0.0005;
    root.add(this.sun, this.sun.target);

    this.buildFloor(ctx);
    this.buildObstacles(ctx);
    this.buildFence(ctx);
    this.buildScenery(ctx);
    this.applyQuality(ctx.quality);
  }

  /** Keep the shadow frustum centred on what the camera looks at. */
  followFocus(focus: Readonly<THREE.Vector3>): void {
    this.sun.position.set(focus.x + 12, focus.y + 22, focus.z + 8);
    this.sun.target.position.copy(focus);
  }

  applyQuality(p: QualityPreset): void {
    this.sun.castShadow = p.shadows;
    if (p.shadows && this.sun.shadow.mapSize.x !== p.shadowMapSize) {
      this.sun.shadow.mapSize.set(p.shadowMapSize, p.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  get obstacleCount(): number {
    return PLAYGROUND_BOXES.length;
  }

  dispose(): void {
    this.sun.shadow.map?.dispose();
    this.sun.dispose();
  }

  private buildFloor(ctx: SceneContext): void {
    const size = ARENA_HALF * 2 + 70;
    const floorGeo = this.resources.track(new THREE.PlaneGeometry(size, size));
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, ctx.materials.lambert(FLOOR));
    floor.receiveShadow = true;
    this.root.add(floor);
    this.clickTargets.push(floor);

    const stripeGeo = this.resources.track(new THREE.PlaneGeometry(1, 1));
    stripeGeo.rotateX(-Math.PI / 2);
    const stripes = this.resources.track(new THREE.InstancedMesh(stripeGeo, ctx.materials.lambert(0xf6f1e3), 6));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(ARENA_HALF * 2 - 4, 1, 0.25);
    const pos = new THREE.Vector3();
    for (let i = 0; i < 6; i++) {
      pos.set(0, 0.01, -ARENA_HALF + 6 + i * ((ARENA_HALF * 2 - 12) / 5));
      m.compose(pos, q, s);
      stripes.setMatrixAt(i, m);
    }
    stripes.receiveShadow = true;
    this.root.add(stripes);
  }

  private buildObstacles(ctx: SceneContext): void {
    const unitBox = this.resources.track(new THREE.BoxGeometry(1, 1, 1));
    for (const b of PLAYGROUND_BOXES) {
      const mesh = new THREE.Mesh(unitBox, ctx.materials.lambert(b.color));
      mesh.scale.set(b.maxX - b.minX, b.top, b.maxZ - b.minZ);
      mesh.position.set((b.minX + b.maxX) / 2, b.top / 2, (b.minZ + b.maxZ) / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      this.clickTargets.push(mesh);
    }
  }

  private buildFence(ctx: SceneContext): void {
    const spacing = 2.5;
    const perSide = Math.floor((ARENA_HALF * 2) / spacing);
    const postGeo = this.resources.track(new THREE.BoxGeometry(0.25, 1.2, 0.25));
    postGeo.translate(0, 0.6, 0);
    const posts = this.resources.track(new THREE.InstancedMesh(postGeo, ctx.materials.lambert(0xf4f4f4), perSide * 4));
    const m = new THREE.Matrix4();
    let i = 0;
    for (let side = 0; side < 4; side++) {
      for (let k = 0; k < perSide; k++) {
        const t = -ARENA_HALF + k * spacing;
        const [x, z] =
          side === 0 ? [t, -ARENA_HALF] : side === 1 ? [ARENA_HALF, t] : side === 2 ? [-t, ARENA_HALF] : [-ARENA_HALF, -t];
        m.makeTranslation(x, 0, z);
        posts.setMatrixAt(i++, m);
      }
    }
    this.root.add(posts);

    const railGeo = this.resources.track(new THREE.BoxGeometry(1, 0.12, 0.12));
    const rails = this.resources.track(new THREE.InstancedMesh(railGeo, ctx.materials.lambert(0xff5d8f), 4));
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3(ARENA_HALF * 2, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    for (let side = 0; side < 4; side++) {
      const horizontal = side % 2 === 0;
      pos.set(horizontal ? 0 : side === 1 ? ARENA_HALF : -ARENA_HALF, 1, horizontal ? (side === 0 ? -ARENA_HALF : ARENA_HALF) : 0);
      q.setFromAxisAngle(up, horizontal ? 0 : Math.PI / 2);
      m.compose(pos, q, scale);
      rails.setMatrixAt(side, m);
    }
    this.root.add(rails);
  }

  private buildScenery(ctx: SceneContext): void {
    const trunkGeo = this.resources.track(new THREE.CylinderGeometry(0.18, 0.25, 1.2, 5));
    trunkGeo.translate(0, 0.6, 0);
    const crownGeo = this.resources.track(new THREE.ConeGeometry(1.1, 2.4, 6));
    crownGeo.translate(0, 2.3, 0);
    const rockGeo = this.resources.track(new THREE.DodecahedronGeometry(0.7, 0));

    const trees = scatterDecor(7, 70, ARENA_HALF + 4, ARENA_HALF + 30);
    const rocks = scatterDecor(11, 40, ARENA_HALF + 2, ARENA_HALF + 28);
    this.root.add(
      this.instanced(trunkGeo, ctx.materials.lambert(0x8a5a3c), trees, false),
      this.instanced(crownGeo, ctx.materials.lambert(0x3e9e5f), trees, true),
      this.instanced(rockGeo, ctx.materials.lambert(0xa9a3b8), rocks, true),
    );
  }

  private instanced(geo: THREE.BufferGeometry, mat: THREE.Material, items: DecorPlacement[], cast: boolean): THREE.InstancedMesh {
    const mesh = this.resources.track(new THREE.InstancedMesh(geo, mat, items.length));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    items.forEach((d, i) => {
      p.set(d.x, 0, d.z);
      q.setFromAxisAngle(up, d.rotY);
      s.setScalar(d.scale);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = cast;
    mesh.computeBoundingSphere(); // enables frustum culling for the whole batch
    return mesh;
  }
}
