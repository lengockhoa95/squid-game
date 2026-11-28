import { createCharacterState, SIM_DT, type CharacterState, type MoveBatch, type MoveIntent, type StepFn } from '@sp/shared';

const QUEUE_CAP = 12; // ~200ms of inputs
const MAX_CREDIT = 4; // max steps per tick when catching up after jitter
const STARVE_TICKS = 15; // ~250ms without input → simulate with zero input

/**
 * Server-side simulation of one character.
 * Each client input is one fixed step. A credit budget (1 step per server tick, small burst)
 * means flooding inputs cannot move a character faster than real time.
 */
export class PlayerSim {
  readonly state: CharacterState;
  lastProcessedSeq = 0;
  private lastQueuedSeq = 0;
  private readonly qSeq = new Float64Array(QUEUE_CAP);
  private readonly qDx = new Float64Array(QUEUE_CAP);
  private readonly qDz = new Float64Array(QUEUE_CAP);
  private readonly qJump = new Uint8Array(QUEUE_CAP);
  private head = 0;
  private count = 0;
  private credit = 0;
  private starved = 0;
  private readonly intent: MoveIntent = { dirX: 0, dirZ: 0, jump: false };

  constructor(x: number, z: number, yaw: number) {
    this.state = createCharacterState(x, z);
    this.state.yaw = yaw;
  }

  /** Queue a validated batch. Returns how many inputs were accepted. */
  enqueue(batch: MoveBatch): number {
    let accepted = 0;
    const n = batch.i.length / 3;
    for (let k = 0; k < n; k++) {
      const seq = batch.s + k;
      if (seq <= this.lastQueuedSeq) continue;
      if (this.count >= QUEUE_CAP) break; // client is too far ahead: drop, it will be reconciled
      const idx = (this.head + this.count) % QUEUE_CAP;
      this.qSeq[idx] = seq;
      this.qDx[idx] = batch.i[k * 3]!;
      this.qDz[idx] = batch.i[k * 3 + 1]!;
      this.qJump[idx] = batch.i[k * 3 + 2]!;
      this.count++;
      this.lastQueuedSeq = seq;
      accepted++;
    }
    return accepted;
  }

  /** Called once per server simulation tick (SIM_HZ). `t` is the round game time for moving hazards. */
  tick(step: StepFn, t = 0): void {
    this.credit = Math.min(MAX_CREDIT, this.credit + 1);
    let processed = 0;
    while (this.credit >= 1 && this.count > 0) {
      const idx = this.head;
      this.intent.dirX = this.qDx[idx]!;
      this.intent.dirZ = this.qDz[idx]!;
      this.intent.jump = this.qJump[idx] === 1;
      step(this.state, this.intent, SIM_DT, t);
      this.lastProcessedSeq = this.qSeq[idx]!;
      this.head = (this.head + 1) % QUEUE_CAP;
      this.count--;
      this.credit--;
      processed++;
    }
    if (processed > 0) {
      this.starved = 0;
      return;
    }
    this.starved++;
    if (this.starved > STARVE_TICKS && this.credit >= 1) {
      // No input for a while (lag, hidden tab, or cheating by withholding inputs): keep physics going.
      this.intent.dirX = 0;
      this.intent.dirZ = 0;
      this.intent.jump = false;
      step(this.state, this.intent, SIM_DT, t);
      this.credit--;
    }
  }

  /** Next sequence number a server-side driver (NPC) should use. */
  get nextSeq(): number {
    return this.lastQueuedSeq + 1;
  }

  reset(x: number, z: number, yaw: number): void {
    const s = this.state;
    s.x = x;
    s.y = 0;
    s.z = z;
    s.vx = s.vy = s.vz = 0;
    s.yaw = yaw;
    s.grounded = true;
    s.airJumps = 0;
    this.head = 0;
    this.count = 0;
    this.credit = 0;
    this.starved = 0;
    // Queued inputs were discarded: accept any sequence after the last simulated one.
    this.lastQueuedSeq = this.lastProcessedSeq;
  }
}
