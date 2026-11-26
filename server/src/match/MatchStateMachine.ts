import type { Phase } from '@sp/shared';

const TRANSITIONS: Readonly<Record<Phase, readonly Phase[]>> = {
  LOBBY: ['ROUND_INTRO'],
  ROUND_INTRO: ['ROUND_COUNTDOWN', 'LOBBY'],
  ROUND_COUNTDOWN: ['ROUND_PLAYING', 'LOBBY'],
  ROUND_PLAYING: ['ROUND_RESULT', 'LOBBY'],
  ROUND_RESULT: ['ROUND_INTRO', 'MATCH_END', 'LOBBY'],
  MATCH_END: ['LOBBY'],
};

export function canTransition(from: Phase, to: Phase): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: Phase, to: Phase): void {
  if (!canTransition(from, to)) throw new Error(`Illegal phase transition ${from} → ${to}`);
}
