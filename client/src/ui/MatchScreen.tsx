import { useMemo, useState } from 'react';
import { vi } from '@sp/shared';
import { networkArenaLoader } from '../core/GameEngine.ts';
import { network } from '../network/NetworkManager.ts';
import { sessionStore } from '../network/sessionStore.ts';
import { debugStore } from '../store/debug.ts';
import { useStore } from '../store/UIStore.ts';
import { GameCanvas } from './GameCanvas.tsx';
import { DebugOverlay } from './DebugOverlay.tsx';
import { ControlsHint } from './ControlsHint.tsx';
import { SettingsPanel } from './SettingsPanel.tsx';
import { Avatar } from './Avatar.tsx';

function CountdownOverlay() {
  const phase = useStore(sessionStore, (s) => s.phase);
  const countdown = useStore(sessionStore, (s) => s.countdown);
  if (phase !== 'STARTING') return null;
  return (
    <div className="countdown" key={countdown}>
      <span>{countdown > 0 ? countdown : vi.countdownGo}</span>
    </div>
  );
}

function PlayerList() {
  const players = useStore(sessionStore, (s) => s.players);
  const myId = useStore(sessionStore, (s) => s.myId);
  return (
    <ul className="hud-players">
      {players.map((p) => (
        <li key={p.id} className={p.connected ? '' : 'is-off'}>
          <Avatar slot={p.slot} name={p.nickname} />
          <span>{p.nickname}{p.id === myId ? ` (${vi.you})` : ''}</span>
          {!p.connected && <em>{vi.disconnected}</em>}
        </li>
      ))}
    </ul>
  );
}

export function MatchScreen() {
  const [showSettings, setShowSettings] = useState(false);
  const roomCode = useStore(sessionStore, (s) => s.roomCode);
  const amHost = useStore(sessionStore, (s) => s.myId !== '' && s.myId === s.hostId);
  // The adapter is bound to the current room; created once per mounted match screen.
  const loader = useMemo(() => {
    const adapter = network.getAdapter();
    return adapter ? networkArenaLoader(adapter) : null;
  }, []);
  if (!loader) return null;

  return (
    <div className="game-screen">
      <GameCanvas loader={loader} />
      <div className="hud-top">
        <button type="button" className="btn btn-ghost" onClick={() => void network.leave()}>← {vi.leaveRoom}</button>
        {amHost && <button type="button" className="btn btn-ghost" onClick={() => network.backToLobby()}>{vi.backToLobby}</button>}
        <button type="button" className="btn btn-ghost" onClick={() => setShowSettings((v) => !v)}>⚙ {vi.settings}</button>
        <button type="button" className="btn btn-ghost" onClick={() => debugStore.set({ visible: !debugStore.get().visible })}>F3</button>
        <span className="hud-code">{vi.roomCode}: <b>{roomCode}</b></span>
      </div>
      {showSettings && <div className="floating-panel"><SettingsPanel /></div>}
      <PlayerList />
      <p className="hud-hint">{vi.freeRoamHint}</p>
      <CountdownOverlay />
      <DebugOverlay />
      <ControlsHint />
    </div>
  );
}
