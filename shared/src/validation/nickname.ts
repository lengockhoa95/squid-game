import { NICKNAME_MAX } from '../protocol/constants.ts';

// Control characters and characters commonly used for markup/injection.
const FORBIDDEN = /[\u0000-\u001f\u007f<>"'`]/g;

export function sanitizeNickname(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(FORBIDDEN, '').replace(/\s+/g, ' ').trim();
  const limited = Array.from(cleaned).slice(0, NICKNAME_MAX).join('').trim();
  return limited.length > 0 ? limited : fallback;
}
