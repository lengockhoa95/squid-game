import { useEffect, useRef, useState } from 'react';
import { vi } from '@sp/shared';
import { GameEngine, playgroundLoader } from '../core/GameEngine.ts';
import { settingsStore } from '../store/settings.ts';
import { debugStore } from '../store/debug.ts';
import { DebugOverlay } from './DebugOverlay.tsx';
import { ControlsHint } from './ControlsHint.tsx';
import { SettingsPanel } from './SettingsPanel.tsx';

export function PlaygroundScreen({ onExit }: { onExit: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const initial = settingsStore.get();
    const engine = new GameEngine(host, {
      quality: initial.quality,
      fpsCap: initial.fpsCap,
      onStats: (stats, entities) => debugStore.set({ stats: { ...stats }, entities }),
      onToggleDebug: () => debugStore.set({ visible: !debugStore.get().visible }),
    });
    const offSettings = settingsStore.subscribe(() => {
      const s = settingsStore.get();
      engine.setQuality(s.quality);
      engine.setFpsCap(s.fpsCap);
    });
    let cancelled = false;
    engine.loadScene(playgroundLoader).then((ok) => {
      if (ok && !cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
      offSettings();
      engine.dispose();
    };
  }, []);

  return (
    <div className="game-screen">
      <div ref={hostRef} className="game-host" />
      {loading && <div className="loading">{vi.loading}</div>}
      <div className="hud-top">
        <button type="button" className="btn btn-ghost" onClick={onExit}>← {vi.backToMenu}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setShowSettings((v) => !v)}>⚙ {vi.settings}</button>
        <button type="button" className="btn btn-ghost" onClick={() => debugStore.set({ visible: !debugStore.get().visible })}>F3</button>
      </div>
      {showSettings && <div className="floating-panel"><SettingsPanel /></div>}
      <DebugOverlay />
      <ControlsHint />
    </div>
  );
}
