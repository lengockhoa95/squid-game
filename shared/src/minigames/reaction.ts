export const REACTION = {
  attempts: 3,
  waitMinS: 1.5,
  waitMaxS: 4,
  goWindowS: 1.5,
  gapS: 1.2,
  falseStartMs: 2000,
  missMs: 1500,
  /** Reactions faster than this (after latency compensation) are treated as guesses. */
  minHumanMs: 60,
  maxLatencyCompMs: 150,
} as const;

export type ReactionStage = 'WAIT' | 'GO' | 'BREAK' | 'DONE';
