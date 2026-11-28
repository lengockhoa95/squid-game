import { SIM_DT, type CharacterState, type MoveIntent, type StepFn } from '@sp/shared';

const CAPACITY = 180; // 3 seconds of unacknowledged inputs at 60Hz

/** Kinematic fields the server sends for the local player. */
export interface ServerKinematics {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  grounded: boolean;
  airJumps?: number;
}

/**
 * Client-side prediction: remembers inputs the server has not acknowledged yet.
 * On each server update the local state is reset to the authoritative state and the
 * pending inputs are replayed with the same shared stepper the server uses.
 */
export class LocalPredictor {
  private readonly seq = new Float64Array(CAPACITY);
  private readonly dx = new Float64Array(CAPACITY);
  private readonly dz = new Float64Array(CAPACITY);
  private readonly jump = new Uint8Array(CAPACITY);
  private readonly time = new Float64Array(CAPACITY);
  private head = 0;
  private count = 0;
  private nextSeq = 1;
  private readonly replayIntent: MoveIntent = { dirX: 0, dirZ: 0, jump: false };

  get pendingCount(): number {
    return this.count;
  }

  setNextSeq(seq: number): void {
    this.nextSeq = seq;
  }

  /** Store an input that was just applied locally at game time `t`; returns its sequence number. */
  record(intent: Readonly<MoveIntent>, t = 0): number {
    const s = this.nextSeq++;
    const idx = (this.head + this.count) % CAPACITY;
    if (this.count === CAPACITY) this.head = (this.head + 1) % CAPACITY;
    else this.count++;
    this.seq[idx] = s;
    this.dx[idx] = intent.dirX;
    this.dz[idx] = intent.dirZ;
    this.jump[idx] = intent.jump ? 1 : 0;
    this.time[idx] = t;
    return s;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }

  reconcile(state: CharacterState, server: Readonly<ServerKinematics>, ackSeq: number, step: StepFn): void {
    while (this.count > 0 && this.seq[this.head]! <= ackSeq) {
      this.head = (this.head + 1) % CAPACITY;
      this.count--;
    }
    state.x = server.x;
    state.y = server.y;
    state.z = server.z;
    state.vx = server.vx;
    state.vy = server.vy;
    state.vz = server.vz;
    state.yaw = server.yaw;
    state.grounded = server.grounded;
    state.airJumps = server.airJumps ?? 0;
    for (let k = 0; k < this.count; k++) {
      const idx = (this.head + k) % CAPACITY;
      this.replayIntent.dirX = this.dx[idx]!;
      this.replayIntent.dirZ = this.dz[idx]!;
      this.replayIntent.jump = this.jump[idx] === 1;
      step(state, this.replayIntent, SIM_DT, this.time[idx]!);
    }
  }
}
