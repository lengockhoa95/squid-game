import { useRef } from 'react';
import { TILE_BROKEN, vi } from '@sp/shared';
import type { MatchNetAdapter } from '../../network/types.ts';
import { useAnimationFrame } from '../../ui/match/useAnimationFrame.ts';
import { audio } from '../../audio/AudioManager.ts';

export function BridgeHud({ net }: { net: MatchNetAdapter }) {
  const rowText = useRef<HTMLSpanElement>(null);
  const broken = useRef(0);
  useAnimationFrame(() => {
    const state = net.getState();
    const bridge = state?.bridge;
    if (!state || !bridge || !rowText.current) return;
    const me = state.players.get(net.localId);
    const row = Math.min(bridge.rows, Math.round(me?.score ?? 0));
    const text = `${vi.bridgeRow} ${row}/${bridge.rows}`;
    if (rowText.current.textContent !== text) rowText.current.textContent = text;
    let count = 0;
    bridge.tiles.forEach((t) => {
      if (t === TILE_BROKEN) count++;
    });
    if (count > broken.current) audio.play('break');
    broken.current = count;
  });
  return (
    <div className="game-hud">
      <div className="hud-chip"><span ref={rowText} /></div>
      <p className="hud-tip">{vi.bridgeHint}</p>
    </div>
  );
}
