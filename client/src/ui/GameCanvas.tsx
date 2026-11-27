import { useEffect, useRef, useState } from 'react';
import { vi } from '@sp/shared';
import { GameEngine } from '../core/GameEngine.ts';
import type { SceneLoader } from '../core/SceneManager.ts';
import { settingsStore } from '../store/settings.ts';
import { debugStore } from '../store/debug.ts';

/** Mounts a GameEngine into a div for the lifetime of the component and loads one scene. */
export function GameCanvas({ loader }: { loader: SceneLoader }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

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
      engine.dispose();
    };
  }, [loader]);

  return (
    <>
      <div ref={hostRef} className="game-host" />
      {loading && <div className="loading">{vi.loading}</div>}
    </>
  );
}
