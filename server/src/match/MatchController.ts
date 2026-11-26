import { MINIGAMES, type ElementId, type GameAction, type MinigameId, type MoveBatch, type Phase, type StepFn } from '@sp/shared';
import { RoundResultEntry, type MatchState, type PlayerState } from '@sp/shared/schema';
import type { PlayerSim } from '../players/PlayerSim.ts';
import { syncPlayerFromSim } from '../players/sync.ts';
import type { NPCManager } from '../npc/NPCManager.ts';
import type { NpcStrategy } from '../npc/NPCBot.ts';
import type { GamePlayer, ServerMinigame } from '../minigames/framework/types.ts';
import { MINIGAME_FACTORIES, availableMinigames } from '../minigames/framework/registry.ts';
import { pickNextGame, planRoundCount } from './RoundScheduler.ts';
import { decideEliminations } from './EliminationPolicy.ts';
import { assertTransition } from './MatchStateMachine.ts';
import { ElementSystem, type CastResult } from '../elements/ElementSystem.ts';

export const PHASE_SECONDS = {
  ROUND_INTRO: 5,
  ROUND_COUNTDOWN: 3,
  ROUND_RESULT: 6,
  MATCH_END: 10,
} as const;

export interface MatchDeps {
  state: MatchState;
  sims: ReadonlyMap<string, PlayerSim>;
  npcs: NPCManager;
  rng: () => number;
  rttOf(id: string): number;
  /** Called when MATCH_END finishes; the room resets to the lobby. */
  onMatchOver(): void;
  /** Multiplier for non-gameplay phase durations (1 in production). */
  phaseScale?: number;
}

/**
 * Drives a match: ROUND_INTRO → ROUND_COUNTDOWN → ROUND_PLAYING → ROUND_RESULT → … → MATCH_END.
 * Time advances only through `update(dt)` (fixed step), so the whole match can be simulated headless.
 */
export class MatchController {
  private readonly d: MatchDeps;
  private game: ServerMinigame | null = null;
  private strategy: NpcStrategy | null = null;
  private participants: GamePlayer[] = [];
  private history: MinigameId[] = [];
  private readonly available: MinigameId[];
  private readonly steps = new Map<string, StepFn>();
  readonly elements: ElementSystem;

  constructor(deps: MatchDeps, available: MinigameId[] = availableMinigames()) {
    this.d = deps;
    this.available = available;
    this.elements = new ElementSystem(deps.state, deps.rng);
  }

  get phase(): Phase {
    return this.d.state.phase as Phase;
  }

  get playedGames(): readonly MinigameId[] {
    return this.history;
  }

  begin(): void {
    const s = this.d.state;
    s.totalRounds = planRoundCount(this.d.rng);
    s.roundIndex = 0;
    s.winnerId = '';
    s.results.clear();
    this.history = [];
    for (const p of s.players.values()) {
      p.alive = true;
      p.roundState = 'ACTIVE';
    }
    this.nextRound();
  }

  update(dt: number): void {
    const s = this.d.state;
    switch (this.phase) {
      case 'ROUND_INTRO':
        if (this.countdown(dt)) this.setPhase('ROUND_COUNTDOWN', this.scaled(PHASE_SECONDS.ROUND_COUNTDOWN));
        break;
      case 'ROUND_COUNTDOWN':
        if (this.countdown(dt)) this.startPlaying();
        break;
      case 'ROUND_PLAYING':
        this.tickPlaying(dt);
        break;
      case 'ROUND_RESULT':
        if (this.countdown(dt)) {
          const alive = this.alivePlayers().length;
          if (alive <= 1 || s.roundIndex >= s.totalRounds) this.setPhase('MATCH_END', this.scaled(PHASE_SECONDS.MATCH_END));
          else this.nextRound();
        }
        break;
      case 'MATCH_END':
        if (this.countdown(dt)) this.d.onMatchOver();
        break;
      case 'LOBBY':
        break;
    }
  }

  handleMove(id: string, batch: MoveBatch): void {
    if (this.phase !== 'ROUND_PLAYING' || !this.game?.step) return;
    const p = this.participant(id);
    if (!p || !p.state.alive || p.state.roundState !== 'ACTIVE') return;
    p.sim.enqueue(batch);
  }

  handleAction(id: string, action: GameAction): void {
    if (this.phase !== 'ROUND_PLAYING' || !this.game) return;
    const p = this.participant(id);
    if (!p || !p.state.alive || p.state.roundState !== 'ACTIVE') return;
    if (this.d.state.gameTime < p.state.stunUntil) return; // struck by lightning: actions are locked
    this.game.handlePlayerInput(id, action, this.d.state.gameTime);
  }

  pickElement(id: string, element: ElementId): boolean {
    return this.elements.pick(id, element);
  }

  castElement(id: string, x: number, z: number): CastResult {
    return this.elements.cast(id, x, z, this.d.state.gameTime);
  }

  /** A human left for good during the match: they forfeit (eliminated). */
  playerLeft(id: string): void {
    const p = this.d.state.players.get(id);
    if (!p) return;
    p.connected = false;
    if (p.alive) {
      p.alive = false;
      if (p.roundState === 'ACTIVE') p.roundState = 'OUT';
    }
  }

  /** Stop the match immediately (e.g. the room returns to the lobby). */
  abort(): void {
    this.elements.clear();
    this.steps.clear();
    this.game?.dispose();
    this.game = null;
    this.strategy = null;
    this.participants = [];
  }

  private nextRound(): void {
    const s = this.d.state;
    s.roundIndex += 1;
    const alive = this.alivePlayers();
    const id = pickNextGame(this.d.rng, alive.length, this.history, this.available);
    this.history.push(id);
    s.currentGame = id;
    s.gameTime = 0;
    s.results.clear();

    const factory = MINIGAME_FACTORIES[id];
    if (!factory) throw new Error(`Minigame ${id} is not registered`);
    const bundle = factory(s);
    this.game = bundle.game;
    this.strategy = bundle.strategy;
    this.participants = alive
      .sort((a, b) => a.slot - b.slot)
      .map((state) => ({ id: state.id, state, sim: this.d.sims.get(state.id)! }));
    for (const p of this.participants) {
      p.state.roundState = 'ACTIVE';
      p.state.team = -1;
      p.state.score = 0;
    }
    this.game.initialize({
      match: s,
      players: this.participants,
      rng: this.d.rng,
      rttOf: (pid) => this.d.rttOf(pid),
    });
    if (this.game.step) for (const p of this.participants) syncPlayerFromSim(p.state, p.sim);
    this.elements.beginRound(this.participants, this.game);
    this.steps.clear();
    const base = this.game.step;
    if (base) for (const p of this.participants) this.steps.set(p.id, this.elements.wrapStep(base, p));
    this.d.npcs.resetRound();
    this.setPhase('ROUND_INTRO', this.scaled(PHASE_SECONDS.ROUND_INTRO));
  }

  private startPlaying(): void {
    if (!this.game) return;
    this.d.state.gameTime = 0;
    this.game.start();
    this.setPhase('ROUND_PLAYING', MINIGAMES[this.game.id].timeLimit);
  }

  private tickPlaying(dt: number): void {
    const game = this.game;
    if (!game) return;
    const s = this.d.state;
    s.gameTime += dt;
    s.timer = Math.max(0, s.timer - dt);

    this.d.npcs.update(this.strategy, game.step !== null, dt, s.gameTime, (id, action) => this.handleAction(id, action));
    if (this.elements.enabled) {
      this.d.npcs.updateElements(dt, s.gameTime, {
        movement: game.step !== null,
        others: (botId) => this.participants.filter((p) => p.id !== botId && p.state.alive && p.state.roundState === 'ACTIVE'),
        cast: (botId, x, z) => void this.castElement(botId, x, z),
      });
    }
    if (game.step) {
      for (const p of this.participants) {
        if (p.state.alive && p.state.roundState === 'ACTIVE') p.sim.tick(this.steps.get(p.id) ?? game.step, s.gameTime);
      }
    }
    this.elements.update(dt, s.gameTime);
    game.update(dt, s.gameTime);
    if (game.step) for (const p of this.participants) syncPlayerFromSim(p.state, p.sim);

    const stillIn = this.participants.filter((p) => p.state.alive).length;
    if (game.isFinished() || s.timer <= 0 || stillIn <= 1) this.endRound();
  }

  private endRound(): void {
    const game = this.game;
    if (!game) return;
    const s = this.d.state;
    const outcome = game.finish();
    this.elements.clear();
    this.steps.clear();
    game.dispose();
    this.game = null;
    this.strategy = null;

    const aliveIds = this.participants.filter((p) => p.state.alive).map((p) => p.id);
    const eliminated = new Set(
      decideEliminations({
        alive: aliveIds,
        ranking: outcome.ranking,
        passed: outcome.passed,
        roundsLeftAfter: s.totalRounds - s.roundIndex,
      }),
    );

    s.results.clear();
    outcome.ranking.forEach((id, index) => {
      const p = s.players.get(id);
      if (!p) return;
      const forfeited = !aliveIds.includes(id);
      if (eliminated.has(id)) p.alive = false;
      const entry = new RoundResultEntry();
      entry.id = id;
      entry.nickname = p.nickname;
      entry.rank = index + 1;
      entry.passed = !eliminated.has(id) && !forfeited;
      entry.eliminated = eliminated.has(id) || forfeited;
      const spared = !outcome.passed.has(id) && !eliminated.has(id) && !forfeited;
      entry.detail = forfeited ? 'Rời trận' : `${outcome.details.get(id) ?? ''}${spared ? ' · được giữ lại nhờ xếp hạng' : ''}`;
      s.results.push(entry);
    });

    const survivors = this.alivePlayers();
    if (survivors.length === 1) s.winnerId = survivors[0]!.id;
    this.participants = [];
    this.setPhase('ROUND_RESULT', this.scaled(PHASE_SECONDS.ROUND_RESULT));
  }

  private alivePlayers(): PlayerState[] {
    return [...this.d.state.players.values()].filter((p) => p.alive);
  }

  private participant(id: string): GamePlayer | undefined {
    return this.participants.find((p) => p.id === id);
  }

  private scaled(seconds: number): number {
    return seconds * (this.d.phaseScale ?? 1);
  }

  /** Advance the phase timer; returns true when it runs out. */
  private countdown(dt: number): boolean {
    const s = this.d.state;
    s.timer = Math.max(0, s.timer - dt);
    return s.timer <= 0;
  }

  private setPhase(phase: Phase, seconds: number): void {
    assertTransition(this.phase, phase);
    this.d.state.phase = phase;
    this.d.state.timer = seconds;
  }
}
