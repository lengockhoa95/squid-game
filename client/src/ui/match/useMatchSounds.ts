import { useEffect } from 'react';
import { audio } from '../../audio/AudioManager.ts';
import { sessionStore } from '../../network/sessionStore.ts';

/** Phase-driven sound cues: countdown ticks, GO, pass/out at round end, fanfare for the winner. */
export function useMatchSounds(): void {
  useEffect(() => {
    let prev = sessionStore.get();
    return sessionStore.subscribe(() => {
      const s = sessionStore.get();
      if (s.phase === 'ROUND_COUNTDOWN' && s.timerSeconds !== prev.timerSeconds && s.timerSeconds > 0) audio.play('tick');
      if (s.phase !== prev.phase) {
        if (s.phase === 'ROUND_PLAYING') audio.play('go');
        if (s.phase === 'ROUND_RESULT') {
          const mine = s.results.find((r) => r.id === s.myId);
          if (mine) audio.play(mine.eliminated ? 'out' : 'pass');
        }
        if (s.phase === 'MATCH_END' && s.winnerId === s.myId) audio.play('win');
      }
      prev = s;
    });
  }, []);
}
