import { useRef } from 'react';
import { DOORS, vi } from '@sp/shared';
import type { MatchNetAdapter } from '../../network/types.ts';
import { useAnimationFrame } from '../../ui/match/useAnimationFrame.ts';

export function DoorsHud({ net }: { net: MatchNetAdapter }) {
  const chip = useRef<HTMLDivElement>(null);
  const last = useRef('');
  useAnimationFrame(() => {
    const me = net.getState()?.players.get(net.localId);
    if (!me || !chip.current) return;
    const text = `${vi.doorsRow} ${Math.min(DOORS.rows, me.score)}/${DOORS.rows}`;
    if (text !== last.current) {
      last.current = text;
      chip.current.textContent = text;
    }
  });
  return (
    <div className="game-hud">
      <div ref={chip} className="hud-chip" />
      <p className="hud-tip">{vi.doorsHint}</p>
    </div>
  );
}
