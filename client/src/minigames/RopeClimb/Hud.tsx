import { useRef } from 'react';
import { ROPE, vi, windAt } from '@sp/shared';
import type { MatchNetAdapter } from '../../network/types.ts';
import { useAnimationFrame } from '../../ui/match/useAnimationFrame.ts';

export function RopeHud({ net }: { net: MatchNetAdapter }) {
  const chip = useRef<HTMLDivElement>(null);
  const last = useRef('');
  useAnimationFrame(() => {
    const me = net.getState()?.players.get(net.localId);
    if (!me || !chip.current) return;
    const wind = windAt(net.gameTimeNow());
    const gust = Math.abs(wind) > 0.3 ? ` · ${vi.ropeWind} ${wind > 0 ? '→' : '←'}` : '';
    const text = `${vi.ropeStation} ${me.score + 1}/${ROPE.stations}${gust}`;
    if (text === last.current) return;
    last.current = text;
    chip.current.textContent = text;
    chip.current.classList.toggle('is-danger', gust !== '');
  });
  return (
    <div className="game-hud">
      <div ref={chip} className="hud-chip" />
      <p className="hud-tip">{vi.ropeHint}</p>
    </div>
  );
}
