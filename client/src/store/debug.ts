import type { RenderStats } from '../core/RenderManager.ts';
import { createStore } from './UIStore.ts';

export interface DebugState {
  visible: boolean;
  stats: Readonly<RenderStats> | null;
  entities: number;
}

export const debugStore = createStore<DebugState>({ visible: false, stats: null, entities: 0 });
