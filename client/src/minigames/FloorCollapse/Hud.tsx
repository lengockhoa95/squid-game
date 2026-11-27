import { useRef } from 'react';
import { COLLAPSE, vi } from '@sp/shared';
import type { MatchNetAdapter } from '../../network/types.ts';
import { useAnimationFrame } from '../../ui/match/useAnimationFrame.ts';

export function CollapseHud({ net }: { net: MatchNetAdapter }) {
  const chip = useRef<HTMLDivElement>(null);
  const last = useRef('');
  useAnimationFrame(() => {
    const state = net.getState();
    const me = state?.players.get(net.localId);
    if (!state || !chip.current) return;
    let standing = 0;
    state.players.forEach((p) => {
      if (p.alive && p.roundState === 'ACTIVE') standing++;
    });
    const floor = me ? Math.min(COLLAPSE.layers, Math.max(1, Math.round(-me.y / COLLAPSE.layerGap) + 1)) : 1;
    const text = `${vi.collapseStanding}: ${standing} · ${vi.collapseFloor} ${floor}/${COLLAPSE.layers}`;
    if (text !== last.current) {
      last.current = text;
      chip.current.textContent = text;
    }
  });
  return (
    <div className="game-hud">
      <div ref={chip} className="hud-chip" />
      <p className="hud-tip">{vi.collapseHint}</p>
    </div>
  );
}
