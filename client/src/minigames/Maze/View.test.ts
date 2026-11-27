import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { QUALITY_PRESETS } from '@sp/shared';
import { MatchState, MazeState } from '@sp/shared/schema';
import { MaterialLibrary } from '../../core/MaterialLibrary.ts';
import { ResourceTracker } from '../../core/ResourceTracker.ts';
import { createView } from './View.ts';

describe('MazeView', () => {
  it('hides the minotaur until it is released, then shows it', () => {
    const root = new THREE.Group();
    const scene = new THREE.Scene();
    const view = createView(root, scene, { materials: new MaterialLibrary(), quality: QUALITY_PRESETS.LOW }, new ResourceTracker());
    const state = new MatchState();
    state.maze = new MazeState();
    state.maze.seed = 42;
    const frame = { gameTime: 1, state, focus: new THREE.Vector3(), localId: 'x' };
    view.update(0.016, frame);
    const horned = () => {
      let found: THREE.Object3D | null = null;
      root.traverse((o) => {
        if (o instanceof THREE.Mesh && o.geometry instanceof THREE.ConeGeometry && !found) found = o;
      });
      return found as THREE.Object3D | null;
    };
    const visibleInScene = (o: THREE.Object3D | null) => {
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
      return true;
    };
    expect(horned()).not.toBeNull();
    expect(visibleInScene(horned())).toBe(false);
    state.maze.active = true;
    view.update(0.016, frame);
    expect(visibleInScene(horned())).toBe(true);
  });
});
