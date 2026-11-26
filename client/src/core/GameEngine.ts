import * as THREE from 'three';
import { QUALITY_PRESETS, type FpsCap, type QualityLevel } from '@sp/shared';
import { RenderManager, type RenderStats } from './RenderManager.ts';
import { CameraManager } from './CameraManager.ts';
import { InputManager } from './InputManager.ts';
import { MaterialLibrary } from './MaterialLibrary.ts';
import { SceneManager, type SceneLoader } from './SceneManager.ts';
import { keyboardToWorldDir } from './inputMath.ts';
import type { FrameInput } from './GameScene.ts';

export interface EngineOptions {
  quality: QualityLevel;
  fpsCap: FpsCap;
  /** Called ~4 times per second, never every frame. */
  onStats(stats: Readonly<RenderStats>, entities: number): void;
  onToggleDebug(): void;
}

const STATS_INTERVAL_S = 0.25;
const UP_NORMAL_MIN = 0.5;

export const playgroundLoader: SceneLoader = async (ctx) => {
  const mod = await import('../scenes/playground/PlaygroundScene.ts');
  return mod.createPlaygroundScene(ctx);
};

/** Framework-agnostic game runtime. React mounts it into a div and only talks to it via methods/callbacks. */
export class GameEngine {
  private readonly render: RenderManager;
  private readonly camera: CameraManager;
  private readonly input: InputManager;
  private readonly materials = new MaterialLibrary();
  private readonly scenes = new SceneManager();
  private readonly opts: EngineOptions;
  private readonly frameInput: FrameInput = { keyDirX: 0, keyDirZ: 0 };
  private readonly axes = { fwd: 0, right: 0 };
  private readonly dir = { x: 0, z: 0 };
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hitPoint = new THREE.Vector3();
  private readonly hits: THREE.Intersection[] = [];
  private statsTimer = 0;
  private disposed = false;

  constructor(host: HTMLElement, opts: EngineOptions) {
    this.opts = opts;
    this.render = new RenderManager(host, opts.quality, opts.fpsCap);
    this.camera = new CameraManager(this.render.aspect);
    this.render.onQualityChange((p) => this.scenes.active?.applyQuality(p));
    this.input = new InputManager(host, {
      onGroundPoint: (x, y) => this.handleGroundPoint(x, y),
      onStop: () => this.scenes.active?.onStop(),
      onJump: () => this.scenes.active?.onJump(),
      onCameraRotate: (dx, dy) => this.camera.rotateByMouse(dx, dy),
      onZoom: (steps) => this.camera.zoom(steps),
      onToggleDebug: () => this.opts.onToggleDebug(),
    });
  }

  async loadScene(loader: SceneLoader): Promise<boolean> {
    const scene = await this.scenes.switchTo(loader, {
      materials: this.materials,
      quality: this.render.preset,
    });
    if (!scene || this.disposed) return false;
    this.camera.snapTo(scene.getCameraTarget());
    this.render.start((dt) => this.frame(dt));
    return true;
  }

  setQuality(level: QualityLevel): void {
    this.render.setQuality(level);
  }

  setFpsCap(cap: FpsCap): void {
    this.render.setFpsCap(cap);
  }

  static defaultFpsCap(level: QualityLevel): FpsCap {
    return QUALITY_PRESETS[level].fpsCap;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.input.dispose();
    this.scenes.dispose();
    this.materials.disposeAll();
    this.render.dispose();
  }

  private frame(dt: number): void {
    const scene = this.scenes.active;
    if (!scene) return;

    this.input.getKeyAxes(this.axes);
    keyboardToWorldDir(this.axes.fwd, this.axes.right, this.camera.viewYaw, this.dir);
    this.frameInput.keyDirX = this.dir.x;
    this.frameInput.keyDirZ = this.dir.z;
    this.camera.rotateByKeys(this.input.getKeyRotate(), dt);

    scene.update(dt, this.frameInput);

    this.camera.setAspect(this.render.aspect);
    this.camera.update(dt, scene.getCameraTarget(), scene.getAutoAlignYaw());
    this.render.render(scene.root, this.camera.camera);

    this.statsTimer += dt;
    if (this.statsTimer >= STATS_INTERVAL_S) {
      this.statsTimer = 0;
      this.opts.onStats(this.render.getStats(), scene.entityCount());
    }
  }

  private handleGroundPoint(ndcX: number, ndcY: number): void {
    const scene = this.scenes.active;
    if (!scene) return;
    this.ndc.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.ndc, this.camera.camera);
    this.hits.length = 0;
    this.raycaster.intersectObjects(scene.getClickTargets() as THREE.Object3D[], false, this.hits);
    const top = this.hits[0];
    // Clicked a walkable top surface: use it. Clicked a wall side: fall back to the ground plane.
    if (top && top.face && top.face.normal.y > UP_NORMAL_MIN) {
      scene.onGroundClick(top.point.x, top.point.y, top.point.z);
      return;
    }
    if (this.raycaster.ray.intersectPlane(this.groundPlane, this.hitPoint)) {
      scene.onGroundClick(this.hitPoint.x, 0, this.hitPoint.z);
    }
  }
}
