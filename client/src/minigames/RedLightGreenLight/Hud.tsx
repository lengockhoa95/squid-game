import { useRef } from 'react';
import { vi } from '@sp/shared';
import type { MatchNetAdapter } from '../../network/types.ts';
import { useAnimationFrame } from '../../ui/match/useAnimationFrame.ts';
import { audio } from '../../audio/AudioManager.ts';

export function RlglHud({ net }: { net: MatchNetAdapter }) {
  const pill = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const last = useRef('');
  useAnimationFrame(() => {
    const rlgl = net.getState()?.rlgl;
    if (!rlgl || !pill.current || !bar.current) return;
    if (rlgl.light !== last.current) {
      if (last.current) audio.play(rlgl.light === 'RED' ? 'red' : 'green');
      last.current = rlgl.light;
      pill.current.textContent = rlgl.light === 'RED' ? vi.lightRed : vi.lightGreen;
      pill.current.className = `light-pill ${rlgl.light === 'RED' ? 'is-red' : 'is-green'}`;
    }
    bar.current.style.transform = `scaleX(${rlgl.songProgress})`;
  });
  return (
    <div className="game-hud">
      <div ref={pill} className="light-pill is-green">{vi.lightGreen}</div>
      <div className="meter" aria-label={vi.song}>
        <div ref={bar} className="meter-fill" />
      </div>
    </div>
  );
}
