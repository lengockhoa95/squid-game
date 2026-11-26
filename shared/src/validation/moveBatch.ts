import { MAX_INPUTS_PER_MESSAGE } from '../protocol/constants.ts';
import type { MoveBatch } from '../protocol/messages.ts';

/** Validates an untrusted MOVE payload. Returns a sanitized copy (directions clamped to length 1) or null. */
export function parseMoveBatch(raw: unknown): MoveBatch | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { s, i } = raw as { s?: unknown; i?: unknown };
  if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > 0xffffffff) return null;
  if (!Array.isArray(i) || i.length === 0 || i.length % 3 !== 0 || i.length > MAX_INPUTS_PER_MESSAGE * 3) return null;

  const out: number[] = new Array(i.length);
  for (let k = 0; k < i.length; k += 3) {
    let dx = i[k];
    let dz = i[k + 1];
    const jump = i[k + 2];
    if (typeof dx !== 'number' || typeof dz !== 'number' || !Number.isFinite(dx) || !Number.isFinite(dz)) return null;
    if (jump !== 0 && jump !== 1) return null;
    const len = Math.hypot(dx, dz);
    if (len > 1) {
      dx /= len;
      dz /= len;
    }
    out[k] = dx;
    out[k + 1] = dz;
    out[k + 2] = jump;
  }
  return { s, i: out };
}
