import { useRef } from 'react';
import { MAZE, vi } from '@sp/shared';
import type { MatchNetAdapter } from '../../network/types.ts';
import { useAnimationFrame } from '../../ui/match/useAnimationFrame.ts';

export function MazeHud({ net }: { net: MatchNetAdapter }) {
  const chip = useRef<HTMLDivElement>(null);
  const last = useRef('');
  useAnimationFrame(() => {
    const state = net.getState();
    const me = state?.players.get(net.localId);
    const maze = state?.maze;
    if (!me || !maze || !chip.current) return;
    let text: string;
    let danger = false;
    if (!maze.active) {
      text = `${vi.mazeReleaseIn} ${Math.max(0, Math.ceil(MAZE.minotaurDelay - net.gameTimeNow()))}s`;
    } else {
      const d = Math.hypot(me.x - maze.mx, me.z - maze.mz);
      danger = d < 10;
      text = `${vi.mazeDistance} ${d.toFixed(0)}m`;
    }
    if (text !== last.current) {
      last.current = text;
      chip.current.textContent = text;
      chip.current.classList.toggle('is-danger', danger);
    }
  });
  return (
    <div className="game-hud">
      <div ref={chip} className="hud-chip" />
      <p className="hud-tip">{vi.mazeHint}</p>
    </div>
  );
}
