import { useState } from 'react';
import { vi } from '@sp/shared';
import { playgroundLoader } from '../core/GameEngine.ts';
import { debugStore } from '../store/debug.ts';
import { GameCanvas } from './GameCanvas.tsx';
import { DebugOverlay } from './DebugOverlay.tsx';
import { ControlsHint } from './ControlsHint.tsx';
import { SettingsPanel } from './SettingsPanel.tsx';

export function PlaygroundScreen({ onExit }: { onExit: () => void }) {
  const [showSettings, setShowSettings] = useState(false);
  return (
    <div className="game-screen">
      <GameCanvas loader={playgroundLoader} />
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
