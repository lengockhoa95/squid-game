import type { FpsCap } from '@sp/shared';

/** Decides which display frames get rendered so output stays at or below the FPS cap. */
export class FrameLimiter {
  private intervalMs = 0;
  private last = -1;

  constructor(cap: FpsCap) {
    this.setCap(cap);
  }

  setCap(cap: FpsCap): void {
    this.intervalMs = 1000 / cap;
    this.last = -1;
  }

  shouldRender(nowMs: number): boolean {
    if (this.last < 0) {
      this.last = nowMs;
      return true;
    }
    // 1ms tolerance absorbs timestamp jitter on displays matching the cap.
    if (nowMs - this.last < this.intervalMs - 1) return false;
    this.last += this.intervalMs;
    // After a stall, resync instead of rendering a burst of catch-up frames.
    if (nowMs - this.last > this.intervalMs) this.last = nowMs;
    return true;
  }
}
