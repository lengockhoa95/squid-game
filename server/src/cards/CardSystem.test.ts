import { describe, expect, it } from 'vitest';
import { BRIDGE, RLGL, SIM_DT, bridgeRowZ, createRng, parseCards, type MinigameId } from '@sp/shared';
import { MatchState } from '@sp/shared/schema';
import { PlayerSim } from '../players/PlayerSim.ts';
import { addPlayer } from '../players/factory.ts';
import { NPCManager } from '../npc/NPCManager.ts';
import { MatchController } from '../match/MatchController.ts';
import { makeContext, run } from '../minigames/__tests__/helpers.ts';
import { RedLightGreenLight } from '../minigames/RedLightGreenLight/Logic.ts';
import { GlassBridge } from '../minigames/GlassBridge/Logic.ts';
import { ObstacleRace } from '../minigames/ObstacleRace/Logic.ts';
import { ElementSystem } from '../elements/ElementSystem.ts';
import { CardSystem } from './CardSystem.ts';

function lobby(n: number, games: MinigameId[] = ['RLGL'], bots = false) {
  const state = new MatchState();
  state.phase = 'LOBBY';
  const sims = new Map<string, PlayerSim>();
  for (let i = 0; i < n; i++) addPlayer(state, sims, { id: `h${i}`, nickname: `H${i}`, slot: i, joinOrder: i, isBot: bots });
  const sent: Array<[string, string, unknown]> = [];
  const c = new MatchController(
    { state, sims, npcs: new NPCManager(1), rng: createRng(11), rttOf: () => 0, onMatchOver: () => {}, phaseScale: 0.01, sendTo: (id, t, m) => sent.push([id, t, m]) },
    games,
  );
  return { state, sims, c, sent };
}

function until(c: MatchController, state: MatchState, phase: string, max = 60 * 400) {
  for (let i = 0; i < max && state.phase !== phase; i++) c.update(SIM_DT);
}

describe('CardSystem draft', () => {
  it('gives a free card at match start, offers 3 (4 for last place) after a round, levels up on pick', () => {
    const { state, c } = lobby(3);
    state.noElimination = true;
    c.begin();
    for (const p of state.players.values()) expect(Object.keys(parseCards(p.cards))).toHaveLength(1);
    until(c, state, 'ROUND_RESULT');
    const lastId = state.results[state.results.length - 1]!.id;
    for (const p of state.players.values()) {
      expect(p.cardOffer.split(',')).toHaveLength(p.id === lastId ? 4 : 3);
    }
    expect(state.timer).toBeGreaterThan(0.06); // longer draft result screen (10s scaled)
    const me = state.players.get('h0')!;
    const owned = Object.keys(parseCards(me.cards))[0]!;
    const offer = me.cardOffer.split(',');
    const choice = offer.includes(owned) ? owned : offer[0]!;
    const before = parseCards(me.cards)[choice as 'BUNNY'] ?? 0;
    expect(c.pickCard('h0', 'NOT_OFFERED' as never)).toBe(false);
    expect(c.pickCard('h0', choice as never)).toBe(true);
    expect(parseCards(me.cards)[choice as 'BUNNY']).toBe(before + 1);
    expect(me.cardOffer).toBe('');
    expect(c.pickCard('h0', choice as never)).toBe(false); // only one pick
    // Unpicked offers resolve randomly when the next round starts.
    const other = state.players.get('h1')!;
    const count = Object.values(parseCards(other.cards)).reduce((a, b) => a + (b ?? 0), 0);
    until(c, state, 'ROUND_INTRO');
    expect(other.cardOffer).toBe('');
    expect(Object.values(parseCards(other.cards)).reduce((a, b) => a + (b ?? 0), 0)).toBe(count + 1);
  });

  it('no cards when the mode is off', () => {
    const { state, c } = lobby(2);
    state.cardsEnabled = false;
    c.begin();
    for (const p of state.players.values()) expect(p.cards).toBe('');
  });
});

describe('player collision in movement games', () => {
  it('players running into each other do not overlap, and the bumped one is pushed', () => {
    const { state, sims, c } = lobby(2);
    state.cardsEnabled = false;
    state.elementsEnabled = false;
    c.begin();
    until(c, state, 'ROUND_PLAYING');
    const a = sims.get('h0')!;
    const b = sims.get('h1')!;
    a.reset(0, 20, Math.PI);
    b.reset(0, 18, Math.PI);
    for (let k = 0; k < 40; k++) {
      a.enqueue({ s: a.nextSeq, i: [0, -1, 0, 0, -1, 0, 0, -1, 0] });
      for (let j = 0; j < 3; j++) c.update(SIM_DT);
      expect(Math.hypot(a.state.x - b.state.x, a.state.z - b.state.z)).toBeGreaterThan(0.6);
    }
    expect(b.state.z).toBeLessThan(17); // pushed forward
  });
});

describe('card hooks', () => {
  it('Mạng Phụ saves an RLGL player caught on red (once per light, while lives last)', () => {
    const { ctx, players, match } = makeContext(1);
    const cards = new CardSystem(match, ctx.rng);
    const p = players[0]!;
    p.state.cards = 'LIFE:1';
    cards.beginRound([p.state]);
    expect(p.state.lives).toBe(1);
    const game = new RedLightGreenLight();
    game.initialize({ ...ctx, tryRescue: (id) => cards.tryRescue(match.players.get(id), 0) });
    (game as unknown as { setLight(l: string): void }).setLight('RED');
    p.sim.state.vz = -5; // moving on red
    (game as unknown as { lightElapsed: number }).lightElapsed = 1;
    game.update(0.01, 1);
    expect(p.state.roundState).toBe('ACTIVE');
    expect(p.state.lives).toBe(0);
    (game as unknown as { setLight(l: string): void }).setLight('GREEN');
    (game as unknown as { setLight(l: string): void }).setLight('RED');
    (game as unknown as { lightElapsed: number }).lightElapsed = 1;
    p.sim.state.vz = -5;
    game.update(0.01, 2);
    expect(p.state.roundState).toBe('OUT');
    expect(p.sim.state.z).toBeGreaterThan(RLGL.finishZ);
  });

  it('Mạng Phụ on the bridge: the glass breaks but you stay; Mắt Thần reveals breaking tiles', () => {
    const { ctx, players, match } = makeContext(2);
    const cards = new CardSystem(match, ctx.rng);
    players[0]!.state.cards = 'LIFE:1';
    cards.beginRound(players.map((p) => p.state));
    const game = new GlassBridge();
    game.initialize({ ...ctx, tryRescue: (id) => cards.tryRescue(match.players.get(id), 0) });
    const hints = game.revealFor('p0', 3);
    expect(hints).toHaveLength(3);
    const broken = hints[0]![1] as 0 | 1 | 2;
    expect(game.hintFor('p0', 0)).toBe(broken);
    expect(game.hintFor('p1', 0)).toBeNull();
    run(game, players, 0, 0.2); // standing on the start platform (remembered as safe footing)
    players[0]!.sim.reset(BRIDGE.tileX[broken], bridgeRowZ(0), Math.PI); // lands on the breaking tile
    run(game, players, 0.2, 2);
    expect(players[0]!.state.roundState).toBe('ACTIVE'); // saved by the extra life
    expect(players[0]!.sim.state.z).toBeGreaterThan(BRIDGE.startZ - 2); // back on the platform
    expect(players[0]!.state.lives).toBe(0);
    expect(match.bridge!.tiles[broken]).toBe(1); // TILE_BROKEN, revealed to all
  });

  it('Mạng Phụ in the race: respawn where you last stood instead of the checkpoint', () => {
    const { ctx, players, match } = makeContext(1);
    const cards = new CardSystem(match, ctx.rng);
    const p = players[0]!;
    p.state.cards = 'LIFE:1';
    cards.beginRound([p.state]);
    const game = new ObstacleRace();
    game.initialize({ ...ctx, tryRescue: (id) => cards.tryRescue(match.players.get(id), 0) });
    p.sim.reset(0, 14, Math.PI); // just before the first gap (floor ends at 13.6)
    run(game, players, 0, 0.1);
    p.sim.state.y = -10; // fell
    run(game, players, 0.1, 1 / 60);
    expect(p.sim.state.z).toBeCloseTo(14, 0);
    expect(p.state.lives).toBe(0);
  });

  it('Phản Xạ shortens stuns, and at level 3 bounces lightning back', () => {
    const { ctx, players, match } = makeContext(2);
    const cards = new CardSystem(match, ctx.rng);
    const game = new RedLightGreenLight();
    game.initialize(ctx);
    const sys = new ElementSystem(match, ctx.rng, (p) => cards.mods(p));
    sys.beginRound(players, game);
    match.phase = 'ROUND_PLAYING';
    const [a, b] = players as [typeof players[0], typeof players[0]];
    a.state.element = 'THUNDER';
    a.state.elementReadyAt = 0;
    b.sim.state.x = a.sim.state.x + 2;
    b.sim.state.z = a.sim.state.z;
    b.state.cards = 'REFLECT:1';
    sys.cast(a.id, b.sim.state.x, b.sim.state.z, 1);
    expect(b.state.stunUntil).toBeCloseTo(1 + 0.6, 5);
    b.state.cards = 'REFLECT:3';
    b.state.stunUntil = 0;
    a.state.elementReadyAt = 0;
    sys.cast(a.id, b.sim.state.x, b.sim.state.z, 10);
    expect(b.state.stunUntil).toBe(0);
    expect(a.state.stunUntil).toBeGreaterThan(10);
  });

  it('Mắt Thần hints are sent privately to humans when the bridge round starts', () => {
    const { state, c, sent } = lobby(2, ['GLASS_BRIDGE']);
    c.begin();
    state.players.get('h0')!.cards = 'EYE:2';
    until(c, state, 'ROUND_PLAYING');
    const hint = sent.find(([id]) => id === 'h0');
    expect(hint?.[1]).toBe('bridgeHint');
    expect((hint?.[2] as { rows: unknown[] }).rows).toHaveLength(3);
    expect(sent.some(([id]) => id === 'h1' && state.players.get('h1')!.cards.indexOf('EYE') < 0)).toBe(false);
  });
});
