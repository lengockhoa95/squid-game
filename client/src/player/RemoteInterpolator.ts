export interface InterpSample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  grounded: boolean;
}

export function createSample(): InterpSample {
  return { x: 0, y: 0, z: 0, yaw: 0, speed: 0, grounded: true };
}

const CAPACITY = 16;

/**
 * Snapshot buffer for a remote character. The renderer samples it slightly in the past
 * (render delay) and linearly interpolates, so 20Hz server patches look smooth at 60fps.
 * Fixed-size ring buffer: no allocation after construction.
 */
export class RemoteInterpolator {
  private readonly t = new Float64Array(CAPACITY);
  private readonly x = new Float64Array(CAPACITY);
  private readonly y = new Float64Array(CAPACITY);
  private readonly z = new Float64Array(CAPACITY);
  private readonly yaw = new Float64Array(CAPACITY);
  private readonly speed = new Float64Array(CAPACITY);
  private readonly grounded = new Uint8Array(CAPACITY);
  private head = 0; // index of oldest
  private count = 0;

  push(time: number, x: number, y: number, z: number, yaw: number, speed: number, grounded: boolean): void {
    const idx = (this.head + this.count) % CAPACITY;
    if (this.count === CAPACITY) this.head = (this.head + 1) % CAPACITY;
    else this.count++;
    this.t[idx] = time;
    this.x[idx] = x;
    this.y[idx] = y;
    this.z[idx] = z;
    this.yaw[idx] = yaw;
    this.speed[idx] = speed;
    this.grounded[idx] = grounded ? 1 : 0;
  }

  sample(renderTime: number, out: InterpSample): boolean {
    if (this.count === 0) return false;
    const oldest = this.head;
    const newest = (this.head + this.count - 1) % CAPACITY;
    if (renderTime <= this.t[oldest]!) return this.copy(oldest, out);
    if (renderTime >= this.t[newest]!) return this.copy(newest, out);

    for (let k = 0; k < this.count - 1; k++) {
      const a = (this.head + k) % CAPACITY;
      const b = (a + 1) % CAPACITY;
      const ta = this.t[a]!;
      const tb = this.t[b]!;
      if (renderTime >= ta && renderTime <= tb) {
        const f = tb > ta ? (renderTime - ta) / (tb - ta) : 1;
        out.x = this.x[a]! + (this.x[b]! - this.x[a]!) * f;
        out.y = this.y[a]! + (this.y[b]! - this.y[a]!) * f;
        out.z = this.z[a]! + (this.z[b]! - this.z[a]!) * f;
        const dyaw = Math.atan2(Math.sin(this.yaw[b]! - this.yaw[a]!), Math.cos(this.yaw[b]! - this.yaw[a]!));
        out.yaw = this.yaw[a]! + dyaw * f;
        out.speed = this.speed[a]! + (this.speed[b]! - this.speed[a]!) * f;
        out.grounded = (f < 0.5 ? this.grounded[a] : this.grounded[b]) === 1;
        return true;
      }
    }
    return this.copy(newest, out);
  }

  private copy(i: number, out: InterpSample): boolean {
    out.x = this.x[i]!;
    out.y = this.y[i]!;
    out.z = this.z[i]!;
    out.yaw = this.yaw[i]!;
    out.speed = this.speed[i]!;
    out.grounded = this.grounded[i] === 1;
    return true;
  }
}
