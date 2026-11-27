import * as THREE from 'three';
import {
  MAZE, MAZE_EXIT_COL, MAZE_EXIT_Z, MAZE_HALF_D, MAZE_HALF_W, cellCenter, createMazeWorld, generateMaze, mazeWalls, stepCharacter,
  type QualityPreset, type SimWorld, type StepFn,
} from '@sp/shared';
import type { SceneContext } from '../../core/GameScene.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';
import type { MinigameView, ViewFrame } from '../framework/MinigameView.ts';
import { StageLights, setSky } from '../framework/stage.ts';
import { PlayerModel } from '../../player/PlayerModel.ts';
import type { CharacterBody } from '../../player/CharacterBody.ts';
import { MINOTAUR_CHARACTER, createNamedBody } from '../../player/characters.ts';

const DEG = Math.PI / 180;
const MAX_WALLS = (MAZE.rows + 1) * MAZE.cols + MAZE.rows * (MAZE.cols + 1);
const EMPTY_WORLD: SimWorld = { bounds: { minX: -1e3, maxX: 1e3, minZ: -1e3, maxZ: 1e3 }, boxes: [], killY: -10 };

/** Hedge maze built from the synced seed, an exit gate, and the minotaur (interpolated from state). */
class MazeView implements MinigameView {
  private world: SimWorld = EMPTY_WORLD;
  readonly step: StepFn = (s, intent, dt) => stepCharacter(s, intent, dt, this.world);
  readonly clickTargets: THREE.Object3D[] = [];
  readonly cameraPreset = { yaw: 0, pitch: 58 * DEG, distance: 13 };
  private readonly lights: StageLights;
  private readonly walls: THREE.InstancedMesh;
  private readonly minotaur: CharacterBody;
  private seed = -1;
  private readonly mtx = new THREE.Matrix4();
  private readonly last = new THREE.Vector3();

  constructor(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker) {
    setSky(scene, 0x1d2b22, 25, 90);
    this.lights = new StageLights(root, 24, 0xe6ffe0, 0x2a3a2a);
    const m = ctx.materials;
    const floor = new THREE.Mesh(res.track(new THREE.BoxGeometry(MAZE_HALF_W * 2 + 8, 1, MAZE_HALF_D * 2 + 14)), m.lambert(0x8a7a5a));
    floor.position.set(0, -0.5, -3);
    floor.receiveShadow = true;
    root.add(floor);
    this.clickTargets.push(floor);

    const unit = res.track(new THREE.BoxGeometry(1, 1, 1));
    this.walls = res.track(new THREE.InstancedMesh(unit, m.lambert(0x2f7d4a), MAX_WALLS));
    this.walls.castShadow = true;
    this.walls.receiveShadow = true;
    this.walls.count = 0;
    root.add(this.walls);

    // Exit gate.
    const gate = cellCenter(0, MAZE_EXIT_COL);
    const post = res.track(new THREE.BoxGeometry(0.5, 4, 0.5));
    for (const dx of [-MAZE.cell / 2, MAZE.cell / 2]) {
      const p = new THREE.Mesh(post, m.lambert(0x3df5c8));
      p.position.set(gate.x + dx, 2, -MAZE_HALF_D);
      root.add(p);
    }
    const beam = new THREE.Mesh(res.track(new THREE.BoxGeometry(MAZE.cell + 0.5, 0.5, 0.5)), m.lambert(0x3df5c8));
    beam.position.set(gate.x, 4, -MAZE_HALF_D);
    const line = new THREE.Mesh(res.track(new THREE.BoxGeometry(MAZE.cell, 0.02, 0.4)), m.basic(0x3df5c8));
    line.position.set(gate.x, 0.01, MAZE_EXIT_Z);
    root.add(beam, line);

    // Minotaur: a big horned zombie (Kenney character; procedural fallback if not loaded).
    const kenney = createNamedBody(m, MINOTAUR_CHARACTER);
    this.minotaur = kenney ?? new PlayerModel(m, 0x7a1f1f, 'none');
    this.minotaur.group.scale.setScalar(kenney ? 1.6 : 1.5);
    const horn = res.track(new THREE.ConeGeometry(kenney ? 0.05 : 0.09, kenney ? 0.18 : 0.4, 6));
    for (const side of [-1, 1]) {
      const h = new THREE.Mesh(horn, m.lambert(0xf2e6c9));
      if (kenney) h.position.set(side * 0.2, 0.32, 0);
      else h.position.set(side * 0.28, 0.28, 0);
      h.rotation.z = -side * 0.7;
      this.minotaur.head.add(h);
    }
    this.minotaur.group.visible = false;
    root.add(this.minotaur.group);
    this.applyQuality(ctx.quality);
  }

  cameraFocus(): null {
    return null;
  }

  update(dt: number, frame: ViewFrame): void {
    const maze = frame.state.maze;
    if (maze && maze.seed !== this.seed) this.build(maze.seed);
    if (maze) {
      const g = this.minotaur.group;
      g.visible = maze.active;
      if (maze.active) {
        this.last.copy(g.position);
        const k = Math.min(1, dt * 12);
        g.position.x += (maze.mx - g.position.x) * k;
        g.position.z += (maze.mz - g.position.z) * k;
        g.rotation.y = maze.myaw;
        const speed = dt > 0 ? this.last.distanceTo(g.position) / dt : 0;
        this.minotaur.animate(dt, speed, true);
      }
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
    this.minotaur.dispose();
    this.lights.dispose();
  }

  private build(seed: number): void {
    this.seed = seed;
    const maze = generateMaze(seed);
    this.world = createMazeWorld(maze);
    const boxes = mazeWalls(maze);
    boxes.forEach((b, i) => {
      this.mtx.makeScale(b.maxX - b.minX, b.top, b.maxZ - b.minZ);
      this.mtx.setPosition((b.minX + b.maxX) / 2, b.top / 2, (b.minZ + b.maxZ) / 2);
      this.walls.setMatrixAt(i, this.mtx);
    });
    this.walls.count = boxes.length;
    this.walls.instanceMatrix.needsUpdate = true;
    const lair = cellCenter(MAZE.rows - 1, MAZE_EXIT_COL);
    this.minotaur.group.position.set(lair.x, 0, lair.z + 1);
  }
}

export function createView(root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, res: ResourceTracker): MinigameView {
  return new MazeView(root, scene, ctx, res);
}
