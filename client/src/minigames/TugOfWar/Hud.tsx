import { useRef } from 'react';
import { TUG, tugCursor, vi } from '@sp/shared';
import type { MatchNetAdapter } from '../../network/types.ts';
import { useAnimationFrame } from '../../ui/match/useAnimationFrame.ts';

export function TugHud({ net }: { net: MatchNetAdapter }) {
  const cursor = useRef<HTMLDivElement>(null);
  const rope = useRef<HTMLDivElement>(null);
  const team = useRef<HTMLSpanElement>(null);
  useAnimationFrame(() => {
    const state = net.getState();
    if (!state || !cursor.current || !rope.current || !team.current) return;
    cursor.current.style.left = `${tugCursor(net.gameTimeNow()) * 100}%`;
    rope.current.style.left = `${50 + (state.tug?.rope ?? 0) * 50}%`;
    const me = state.players.get(net.localId);
    const label = me && me.team >= 0 ? `${vi.tugYourTeam}: ${me.team === 0 ? vi.tugLeft : vi.tugRight}` : '';
    if (team.current.textContent !== label) team.current.textContent = label;
  });
  const zone = TUG.zoneHalfWidth * 100;
  return (
    <div className="game-hud">
      <div className="hud-chip"><span ref={team} /></div>
      <div className="timing">
        <div className="timing-zone" style={{ left: `${50 - zone}%`, width: `${zone * 2}%` }} />
        <div ref={cursor} className="timing-cursor" />
      </div>
      <div className="rope-meter">
        <span className="rope-left" />
        <span className="rope-right" />
        <div ref={rope} className="rope-marker" />
      </div>
      <p className="hud-tip">{vi.tugHint}</p>
    </div>
  );
}
