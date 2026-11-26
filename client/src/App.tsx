import { lazy, Suspense, useEffect, useState } from 'react';
import { vi } from '@sp/shared';
import { HomeScreen } from './ui/HomeScreen.tsx';
import { LobbyScreen } from './ui/LobbyScreen.tsx';
import { StatusLayer } from './ui/StatusLayer.tsx';
import { network } from './network/NetworkManager.ts';
import { sessionStore } from './network/sessionStore.ts';
import { useStore } from './store/UIStore.ts';

// three.js + engine load only when entering a 3D screen, keeping the menu bundle small.
const PlaygroundScreen = lazy(() => import('./ui/PlaygroundScreen.tsx').then((m) => ({ default: m.PlaygroundScreen })));
const MatchScreen = lazy(() => import('./ui/MatchScreen.tsx').then((m) => ({ default: m.MatchScreen })));

function Screen({ offline, setOffline }: { offline: boolean; setOffline: (v: boolean) => void }) {
  const status = useStore(sessionStore, (s) => s.status);
  const phase = useStore(sessionStore, (s) => s.phase);
  const inRoom = status === 'in-room' || status === 'reconnecting';

  if (inRoom && phase === 'LOBBY') return <LobbyScreen />;
  if (inRoom) return <MatchScreen />;
  if (offline) return <PlaygroundScreen onExit={() => setOffline(false)} />;
  return <HomeScreen onEnterPlayground={() => setOffline(true)} />;
}

export function App() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    void network.tryResume(); // rejoin after a page reload if our seat is still held
  }, []);

  return (
    <>
      <Suspense fallback={<div className="loading">{vi.loading}</div>}>
        <Screen offline={offline} setOffline={setOffline} />
      </Suspense>
      <StatusLayer />
    </>
  );
}
