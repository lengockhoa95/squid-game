import { useRef } from 'react';
import { SLOT_LOOKS, vi } from '@sp/shared';
import type { MatchNetAdapter } from '../../network/types.ts';
import { useAnimationFrame } from '../../ui/match/useAnimationFrame.ts';

/** Live cell counts, best first (updated a few times per second). */
export function PaintHud({ net }: { net: MatchNetAdapter }) {
  const board = useRef<HTMLDivElement>(null);
  const last = useRef('');
  useAnimationFrame(() => {
    const state = net.getState();
    if (!state || !board.current) return;
    const rows: Array<{ name: string; slot: number; score: number; me: boolean }> = [];
    state.players.forEach((p) => {
      if (p.alive) rows.push({ name: p.nickname, slot: p.slot, score: p.score, me: p.id === net.localId });
    });
    rows.sort((a, b) => b.score - a.score);
    const key = rows.map((r) => `${r.slot}:${r.score}`).join(',');
    if (key === last.current) return;
    last.current = key;
    board.current.innerHTML = '';
    for (const r of rows) {
      const chip = document.createElement('span');
      chip.className = `paint-chip${r.me ? ' is-me' : ''}`;
      chip.style.setProperty('--c', `#${(SLOT_LOOKS[r.slot]?.color ?? 0xffffff).toString(16).padStart(6, '0')}`);
      chip.textContent = `${r.name} ${r.score}`;
      board.current.appendChild(chip);
    }
  });
  return (
    <div className="game-hud game-hud-top">
      <div ref={board} className="paint-board" />
      <p className="hud-tip">{vi.paintHint}</p>
    </div>
  );
}
