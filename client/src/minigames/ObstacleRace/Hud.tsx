import { useRef } from 'react';
import { RACE, vi } from '@sp/shared';
import type { MatchNetAdapter } from '../../network/types.ts';
import { useAnimationFrame } from '../../ui/match/useAnimationFrame.ts';

const LENGTH = RACE.startZ - RACE.finishZ;

export function RaceHud({ net }: { net: MatchNetAdapter }) {
  const bar = useRef<HTMLDivElement>(null);
  useAnimationFrame(() => {
    const me = net.getState()?.players.get(net.localId);
    if (!me || !bar.current) return;
    bar.current.style.transform = `scaleX(${Math.min(1, me.score / LENGTH)})`;
  });
  return (
    <div className="game-hud">
      <div className="meter meter-race"><div ref={bar} className="meter-fill" /></div>
      <p className="hud-tip">{vi.raceHint}</p>
    </div>
  );
}
