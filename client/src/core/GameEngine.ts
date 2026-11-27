import * as THREE from 'three';
import { QUALITY_PRESETS, type FpsCap, type QualityLevel } from '@sp/shared';
import { RenderManager, type RenderStats } from './RenderManager.ts';
import { CameraManager } from './CameraManager.ts';
import { CROSSHAIR_NDC_Y, InputManager } from './InputManager.ts';
import { MaterialLibrary } from './MaterialLibrary.ts';
import { SceneManager, type SceneLoader } from './SceneManager.ts';
import { keyboardToWorldDir } from './inputMath.ts';
import type { ClickHit, FrameInput } from './GameScene.ts';
import type { MatchNetAdapter } from '../network/types.ts';

export interface EngineOptions {
  quality: QualityLevel;
  fpsCap: FpsCap;
  /** Shooter-style camera: click captures the mouse, moving it turns the camera. */
  mouseLook: boolean;
  /** Called ~4 times per second, never every frame. */
  onStats(stats: Readonly<RenderStats>, entities: number): void;
  onToggleDebug(): void;
}

const STATS_INTERVAL_S = 0.25;
/** Touch look is a bit faster than mouse drag (thumbs travel less). */
const TOUCH_LOOK_GAIN = 1.4;
/** Window event the HUD's element button fires in touch mode: cast at the crosshair. */
export const CAST_AT_CROSSHAIR_EVENT = 'sp:cast-crosshair';
const UP_NORMAL_MIN = 0.5;

/** Character models (Kenney glTF); failures fall back to the procedural characters. */
async function loadCharacters(names?: string[]): Promise<void> {
  const { preloadCharacters } = await import('../player/characters.ts');
  await preloadCharacters(names).catch(() => false);
}

export const playgroundLoader: SceneLoader = async (ctx) => {
  const [mod] = await Promise.all([import('../scenes/playground/PlaygroundScene.ts'), loadCharacters()]);
  return mod.createPlaygroundScene(ctx);
};

export function matchSceneLoader(net: MatchNetAdapter): SceneLoader {
  return async (ctx) => {
    // Everyone's picked character (bots included: they are in the state once the match starts).
    const { characterFor, SLOT_CHARACTERS } = await import('@sp/shared');
    const names = new Set<string>([...SLOT_CHARACTERS, 'character-zombie']);
    net.forEachPlayer((p) => names.add(characterFor(p.character, p.slot)));
    const [mod] = await Promise.all([import('../scenes/match/MatchScene.ts'), loadCharacters([...names])]);
    return mod.createMatchScene(ctx, net);
  };
}

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
  /** Touch joystick (−1..1, y = forward); used when no movement key is held. */
  private readonly stick = { x: 0, y: 0 };
  private readonly onCastEvent = (): void => this.castAtCrosshair();

  private readonly host: HTMLElement;

  constructor(host: HTMLElement, opts: EngineOptions) {
    this.opts = opts;
    this.host = host;
    window.addEventListener(CAST_AT_CROSSHAIR_EVENT, this.onCastEvent);
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
      onKeyPress: (code) => {
        if (code === 'KeyF') this.castAtPointer();
        else this.scenes.active?.onKeyPress?.(code);
      },
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

  setMouseLook(enabled: boolean): void {
    this.opts.mouseLook = enabled;
  }

  // --- Touch controls (twin-stick, like mobile shooters) -------------------------------------

  /** Left stick: x = right, y = forward, each −1..1 (0, 0 = released). */
  setMoveStick(x: number, y: number): void {
    this.stick.x = x;
    this.stick.y = y;
  }

  /** Right side drag: turn the camera (pixels). */
  lookDrag(dx: number, dy: number): void {
    this.camera.rotateByMouse(dx * TOUCH_LOOK_GAIN, dy * TOUCH_LOOK_GAIN);
  }

  jump(): void {
    this.scenes.active?.onJump();
  }

  /** Tap on the 3D view at client coordinates: same as a mouse click there. */
  tapAt(clientX: number, clientY: number): void {
    const rect = this.host.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.handleGroundPoint(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  }

  /** Use the element at the crosshair (touch cast button). */
  castAtCrosshair(): void {
    const scene = this.scenes.active;
    if (!scene?.onCastAt) return;
    this.raycastGround(0, CROSSHAIR_NDC_Y, (hit) => scene.onCastAt?.(hit), () => scene.onCastAt?.(null));
  }

  static defaultFpsCap(level: QualityLevel): FpsCap {
    return QUALITY_PRESETS[level].fpsCap;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener(CAST_AT_CROSSHAIR_EVENT, this.onCastEvent);
    this.input.dispose();
    this.scenes.dispose();
    this.materials.disposeAll();
    this.render.dispose();
  }

  private frame(dt: number): void {
    const scene = this.scenes.active;
    if (!scene) return;

    this.input.getKeyAxes(this.axes);
    let magnitude = 1;
    if (this.axes.fwd === 0 && this.axes.right === 0) {
      // Touch joystick: analog (push a little = walk slowly).
      this.axes.fwd = this.stick.y;
      this.axes.right = this.stick.x;
      magnitude = Math.min(1, Math.hypot(this.stick.x, this.stick.y));
    }
    keyboardToWorldDir(this.axes.fwd, this.axes.right, this.camera.viewYaw, this.dir);
    this.frameInput.keyDirX = this.dir.x * magnitude;
    this.frameInput.keyDirZ = this.dir.z * magnitude;
    this.camera.rotateByKeys(this.input.getKeyRotate(), dt);

    this.input.setPointerLockAllowed(this.opts.mouseLook && scene.wantsPointerLock?.() === true);
    scene.update(dt, this.frameInput);
    const preset = scene.takeCameraPreset?.();
    if (preset) this.camera.applyPreset(preset);

    this.camera.setAspect(this.render.aspect);
    this.camera.update(dt, scene.getCameraTarget(), scene.getAutoAlignYaw());
    this.render.render(scene.root, this.camera.camera);

    this.statsTimer += dt;
    if (this.statsTimer >= STATS_INTERVAL_S) {
      this.statsTimer = 0;
      this.opts.onStats(this.render.getStats(), scene.entityCount());
    }
  }

  private castAtPointer(): void {
    const scene = this.scenes.active;
    if (!scene?.onCastAt) return;
    const p = this.input.pointer;
    if (!p.valid) return scene.onCastAt(null);
    this.raycastGround(p.x, p.y, (hit) => scene.onCastAt?.(hit), () => scene.onCastAt?.(null));
  }

  private handleGroundPoint(ndcX: number, ndcY: number): void {
    const scene = this.scenes.active;
    if (!scene) return;
    this.raycastGround(ndcX, ndcY, (hit) => scene.onGroundClick(hit));
  }

  private raycastGround(ndcX: number, ndcY: number, onHit: (hit: ClickHit) => void, onMiss?: () => void): void {
    const scene = this.scenes.active;
    if (!scene) return;
    this.ndc.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.ndc, this.camera.camera);
    this.hits.length = 0;
    this.raycaster.intersectObjects(scene.getClickTargets() as THREE.Object3D[], false, this.hits);
    const top = this.hits[0];
    // Clicked a walkable top surface: use it. Clicked a wall side: fall back to the ground plane.
    // Instanced/interactive targets (e.g. glass tiles) count on any face; walkable surfaces only on top faces.
    if (top && (top.instanceId !== undefined || (top.face && top.face.normal.y > UP_NORMAL_MIN))) {
      onHit({ x: top.point.x, y: top.point.y, z: top.point.z, object: top.object, instanceId: top.instanceId });
      return;
    }
    if (this.raycaster.ray.intersectPlane(this.groundPlane, this.hitPoint)) {
      onHit({ x: this.hitPoint.x, y: 0, z: this.hitPoint.z, object: null, instanceId: undefined });
    } else {
      onMiss?.();
    }
  }
}
