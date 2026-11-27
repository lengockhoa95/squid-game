import { useRef } from 'react';
import { TOWER, lavaHeight, vi } from '@sp/shared';
import type { MatchNetAdapter } from '../../network/types.ts';
import { useAnimationFrame } from '../../ui/match/useAnimationFrame.ts';

export function TowerHud({ net }: { net: MatchNetAdapter }) {
  const bar = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLDivElement>(null);
  const last = useRef('');
  useAnimationFrame(() => {
    const me = net.getState()?.players.get(net.localId);
    if (!me || !bar.current || !chip.current) return;
    bar.current.style.transform = `scaleX(${Math.min(1, me.score / TOWER.platforms)})`;
    const gap = Math.max(0, me.y - lavaHeight(net.gameTimeNow()));
    const text = `${vi.towerPlatform} ${me.score}/${TOWER.platforms} · ${vi.towerLava} ${gap.toFixed(0)}m`;
    if (text !== last.current) {
      last.current = text;
      chip.current.textContent = text;
      chip.current.classList.toggle('is-danger', gap < 4);
    }
  });
  return (
    <div className="game-hud">
      <div ref={chip} className="hud-chip" />
      <div className="meter meter-race"><div ref={bar} className="meter-fill" /></div>
      <p className="hud-tip">{vi.towerHint}</p>
    </div>
  );
}
