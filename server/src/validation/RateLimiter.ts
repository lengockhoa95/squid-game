export interface Limit {
  perSecond: number;
  burst: number;
}

export type RateDecision = 'ok' | 'drop' | 'kick';

interface Bucket {
  tokens: number;
  last: number;
}

/**
 * Token-bucket limiter per client × message type.
 * Over-limit messages are dropped; a client that keeps exceeding limits is flagged for a kick.
 */
export class RateLimiter {
  private readonly limits: Readonly<Record<string, Limit>>;
  private readonly kickAfter: number;
  private readonly buckets = new Map<string, Map<string, Bucket>>();
  private readonly violations = new Map<string, number>();

  constructor(limits: Readonly<Record<string, Limit>>, kickAfterViolations: number) {
    this.limits = limits;
    this.kickAfter = kickAfterViolations;
  }

  check(clientId: string, type: string, nowMs: number): RateDecision {
    const limit = this.limits[type];
    if (!limit) return 'drop';
    let perClient = this.buckets.get(clientId);
    if (!perClient) {
      perClient = new Map();
      this.buckets.set(clientId, perClient);
    }
    let b = perClient.get(type);
    if (!b) {
      b = { tokens: limit.burst, last: nowMs };
      perClient.set(type, b);
    }
    b.tokens = Math.min(limit.burst, b.tokens + ((nowMs - b.last) / 1000) * limit.perSecond);
    b.last = nowMs;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return 'ok';
    }
    const v = (this.violations.get(clientId) ?? 0) + 1;
    this.violations.set(clientId, v);
    return v >= this.kickAfter ? 'kick' : 'drop';
  }

  forget(clientId: string): void {
    this.buckets.delete(clientId);
    this.violations.delete(clientId);
  }
}
