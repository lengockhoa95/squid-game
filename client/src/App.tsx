import { lazy, Suspense, useState } from 'react';
import { vi } from '@sp/shared';
import { HomeScreen } from './ui/HomeScreen.tsx';

// three.js + engine load only when entering a 3D screen, keeping the menu bundle small.
const PlaygroundScreen = lazy(() => import('./ui/PlaygroundScreen.tsx').then((m) => ({ default: m.PlaygroundScreen })));

type Screen = 'home' | 'playground';

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  if (screen === 'home') return <HomeScreen onEnterPlayground={() => setScreen('playground')} />;
  return (
    <Suspense fallback={<div className="loading">{vi.loading}</div>}>
      <PlaygroundScreen onExit={() => setScreen('home')} />
    </Suspense>
  );
}
