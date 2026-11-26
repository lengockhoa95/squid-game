import { vi } from '@sp/shared';
import { debugStore } from '../store/debug.ts';
import { useStore } from '../store/UIStore.ts';

export function DebugOverlay() {
  const visible = useStore(debugStore, (s) => s.visible);
  const stats = useStore(debugStore, (s) => s.stats);
  const entities = useStore(debugStore, (s) => s.entities);
  if (!visible || !stats) return null;
  return (
    <div className="debug">
      <div><b>FPS</b> {stats.fps} <span className="muted">({stats.frameMs.toFixed(1)} ms)</span></div>
      <div><b>Draw calls</b> {stats.drawCalls}</div>
      <div><b>Triangles</b> {stats.triangles.toLocaleString()}</div>
      <div><b>Geometries</b> {stats.geometries} · <b>Textures</b> {stats.textures}</div>
      <div><b>Heap</b> {stats.heapMB === null ? 'n/a' : `${stats.heapMB.toFixed(1)} MB`}</div>
      <div><b>{vi.debugEntities}</b> {entities}</div>
    </div>
  );
}
