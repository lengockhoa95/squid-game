import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { settingsStore } from '../store/settings.ts';
import { touchStore } from '../store/touch.ts';
import { MINIGAMES, vi, type MinigameId } from '@sp/shared';
import { matchSceneLoader } from '../core/GameEngine.ts';
import { network } from '../network/NetworkManager.ts';
import { sessionStore } from '../network/sessionStore.ts';
import type { MatchNetAdapter } from '../network/types.ts';
import { debugStore } from '../store/debug.ts';
import { useStore } from '../store/UIStore.ts';
import { GameCanvas } from './GameCanvas.tsx';
import { DebugOverlay } from './DebugOverlay.tsx';
import { ControlsHint } from './ControlsHint.tsx';
import { SettingsPanel } from './SettingsPanel.tsx';
import {
  CountdownOverlay, PlayerList, ResultsCard, RoundHeader, RulesCard, StatusBanner, WinnerCard,
} from './match/MatchOverlays.tsx';
import { useMatchSounds } from './match/useMatchSounds.ts';
import { ElementBar, ElementPicker } from '../elements/ElementHud.tsx';
import { AnnounceBanner, CardBar, CardDraft } from '../cards/CardUi.tsx';
import { RlglHud } from '../minigames/RedLightGreenLight/Hud.tsx';
import { BridgeHud } from '../minigames/GlassBridge/Hud.tsx';
import { RaceHud } from '../minigames/ObstacleRace/Hud.tsx';
import { CollapseHud } from '../minigames/FloorCollapse/Hud.tsx';
import { TowerHud } from '../minigames/TowerClimb/Hud.tsx';
import { MazeHud } from '../minigames/Maze/Hud.tsx';
import { ParkourHud } from '../minigames/Parkour/Hud.tsx';
import { IceHud } from '../minigames/IceRace/Hud.tsx';
import { DoorsHud } from '../minigames/LuckyDoors/Hud.tsx';
import { PaintHud } from '../minigames/Paint/Hud.tsx';
import { ZombieHud } from '../minigames/Zombie/Hud.tsx';
import { RopeHud } from '../minigames/RopeClimb/Hud.tsx';

const HUDS: Record<MinigameId, (props: { net: MatchNetAdapter }) => ReactNode> = {
  RLGL: RlglHud,
  GLASS_BRIDGE: BridgeHud,
  OBSTACLE_RACE: RaceHud,
  FLOOR_COLLAPSE: CollapseHud,
  TOWER_CLIMB: TowerHud,
  MAZE: MazeHud,
  PARKOUR: ParkourHud,
  ICE_RACE: IceHud,
  LUCKY_DOORS: DoorsHud,
  PAINT: PaintHud,
  ZOMBIE: ZombieHud,
  ROPE_CLIMB: RopeHud,
};

function PhaseLayer({ net }: { net: MatchNetAdapter }) {
  const phase = useStore(sessionStore, (s) => s.phase);
  const game = useStore(sessionStore, (s) => s.currentGame);
  switch (phase) {
    case 'ROUND_INTRO':
      return <><RulesCard /><ElementPicker net={net} /></>;
    case 'ROUND_COUNTDOWN':
      return <><CountdownOverlay /><ElementPicker net={net} /></>;
    case 'ROUND_PLAYING': {
      if (!game) return null;
      const Hud = HUDS[game];
      return <><Hud net={net} /><ElementBar net={net} /></>;
    }
    case 'ROUND_RESULT':
      return <><ResultsCard /><CardDraft net={net} /></>;
    case 'MATCH_END':
      return <WinnerCard />;
    default:
      return null;
  }
}

/** "Click to capture the mouse" hint while mouse look is available but not active. */
function MouseLookHint({ movement }: { movement: boolean }) {
  const mouseLook = useStore(settingsStore, (s) => s.mouseLook);
  const touch = useStore(touchStore, (s) => s.enabled);
  const enabled = mouseLook && !touch;
  const playing = useStore(sessionStore, (s) => s.phase === 'ROUND_PLAYING');
  const active = useStore(sessionStore, (s) => {
    const me = s.players.find((p) => p.id === s.myId);
    return !!me && me.alive && me.roundState === 'ACTIVE';
  });
  const [locked, setLocked] = useState(() => document.pointerLockElement !== null);
  useEffect(() => {
    const on = () => setLocked(document.pointerLockElement !== null);
    document.addEventListener('pointerlockchange', on);
    return () => document.removeEventListener('pointerlockchange', on);
  }, []);
  if (!enabled || !movement || !playing || !active || locked) return null;
  return <div className="mouselook-hint">{vi.mouseLookHint}</div>;
}

export function MatchScreen() {
  const [showSettings, setShowSettings] = useState(false);
  const roomCode = useStore(sessionStore, (s) => s.roomCode);
  const amHost = useStore(sessionStore, (s) => s.myId !== '' && s.myId === s.hostId);
  const game = useStore(sessionStore, (s) => s.currentGame);
  const playing = useStore(sessionStore, (s) => s.phase === 'ROUND_PLAYING');
  const touch = useStore(touchStore, (s) => s.enabled);
  useMatchSounds();
  // The adapter and scene loader are bound to the current session; created once per mounted match screen.
  const adapter = useMemo(() => network.getAdapter(), []);
  const loader = useMemo(() => (adapter ? matchSceneLoader(adapter) : null), [adapter]);
  if (!adapter || !loader) return null;
  const movement = game ? MINIGAMES[game].movement : false;

  return (
    <div className={`game-screen ${touch ? 'is-touch' : ''}`}>
      <GameCanvas loader={loader} />
      <div className="hud-top">
        <button type="button" className="btn btn-ghost" onClick={() => void network.leave()}>← {vi.leaveRoom}</button>
        {amHost && <button type="button" className="btn btn-ghost" onClick={() => network.backToLobby()}>{vi.backToLobby}</button>}
        <button type="button" className="btn btn-ghost" onClick={() => setShowSettings((v) => !v)}>⚙ {vi.settings}</button>
        <button type="button" className="btn btn-ghost" onClick={() => debugStore.set({ visible: !debugStore.get().visible })}>F3</button>
        <span className="hud-code">{vi.roomCode}: <b>{roomCode}</b></span>
      </div>
      <RoundHeader />
      {showSettings && <div className="floating-panel"><SettingsPanel /></div>}
      <PlayerList />
      <StatusBanner />
      <PhaseLayer net={adapter} />
      <CardBar />
      <AnnounceBanner />
      <DebugOverlay />
      {movement && playing && !touch && <ControlsHint />}
      {movement && playing && touch && <div className="touch-hint">{vi.touchHint}</div>}
      <MouseLookHint movement={movement} />
    </div>
  );
}
