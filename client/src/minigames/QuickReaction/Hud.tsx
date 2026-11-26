import { useRef } from 'react';
import { REACTION, vi } from '@sp/shared';
import type { MatchNetAdapter } from '../../network/types.ts';
import { useAnimationFrame } from '../../ui/match/useAnimationFrame.ts';
import { audio } from '../../audio/AudioManager.ts';

const STAGE_TEXT: Record<string, string> = { WAIT: vi.reactionWait, GO: vi.reactionGo, BREAK: vi.reactionBreak, DONE: '' };

export function ReactionHud({ net }: { net: MatchNetAdapter }) {
  const big = useRef<HTMLDivElement>(null);
  const info = useRef<HTMLDivElement>(null);
  const lastStage = useRef('');
  useAnimationFrame(() => {
    const state = net.getState();
    const r = state?.reaction;
    if (!state || !r || !big.current || !info.current) return;
    if (r.stage !== lastStage.current) {
      if (r.stage === 'GO') audio.play('go');
      lastStage.current = r.stage;
      big.current.textContent = STAGE_TEXT[r.stage] ?? '';
      big.current.className = `reaction-big stage-${r.stage.toLowerCase()}`;
    }
    const me = state.players.get(net.localId);
    const text = `${vi.reactionAttempt} ${Math.min(r.attempt, REACTION.attempts)}/${REACTION.attempts} · ${vi.reactionTotal}: ${Math.round(me?.score ?? 0)}ms`;
    if (info.current.textContent !== text) info.current.textContent = text;
  });
  return (
    <div className="game-hud game-hud-center">
      <div ref={big} className="reaction-big stage-wait">{vi.reactionWait}</div>
      <div ref={info} className="hud-chip" />
    </div>
  );
}
