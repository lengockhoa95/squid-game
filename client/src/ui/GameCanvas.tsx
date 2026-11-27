import { useEffect, useRef, useState } from 'react';
import { vi } from '@sp/shared';
import { GameEngine } from '../core/GameEngine.ts';
import type { SceneLoader } from '../core/SceneManager.ts';
import { settingsStore } from '../store/settings.ts';
import { debugStore } from '../store/debug.ts';
import { touchStore } from '../store/touch.ts';
import { useStore } from '../store/UIStore.ts';
import { TouchControls } from './touch/TouchControls.tsx';

/** Mounts a GameEngine into a div for the lifetime of the component and loads one scene. */
export function GameCanvas({ loader }: { loader: SceneLoader }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [loading, setLoading] = useState(true);
  const touch = useStore(touchStore, (s) => s.enabled);
  // Toggle the class imperatively: the engine also toggles classes on this element (is-locked).
  useEffect(() => {
    hostRef.current?.classList.toggle('is-touch', touch);
  }, [touch]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const initial = settingsStore.get();
    const engine = new GameEngine(host, {
      quality: initial.quality,
      fpsCap: initial.fpsCap,
      mouseLook: initial.mouseLook,
      onStats: (stats, entities) => debugStore.set({ stats: { ...stats }, entities }),
      onToggleDebug: () => debugStore.set({ visible: !debugStore.get().visible }),
    });
    engineRef.current = engine;
    const offSettings = settingsStore.subscribe(() => {
      const s = settingsStore.get();
      engine.setQuality(s.quality);
      engine.setFpsCap(s.fpsCap);
      engine.setMouseLook(s.mouseLook);
    });
    let cancelled = false;
    void engine.loadScene(loader).then((ok) => {
      if (ok && !cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
      offSettings();
      engineRef.current = null;
      engine.dispose();
    };
  }, [loader]);

  return (
    <>
      <div ref={hostRef} className="game-host" />
      {touch && !loading && <TouchControls engine={engineRef} />}
      {loading && <div className="loading">{vi.loading}</div>}
    </>
  );
}
