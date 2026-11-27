import type { PlayerState } from '@sp/shared/schema';
import type { PlayerSim } from './PlayerSim.ts';

/** Copy the authoritative simulation state into the synced schema. */
export function syncPlayerFromSim(p: PlayerState, sim: PlayerSim): void {
  const s = sim.state;
  p.x = s.x;
  p.y = s.y;
  p.z = s.z;
  p.vx = s.vx;
  p.vy = s.vy;
  p.vz = s.vz;
  p.yaw = s.yaw;
  p.grounded = s.grounded;
  p.lastSeq = sim.lastProcessedSeq;
  p.airJumped = s.airJumped === true;
}
