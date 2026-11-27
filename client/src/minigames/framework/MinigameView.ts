import type * as THREE from 'three';
import type { GameAction, MinigameId, QualityPreset, StepFn } from '@sp/shared';
import type { MatchState } from '@sp/shared/schema';
import type { CameraPreset, ClickHit, SceneContext } from '../../core/GameScene.ts';
import type { ResourceTracker } from '../../core/ResourceTracker.ts';

export interface ViewFrame {
  /** Estimated server game time (s) for moving hazards. */
  gameTime: number;
  state: MatchState;
  /** Where the camera is looking (for shadow frustum / LOD). */
  focus: Readonly<THREE.Vector3>;
  localId: string;
}

/**
 * Client-side presentation of one minigame: environment, effects, and how clicks/keys map to
 * game actions. Gameplay decisions stay on the server; a view only renders synced state.
 */
export interface MinigameView {
  /** Movement games expose the shared step function for client prediction; null otherwise. */
  readonly step: StepFn | null;
  readonly clickTargets: readonly THREE.Object3D[];
  readonly cameraPreset: CameraPreset;
  /** Fixed camera focus for stationary games; null = follow the player. */
  cameraFocus(): Readonly<THREE.Vector3> | null;
  update(dt: number, frame: ViewFrame): void;
  /** Left click → game action (null = not an action; movement games then walk to the point). */
  actionForClick(hit: ClickHit, frame: ViewFrame): GameAction | null;
  actionForKey(code: string, frame: ViewFrame): GameAction | null;
  applyQuality(p: QualityPreset): void;
  dispose(): void;
}

export type ViewFactory = (root: THREE.Object3D, scene: THREE.Scene, ctx: SceneContext, resources: ResourceTracker) => MinigameView;

/** Each minigame's 3D code is a separate chunk, loaded only when that round starts. */
export const VIEW_LOADERS: Readonly<Record<MinigameId, () => Promise<ViewFactory>>> = {
  RLGL: () => import('../RedLightGreenLight/View.ts').then((m) => m.createView),
  GLASS_BRIDGE: () => import('../GlassBridge/View.ts').then((m) => m.createView),
  OBSTACLE_RACE: () => import('../ObstacleRace/View.ts').then((m) => m.createView),
  FLOOR_COLLAPSE: () => import('../FloorCollapse/View.ts').then((m) => m.createView),
  TOWER_CLIMB: () => import('../TowerClimb/View.ts').then((m) => m.createView),
  MAZE: () => import('../Maze/View.ts').then((m) => m.createView),
  PARKOUR: () => import('../Parkour/View.ts').then((m) => m.createView),
};
