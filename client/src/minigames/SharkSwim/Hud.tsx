import { useRef } from 'react';
import { SEA, vi } from '@sp/shared';
import type { MatchNetAdapter } from '../../network/types.ts';
import { useAnimationFrame } from '../../ui/match/useAnimationFrame.ts';

const LENGTH = SEA.beachZ - SEA.islandZ;

export function SharkHud({ net }: { net: MatchNetAdapter }) {
  const bar = useRef<HTMLDivElement>(null);
  const warn = useRef<HTMLDivElement>(null);
  useAnimationFrame(() => {
    const state = net.getState();
    const me = state?.players.get(net.localId);
    if (!me || !bar.current || !warn.current) return;
    bar.current.style.transform = `scaleX(${Math.min(1, me.score / LENGTH)})`;
    let near = Infinity;
    state?.sea?.sharks.forEach((s) => {
      near = Math.min(near, Math.hypot(s.x - me.x, s.z - me.z));
    });
    warn.current.style.visibility = near < 5 && me.roundState === 'ACTIVE' ? 'visible' : 'hidden';
  });
  return (
    <div className="game-hud">
      <div ref={warn} className="hud-chip is-danger" style={{ visibility: 'hidden' }}>{vi.sharkNear}</div>
      <div className="meter meter-race"><div ref={bar} className="meter-fill" /></div>
      <p className="hud-tip">{vi.sharkHint}</p>
    </div>
  );
}
