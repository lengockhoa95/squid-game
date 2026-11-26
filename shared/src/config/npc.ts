export type Difficulty = 'EASY' | 'NORMAL' | 'HARD' | 'SMART';
export const DIFFICULTIES: readonly Difficulty[] = ['EASY', 'NORMAL', 'HARD', 'SMART'];

export function isDifficulty(v: unknown): v is Difficulty {
  return typeof v === 'string' && (DIFFICULTIES as readonly string[]).includes(v);
}

export interface DifficultyProfile {
  /** Reaction delay range in ms (uniformly sampled per decision). */
  reactionMinMs: number;
  reactionMaxMs: number;
  /** Probability of a mistake at a decision point (wrong side, late stop, bad timing…). */
  errorRate: number;
  /** Random offset (m) added to movement targets. */
  aimNoise: number;
  /** Fraction of max input magnitude used when moving (≤ 1 — bots never exceed human limits). */
  speedFactor: number;
  /** 0..1 willingness to take risks (go early, jump without information). */
  riskTolerance: number;
  /** Reads match state (time left, revealed info, team score) to adapt strategy. */
  situational: boolean;
}

export const NPC_PROFILES: Readonly<Record<Difficulty, DifficultyProfile>> = {
  EASY: { reactionMinMs: 450, reactionMaxMs: 700, errorRate: 0.15, aimNoise: 1.2, speedFactor: 0.8, riskTolerance: 0.6, situational: false },
  NORMAL: { reactionMinMs: 300, reactionMaxMs: 450, errorRate: 0.07, aimNoise: 0.7, speedFactor: 0.92, riskTolerance: 0.45, situational: false },
  HARD: { reactionMinMs: 180, reactionMaxMs: 280, errorRate: 0.03, aimNoise: 0.35, speedFactor: 1, riskTolerance: 0.35, situational: false },
  SMART: { reactionMinMs: 180, reactionMaxMs: 280, errorRate: 0.03, aimNoise: 0.3, speedFactor: 1, riskTolerance: 0.3, situational: true },
};

export type Personality = 'CAUTIOUS' | 'BOLD' | 'FOLLOWER';

/** Bot identities: unique name + personality. Colors come from the lobby slot. */
export const NPC_IDENTITIES: ReadonlyArray<{ name: string; personality: Personality }> = [
  { name: 'Bot Mít', personality: 'BOLD' },
  { name: 'Bot Bơ', personality: 'CAUTIOUS' },
  { name: 'Bot Tôm', personality: 'FOLLOWER' },
  { name: 'Bot Sóc', personality: 'BOLD' },
  { name: 'Bot Na', personality: 'CAUTIOUS' },
  { name: 'Bot Kiwi', personality: 'FOLLOWER' },
];
