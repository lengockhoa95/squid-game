import { DIFFICULTIES, isDifficulty, type Difficulty } from '../config/npc.ts';
import { MAX_PLAYERS } from '../protocol/constants.ts';
import type { GameAction, NpcConfigMessage } from '../protocol/messages.ts';

/** Validates an untrusted ACTION payload. */
export function parseGameAction(raw: unknown): GameAction | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { kind, side } = raw as { kind?: unknown; side?: unknown };
  if (kind === 'JUMP_TILE') return side === 0 || side === 1 ? { kind, side } : null;
  if (kind === 'PULL' || kind === 'REACT') return { kind };
  return null;
}

/** Validates an untrusted NPC_CONFIG payload (count clamped to 0..MAX_PLAYERS-1, unknown difficulties → NORMAL). */
export function parseNpcConfig(raw: unknown): NpcConfigMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { count, difficulties } = raw as { count?: unknown; difficulties?: unknown };
  if (typeof count !== 'number' || !Number.isInteger(count)) return null;
  const list: Difficulty[] = [];
  const src = Array.isArray(difficulties) ? difficulties : [];
  for (let i = 0; i < MAX_PLAYERS; i++) list.push(isDifficulty(src[i]) ? src[i] : 'NORMAL');
  return { count: Math.max(0, Math.min(MAX_PLAYERS - 1, count)), difficulties: list };
}

export const DEFAULT_NPC_DIFFICULTIES: readonly Difficulty[] = [DIFFICULTIES[1]!, DIFFICULTIES[1]!, DIFFICULTIES[1]!, DIFFICULTIES[1]!];
