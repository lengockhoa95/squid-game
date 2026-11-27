import { useRef } from 'react';
import { ICE_LENGTH, vi } from '@sp/shared';
import type { MatchNetAdapter } from '../../network/types.ts';
import { useAnimationFrame } from '../../ui/match/useAnimationFrame.ts';

export function IceHud({ net }: { net: MatchNetAdapter }) {
  const bar = useRef<HTMLDivElement>(null);
  useAnimationFrame(() => {
    const me = net.getState()?.players.get(net.localId);
    if (!me || !bar.current) return;
    bar.current.style.transform = `scaleX(${Math.min(1, me.score / ICE_LENGTH)})`;
  });
  return (
    <div className="game-hud">
      <div className="meter meter-race"><div ref={bar} className="meter-fill" /></div>
      <p className="hud-tip">{vi.iceHint}</p>
    </div>
  );
}
