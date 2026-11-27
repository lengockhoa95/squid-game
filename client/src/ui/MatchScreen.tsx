import { useMemo, useState, type ReactNode } from 'react';
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

const HUDS: Record<MinigameId, (props: { net: MatchNetAdapter }) => ReactNode> = {
  RLGL: RlglHud,
  GLASS_BRIDGE: BridgeHud,
  OBSTACLE_RACE: RaceHud,
  FLOOR_COLLAPSE: CollapseHud,
  TOWER_CLIMB: TowerHud,
  MAZE: MazeHud,
  PARKOUR: ParkourHud,
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

export function MatchScreen() {
  const [showSettings, setShowSettings] = useState(false);
  const roomCode = useStore(sessionStore, (s) => s.roomCode);
  const amHost = useStore(sessionStore, (s) => s.myId !== '' && s.myId === s.hostId);
  const game = useStore(sessionStore, (s) => s.currentGame);
  const playing = useStore(sessionStore, (s) => s.phase === 'ROUND_PLAYING');
  useMatchSounds();
  // The adapter and scene loader are bound to the current session; created once per mounted match screen.
  const adapter = useMemo(() => network.getAdapter(), []);
  const loader = useMemo(() => (adapter ? matchSceneLoader(adapter) : null), [adapter]);
  if (!adapter || !loader) return null;
  const movement = game ? MINIGAMES[game].movement : false;

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
      <RoundHeader />
      {showSettings && <div className="floating-panel"><SettingsPanel /></div>}
      <PlayerList />
      <StatusBanner />
      <PhaseLayer net={adapter} />
      <CardBar />
      <AnnounceBanner />
      <DebugOverlay />
      {movement && playing && <ControlsHint />}
    </div>
  );
}
