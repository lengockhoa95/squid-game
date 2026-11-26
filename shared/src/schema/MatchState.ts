import { schema, t } from '@colyseus/schema';

/** Synced per-player state. Kinematic fields mirror `CharacterState` so clients can reconcile. */
export const PlayerState = schema(
  {
    id: t.string(),
    nickname: t.string(),
    slot: t.uint8(),
    joinOrder: t.uint32(),
    isBot: t.boolean(),
    ready: t.boolean(),
    connected: t.boolean(),
    x: t.float32(),
    y: t.float32(),
    z: t.float32(),
    vx: t.float32(),
    vy: t.float32(),
    vz: t.float32(),
    yaw: t.float32(),
    grounded: t.boolean(),
    /** Sequence number of the last input the server simulated for this player. */
    lastSeq: t.uint32(),
  },
  'PlayerState',
);
export type PlayerState = InstanceType<typeof PlayerState>;

export const MatchState = schema(
  {
    phase: t.string(),
    roomCode: t.string(),
    hostId: t.string(),
    countdown: t.uint8(),
    players: t.map(PlayerState),
  },
  'MatchState',
);
export type MatchState = InstanceType<typeof MatchState>;
