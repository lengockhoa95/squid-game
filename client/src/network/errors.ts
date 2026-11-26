import { vi, type ErrorCodeName } from '@sp/shared';

export function serverErrorText(code: ErrorCodeName): string {
  switch (code) {
    case 'NOT_HOST': return vi.errNotHost;
    case 'NOT_ALL_READY': return vi.errNotAllReady;
    case 'BAD_PHASE': return vi.errBadPhase;
  }
}

/** Matchmaking failures (join by code) → friendly text. */
export function joinErrorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/full|locked|đủ người|đã bắt đầu/i.test(message)) return vi.errRoomUnavailable;
  if (/not found|invalid|no room|expired/i.test(message)) return vi.errRoomNotFound;
  if (/fetch|network|ECONNREFUSED|Failed/i.test(message)) return vi.errServerUnreachable;
  return vi.errRoomNotFound;
}
