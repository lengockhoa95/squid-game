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
    /** Skill cards: owned levels ("BUNNY:2,LIFE:1"), current draft offer ("A,B,C"), lives left this round. */
    cards: t.string(),
    cardOffer: t.string(),
    lives: t.uint8(),
    /** Thủ Thành: weapon in hand ('' = fists). */
    weapon: t.string(),
    /** Thủ Thành: weapon rarity 0–3, weapon skill levels ("POWER:2"), card offer ("A,B,C"), rage 0–1. */
    weaponTier: t.uint8(),
    perks: t.string(),
    perkOffer: t.string(),
    rage: t.float32(),
    /** Game-specific speed multiplier (zombies run faster), 1 = normal. */
    moveMul: t.float32().default(1),
    /** Picked Kenney character id ('' = slot default). */
    character: t.string(),
    /** Mid-air jumps used (mirrors CharacterState.airJumps for reconciliation). */
    airJumps: t.uint8(),
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

/** Sàn Sụp tile states (0 solid, 1 cracking, 2 gone), index = (layer*rows + row)*cols + col. */
export const CollapseState = schema({ tiles: t.array('uint8') }, 'CollapseState');
export type CollapseState = InstanceType<typeof CollapseState>;

/** Mê Cung: maze seed (clients rebuild the same walls) and the minotaur. */
export const MazeState = schema(
  { seed: t.uint32(), mx: t.float32(), mz: t.float32(), myaw: t.float32(), active: t.boolean() },
  'MazeState',
);
export type MazeState = InstanceType<typeof MazeState>;

/** Cửa Thần: revealed door states (0 unknown, 1 fake, 2 real), index = row * perRow + door. */
export const DoorsState = schema({ tiles: t.array('uint8') }, 'DoorsState');
export type DoorsState = InstanceType<typeof DoorsState>;

/** Sơn Lãnh Thổ: owner of each floor cell (0 = nobody, else slot + 1). */
export const PaintState = schema({ cells: t.array('uint8') }, 'PaintState');
export type PaintState = InstanceType<typeof PaintState>;

/** Vượt Biển Cá Mập: shark positions (server-driven). */
export const SharkFin = schema({ x: t.float32(), z: t.float32(), yaw: t.float32(), lunge: t.boolean() }, 'SharkFin');
export type SharkFin = InstanceType<typeof SharkFin>;
export const SeaState = schema({ sharks: t.array(SharkFin) }, 'SeaState');
export type SeaState = InstanceType<typeof SeaState>;

/** Thủ Thành: a monster (server-driven). state: WALK | ATTACK | FLY | LAND | BREATH | DIE. */
export const Monster = schema(
  {
    id: t.uint16(), kind: t.string(), x: t.float32(), y: t.float32(), z: t.float32(), yaw: t.float32(),
    hp: t.float32(), maxHp: t.float32(), state: t.string(), hitAt: t.float32(),
  },
  'Monster',
);
export type Monster = InstanceType<typeof Monster>;
export const WeaponPickup = schema({ id: t.uint16(), weapon: t.string(), tier: t.uint8(), x: t.float32(), z: t.float32() }, 'WeaponPickup');
export type WeaponPickup = InstanceType<typeof WeaponPickup>;
export const CastleState = schema(
  {
    gate: t.float32(),
    gateMax: t.float32(),
    /** Current wave (1-based; 0 = before the first) and total waves. */
    wave: t.uint8(),
    waves: t.uint8(),
    /** Game time the break before the next wave ends (0 while a wave is on). */
    breakUntil: t.float32(),
    monsters: t.array(Monster),
    pickups: t.array(WeaponPickup),
  },
  'CastleState',
);
export type CastleState = InstanceType<typeof CastleState>;

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
    /** Skill card draft between rounds. */
    cardsEnabled: t.boolean().default(true),
    /** Host's picks: minigames / elements taken out of the random pool (empty = everything on). */
    disabledGames: t.array('string'),
    disabledElements: t.array('string'),
    /** Thủ Thành: number of waves (host setting). */
    castleWaves: t.uint8().default(10),
    effects: t.array(ElementEffect),
    rlgl: t.ref(RlglState).optional(),
    bridge: t.ref(BridgeState).optional(),
    collapse: t.ref(CollapseState).optional(),
    maze: t.ref(MazeState).optional(),
    doors: t.ref(DoorsState).optional(),
    paint: t.ref(PaintState).optional(),
    sea: t.ref(SeaState).optional(),
    castle: t.ref(CastleState).optional(),
  },
  'MatchState',
);
export type MatchState = InstanceType<typeof MatchState>;
