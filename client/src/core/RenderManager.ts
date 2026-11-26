import * as THREE from 'three';
import { QUALITY_PRESETS, type FpsCap, type QualityLevel, type QualityPreset } from '@sp/shared';
import { FrameLimiter } from './FrameLimiter.ts';

export interface RenderStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  heapMB: number | null;
}

type PerformanceWithMemory = Performance & { memory?: { usedJSHeapSize: number } };

/**
 * Owns the WebGLRenderer, quality preset, FPS cap and render statistics.
 * Changing quality recreates the renderer (antialias can only be set at context creation);
 * three.js re-uploads GPU resources to the new context automatically.
 */
export class RenderManager {
  renderer: THREE.WebGLRenderer;
  private readonly host: HTMLElement;
  private level: QualityLevel;
  private readonly limiter: FrameLimiter;
  private readonly resizeObserver: ResizeObserver;
  private onFrame: ((dt: number) => void) | null = null;
  private lastFrameMs = -1;
  private fpsFrames = 0;
  private fpsWindowStart = 0;
  private readonly stats: RenderStats = {
    fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0, heapMB: null,
  };
  private readonly qualityListeners = new Set<(p: QualityPreset) => void>();

  constructor(host: HTMLElement, level: QualityLevel, fpsCap: FpsCap) {
    this.host = host;
    this.level = level;
    this.limiter = new FrameLimiter(fpsCap);
    this.renderer = this.createRenderer();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
  }

  get preset(): QualityPreset {
    return QUALITY_PRESETS[this.level];
  }

  get aspect(): number {
    return Math.max(1, this.host.clientWidth) / Math.max(1, this.host.clientHeight);
  }

  onQualityChange(listener: (p: QualityPreset) => void): () => void {
    this.qualityListeners.add(listener);
    return () => this.qualityListeners.delete(listener);
  }

  setQuality(level: QualityLevel): void {
    if (level === this.level) return;
    this.level = level;
    const wasRunning = this.onFrame;
    this.renderer.setAnimationLoop(null);
    this.renderer.domElement.remove();
    this.renderer.dispose();
    this.renderer = this.createRenderer();
    if (wasRunning) this.start(wasRunning);
    for (const l of this.qualityListeners) l(this.preset);
  }

  setFpsCap(cap: FpsCap): void {
    this.limiter.setCap(cap);
  }

  start(onFrame: (dt: number) => void): void {
    this.onFrame = onFrame;
    this.lastFrameMs = -1;
    this.renderer.setAnimationLoop((time) => this.tick(time));
  }

  stop(): void {
    this.onFrame = null;
    this.renderer.setAnimationLoop(null);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
    const info = this.renderer.info;
    this.stats.drawCalls = info.render.calls;
    this.stats.triangles = info.render.triangles;
    this.stats.geometries = info.memory.geometries;
    this.stats.textures = info.memory.textures;
  }

  getStats(): Readonly<RenderStats> {
    const mem = (performance as PerformanceWithMemory).memory;
    this.stats.heapMB = mem ? mem.usedJSHeapSize / 1048576 : null;
    return this.stats;
  }

  dispose(): void {
    this.stop();
    this.resizeObserver.disconnect();
    this.qualityListeners.clear();
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }

  private tick(time: number): void {
    if (!this.limiter.shouldRender(time)) return;
    const dt = this.lastFrameMs < 0 ? 1 / 60 : Math.min(0.1, (time - this.lastFrameMs) / 1000);
    this.stats.frameMs = this.lastFrameMs < 0 ? 0 : time - this.lastFrameMs;
    this.lastFrameMs = time;

    this.fpsFrames++;
    if (time - this.fpsWindowStart >= 500) {
      this.stats.fps = Math.round((this.fpsFrames * 1000) / (time - this.fpsWindowStart));
      this.fpsFrames = 0;
      this.fpsWindowStart = time;
    }
    this.onFrame?.(dt);
  }

  private createRenderer(): THREE.WebGLRenderer {
    const p = this.preset;
    const renderer = new THREE.WebGLRenderer({ antialias: p.antialias, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pixelRatioMax));
    renderer.shadowMap.enabled = p.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    this.host.appendChild(renderer.domElement);
    renderer.setSize(Math.max(1, this.host.clientWidth), Math.max(1, this.host.clientHeight));
    return renderer;
  }

  private resize(): void {
    this.renderer.setSize(Math.max(1, this.host.clientWidth), Math.max(1, this.host.clientHeight));
  }
}
