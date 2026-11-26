/**
 * Server-driven RTT measurement. The server sends a timestamp; only an echo of that exact
 * value is accepted, so clients cannot fake a lower latency to gain extra grace time.
 */
export class LatencyTracker {
  private readonly pending = new Map<string, number>();
  private readonly rtt = new Map<string, number>();
  private readonly maxRttMs: number;

  constructor(maxRttMs = 1000) {
    this.maxRttMs = maxRttMs;
  }

  /** Returns the token to send in a PING message. */
  issue(clientId: string, nowMs: number): number {
    this.pending.set(clientId, nowMs);
    return nowMs;
  }

  /** Handle a PONG; ignores anything that is not the outstanding token. */
  receive(clientId: string, echoed: unknown, nowMs: number): void {
    const sent = this.pending.get(clientId);
    if (sent === undefined || echoed !== sent) return;
    this.pending.delete(clientId);
    const sample = Math.min(this.maxRttMs, Math.max(0, nowMs - sent));
    const prev = this.rtt.get(clientId);
    this.rtt.set(clientId, prev === undefined ? sample : prev * 0.7 + sample * 0.3);
  }

  rttOf(clientId: string): number {
    return this.rtt.get(clientId) ?? 0;
  }

  forget(clientId: string): void {
    this.pending.delete(clientId);
    this.rtt.delete(clientId);
  }
}
