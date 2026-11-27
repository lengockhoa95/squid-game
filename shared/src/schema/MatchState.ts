import { schema, t } from '@colyseus/schema';

/** Synced per-player state. Kinematic fields mirror `CharacterState` so clients can reconcile. */
export const PlayerState = schema(
  {
    id: t.string(),
    nickname: t.string(),
    slot: t.uint8(),
    joinOrder: t.uint32(),
    isBot: t.boolean(),
    difficulty: t.string(),
    ready: t.boolean(),
    connected: t.boolean(),
    /** Still in the match (not eliminated). */
    alive: t.boolean().default(true),
    /** Per-round status: ACTIVE, FINISHED (passed the goal) or OUT (failed this round). */
    roundState: t.string().default('ACTIVE'),
    /** Team index for team games, -1 otherwise. */
    team: t.int8().default(-1),
    /** Game-specific number shown in HUD/results (e.g. reaction total ms, bridge row). */
    score: t.float32(),
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
    /** Element mode: chosen element ('' = none) and timed statuses in round game time. */
    element: t.string(),
    elementReadyAt: t.float32(),
    stunUntil: t.float32(),
    hasteUntil: t.float32(),
    blindUntil: t.float32(),
    /** No-elimination mode: match points (rank points summed over rounds). */
    points: t.uint16(),
  },
  'PlayerState',
);
export type PlayerState = InstanceType<typeof PlayerState>;

export const RoundResultEntry = schema(
  {
    id: t.string(),
    nickname: t.string(),
    rank: t.uint8(),
    passed: t.boolean(),
    eliminated: t.boolean(),
    detail: t.string(),
    /** Points gained this round (no-elimination mode). */
    gained: t.uint8(),
  },
  'RoundResultEntry',
);
export type RoundResultEntry = InstanceType<typeof RoundResultEntry>;

/**
 * One element effect in the world. Lasting ones (PILLAR, PUDDLE, CLONE) affect play; the others are
 * short flashes kept briefly so clients can draw them. (x2, z2) is a second point (SWAP/BLINK origin).
 */
export const ElementEffect = schema(
  {
    id: t.uint32(),
    kind: t.string(),
    owner: t.string(),
    slot: t.uint8(),
    x: t.float32(),
    z: t.float32(),
    x2: t.float32(),
    z2: t.float32(),
    y: t.float32(),
    yaw: t.float32(),
    start: t.float32(),
    until: t.float32(),
  },
  'ElementEffect',
);
export type ElementEffect = InstanceType<typeof ElementEffect>;

export const RlglState = schema({ light: t.string(), songProgress: t.float32() }, 'RlglState');
export type RlglState = InstanceType<typeof RlglState>;

/** Tile values: 0 unknown, 1 broken, 2 revealed safe. Index = row * 2 + side. */
export const BridgeState = schema({ rows: t.uint8(), tiles: t.array('uint8') }, 'BridgeState');
export type BridgeState = InstanceType<typeof BridgeState>;

/** Rope position in [-1, 1]: -1 = team 0 wins, +1 = team 1 wins. */
export const TugState = schema({ rope: t.float32() }, 'TugState');
export type TugState = InstanceType<typeof TugState>;

export const ReactionState = schema({ stage: t.string(), attempt: t.uint8() }, 'ReactionState');
export type ReactionState = InstanceType<typeof ReactionState>;

export const MatchState = schema(
  {
    phase: t.string(),
    roomCode: t.string(),
    hostId: t.string(),
    /** Desired NPC count and per-NPC difficulty, set by the host in the lobby. */
    npcCount: t.uint8(),
    npcDifficulties: t.array('string'),
    totalRounds: t.uint8(),
    roundIndex: t.uint8(),
    currentGame: t.string(),
    /** Seconds left in the current phase (intro / countdown / playing / result). */
    timer: t.float32(),
    /** Seconds since the current round started playing (drives moving hazards). */
    gameTime: t.float32(),
    winnerId: t.string(),
    results: t.array(RoundResultEntry),
    players: t.map(PlayerState),
    elementsEnabled: t.boolean().default(true),
    /** When true nobody is eliminated: all rounds are played and the most points wins. */
    noElimination: t.boolean().default(false),
    effects: t.array(ElementEffect),
    rlgl: t.ref(RlglState).optional(),
    bridge: t.ref(BridgeState).optional(),
    tug: t.ref(TugState).optional(),
    reaction: t.ref(ReactionState).optional(),
  },
  'MatchState',
);
export type MatchState = InstanceType<typeof MatchState>;
