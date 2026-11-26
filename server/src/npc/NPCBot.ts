import {
  NPC_PROFILES, intentTowardTarget,
  type Difficulty, type DifficultyProfile, type GameAction, type MoveIntent, type Personality,
} from '@sp/shared';
import type { PlayerState } from '@sp/shared/schema';
import type { PlayerSim } from '../players/PlayerSim.ts';

/** How a bot touches the game: exactly the same entry points a human client uses. */
export interface BotIO {
  /** Queue one movement input (one simulation step) for this bot. */
  move(intent: Readonly<MoveIntent>): void;
  /** Send a discrete game action. */
  act(action: GameAction): void;
}

/**
 * Server-controlled player. Holds difficulty, personality, its own RNG and a scratch memory
 * that minigame strategies reset each round. Bots have no WebSocket: they feed inputs into the
 * same validation + simulation path as humans.
 */
export class NPCBot {
  readonly id: string;
  readonly difficulty: Difficulty;
  readonly profile: DifficultyProfile;
  readonly personality: Personality;
  readonly rng: () => number;
  readonly state: PlayerState;
  readonly sim: PlayerSim;
  /** Per-round scratch space for strategies. */
  memory: Record<string, number | boolean | string> = {};
  /** Current movement intent, re-sent every tick (decisions update less often). */
  readonly intent: MoveIntent = { dirX: 0, dirZ: 0, jump: false };
  private thinkTimer = 0;

  constructor(id: string, difficulty: Difficulty, personality: Personality, rng: () => number, state: PlayerState, sim: PlayerSim) {
    this.id = id;
    this.difficulty = difficulty;
    this.profile = NPC_PROFILES[difficulty];
    this.personality = personality;
    this.rng = rng;
    this.state = state;
    this.sim = sim;
  }

  resetRound(): void {
    this.memory = {};
    this.intent.dirX = 0;
    this.intent.dirZ = 0;
    this.intent.jump = false;
    this.thinkTimer = this.rng() * 0.1; // desync bots so they do not decide in lockstep
  }

  /** True roughly `hz` times per second; strategies use it to throttle decisions. */
  shouldThink(dt: number, hz = 10): boolean {
    this.thinkTimer -= dt;
    if (this.thinkTimer > 0) return false;
    this.thinkTimer += 1 / hz;
    return true;
  }

  /** Sample a reaction delay in seconds from the difficulty profile. */
  reactionDelay(scale = 1): number {
    const { reactionMinMs, reactionMaxMs } = this.profile;
    return ((reactionMinMs + this.rng() * (reactionMaxMs - reactionMinMs)) * scale) / 1000;
  }

  chance(p: number): boolean {
    return this.rng() < p;
  }

  /** Point the movement intent toward a world target, scaled by the bot's speed factor. */
  steerTo(x: number, z: number): boolean {
    const arrived = intentTowardTarget(this.sim.state, x, z, this.intent);
    this.intent.dirX *= this.profile.speedFactor;
    this.intent.dirZ *= this.profile.speedFactor;
    return arrived;
  }

  stopMoving(): void {
    this.intent.dirX = 0;
    this.intent.dirZ = 0;
  }

  /** Random offset in [-aimNoise, aimNoise]. */
  noise(scale = 1): number {
    return (this.rng() * 2 - 1) * this.profile.aimNoise * scale;
  }
}

/** Per-minigame bot behaviour. Strategies only read public state (what a human could see). */
export interface NpcStrategy {
  /** Called every simulation tick for each active bot. */
  update(bot: NPCBot, io: BotIO, dt: number, gameTime: number): void;
}
