import { describe, expect, it } from 'vitest';
import { ELEMENTS, ELEMENT_FX, type ElementId } from '@sp/shared';
import { makeContext, run, hold } from '../minigames/__tests__/helpers.ts';
import { RedLightGreenLight } from '../minigames/RedLightGreenLight/Logic.ts';
import { GlassBridge } from '../minigames/GlassBridge/Logic.ts';
import type { GamePlayer, ServerMinigame } from '../minigames/framework/types.ts';
import { ElementSystem } from './ElementSystem.ts';

function setup(game: ServerMinigame, n = 3) {
  const { ctx, players, match } = makeContext(n);
  game.initialize(ctx);
  const sys = new ElementSystem(match, ctx.rng);
  sys.beginRound(players, game);
  match.phase = 'ROUND_PLAYING';
  const give = (p: GamePlayer, e: ElementId) => {
    p.state.element = e;
    p.state.elementReadyAt = 0;
  };
  return { players, match, sys, give };
}

function place(p: GamePlayer, x: number, z: number) {
  p.sim.state.x = x;
  p.sim.state.z = z;
  p.state.x = x;
  p.state.z = z;
}

describe('ElementSystem', () => {
  it('assigns an allowed element to everyone and only lets you pick during the intro', () => {
    const { players, match, sys } = setup(new RedLightGreenLight());
    for (const p of players) expect(p.state.element).not.toBe('');
    expect(sys.pick('p0', 'FIRE')).toBe(false); // already playing
    match.phase = 'ROUND_INTRO';
    expect(sys.pick('p0', 'FIRE')).toBe(true);
    expect(players[0]!.state.element).toBe('FIRE');
  });

  it('non-movement games only offer their element list', () => {
    const { ctx, players, match } = makeContext(2);
    const bridge = new GlassBridge();
    bridge.initialize(ctx);
    const sys = new ElementSystem(match, ctx.rng);
    sys.beginRound(players, bridge);
    match.phase = 'ROUND_INTRO';
    expect(sys.allowedElements()).toEqual(['THUNDER', 'SWAP', 'DARK']);
    expect(sys.pick('p0', 'EARTH')).toBe(false);
  });

  it('gives nobody an element when the mode is off', () => {
    const { ctx, players, match } = makeContext(2);
    match.elementsEnabled = false;
    const game = new RedLightGreenLight();
    game.initialize(ctx);
    const sys = new ElementSystem(match, ctx.rng);
    sys.beginRound(players, game);
    match.phase = 'ROUND_PLAYING';
    expect(players[0]!.state.element).toBe('');
    expect(sys.cast('p0', 0, 0, 5)).toBe('rejected');
  });

  it('enforces cooldown and stun', () => {
    const { players, sys, give } = setup(new RedLightGreenLight());
    give(players[0]!, 'FIRE');
    expect(sys.cast('p0', 0, 0, 2)).toBe('ok');
    expect(sys.cast('p0', 0, 0, 2 + ELEMENTS.FIRE.cooldown - 0.1)).toBe('rejected');
    expect(sys.cast('p0', 0, 0, 2 + ELEMENTS.FIRE.cooldown)).toBe('ok');
    players[0]!.state.stunUntil = 100;
    players[0]!.state.elementReadyAt = 0;
    expect(sys.cast('p0', 0, 0, 50)).toBe('rejected');
  });

  it('EARTH pillars are clamped to range and block the wrapped step', () => {
    const { players, match, sys, give } = setup(new RedLightGreenLight(), 2);
    const [a, b] = players as [GamePlayer, GamePlayer];
    place(a, 0, 0);
    give(a, 'EARTH');
    expect(sys.cast('p0', 0, -100, 1)).toBe('ok');
    const pillar = sys.field.pillars[0]!;
    expect(Math.hypot(pillar.x, pillar.z)).toBeCloseTo(ELEMENTS.EARTH.range, 5);
    expect(match.effects[0]!.kind).toBe('PILLAR');
    // b walks straight into a pillar placed in front of it
    sys.field.pillars[0] = { x: b.sim.state.x, y: 0, z: b.sim.state.z - 3, until: 100 };
    const step = sys.wrapStep(new RedLightGreenLight().step, b);
    const startZ = b.sim.state.z;
    for (let i = 0; i < 120; i++) step(b.sim.state, { dirX: 0, dirZ: -1, jump: false }, 1 / 60, 1);
    expect(b.sim.state.z).toBeGreaterThan(startZ - 3 + ELEMENT_FX.pillarRadius - 0.01);
  });

  it('THUNDER stuns the player nearest the aim point', () => {
    const { players, sys, give } = setup(new RedLightGreenLight());
    place(players[0]!, 0, 0);
    place(players[1]!, 3, 0);
    place(players[2]!, 8, 0);
    give(players[0]!, 'THUNDER');
    sys.cast('p0', 3.5, 0, 1);
    expect(players[1]!.state.stunUntil).toBeCloseTo(1 + ELEMENT_FX.stunSeconds);
    expect(players[2]!.state.stunUntil).toBe(0);
  });

  it('WIND knocks nearby players away', () => {
    const { players, sys, give } = setup(new RedLightGreenLight(), 2);
    place(players[0]!, 0, 0);
    place(players[1]!, 2, 0);
    give(players[0]!, 'WIND');
    sys.cast('p0', 0, 0, 1);
    expect(players[1]!.sim.state.vx).toBeGreaterThan(10);
    expect(players[1]!.sim.state.grounded).toBe(false);
  });

  it('SWAP exchanges positions with whoever is nearest the aim; fails (keeping the cooldown) with nobody left', () => {
    const { players, sys, give } = setup(new RedLightGreenLight(), 2);
    place(players[0]!, 0, 10);
    place(players[1]!, 1, -20);
    give(players[0]!, 'SWAP');
    players[1]!.state.roundState = 'FINISHED';
    expect(sys.cast('p0', 1, -19, 1)).toBe('rejected');
    expect(players[0]!.state.elementReadyAt).toBe(0);
    players[1]!.state.roundState = 'ACTIVE';
    expect(sys.cast('p0', 40, 40, 1)).toBe('ok');
    expect(players[0]!.sim.state.z).toBe(-20);
    expect(players[1]!.sim.state.z).toBe(10);
  });

  it('BLINK teleports at most its range', () => {
    const { players, sys, give } = setup(new RedLightGreenLight(), 2);
    place(players[0]!, 0, 0);
    give(players[0]!, 'BLINK');
    sys.cast('p0', 0, -50, 1);
    expect(players[0]!.sim.state.z).toBeCloseTo(-ELEMENTS.BLINK.range, 5);
  });

  it('DARK blinds others near the point; CLONE spawns moving decoys that expire', () => {
    const { players, match, sys, give } = setup(new RedLightGreenLight());
    place(players[0]!, 0, 0);
    place(players[1]!, 0, -4);
    place(players[2]!, 0, -30);
    give(players[0]!, 'DARK');
    sys.cast('p0', 0, -4, 1);
    expect(players[1]!.state.blindUntil).toBeGreaterThan(1);
    expect(players[2]!.state.blindUntil).toBe(0);
    give(players[0]!, 'CLONE');
    sys.cast('p0', 0, 0, 1);
    const clones = () => match.effects.filter((e) => e.kind === 'CLONE');
    expect(clones()).toHaveLength(ELEMENT_FX.cloneCount);
    const x0 = clones()[0]!.x;
    const z0 = clones()[0]!.z;
    sys.update(0.5, 1.5);
    expect(Math.hypot(clones()[0]!.x - x0, clones()[0]!.z - z0)).toBeGreaterThan(1);
    sys.update(0.1, 1 + ELEMENT_FX.cloneSeconds + 0.1);
    expect(clones()).toHaveLength(0);
  });

  it('bridge SWAP trades progress with the leader', () => {
    const { ctx, players, match } = makeContext(2);
    const bridge = new GlassBridge();
    bridge.initialize(ctx);
    const sys = new ElementSystem(match, ctx.rng);
    sys.beginRound(players, bridge);
    match.phase = 'ROUND_PLAYING';
    bridge.start();
    // p1 clears row 0 on the safe tile
    const broken = (bridge as unknown as { brokenSide: number[] }).brokenSide[0]!;
    const safe = ((broken + 1) % 3) as 0 | 1 | 2;
    bridge.handlePlayerInput('p1', { kind: 'JUMP_TILE', side: safe }, 0);
    run(bridge, players, 0, 2);
    expect(players[1]!.state.score).toBe(1);
    players[0]!.state.element = 'SWAP';
    players[0]!.state.elementReadyAt = 0;
    expect(sys.cast('p0', 0, 0, 3)).toBe('ok');
    expect(players[0]!.state.score).toBe(1);
    expect(players[1]!.state.score).toBe(0);
  });

  it('movement hold helper still works with wrapped steps (sanity)', () => {
    const { players, sys } = setup(new RedLightGreenLight(), 1);
    const p = players[0]!;
    const step = sys.wrapStep(new RedLightGreenLight().step, p);
    p.state.hasteUntil = 100;
    const z0 = p.sim.state.z;
    hold(p, 0, -1, 0.5);
    for (let i = 0; i < 30; i++) p.sim.tick(step, 1);
    expect(z0 - p.sim.state.z).toBeGreaterThan(2);
  });
});

describe('MatchController + elements', () => {
  it('locks actions while stunned and routes picks/casts', async () => {
    const { MatchState } = await import('@sp/shared/schema');
    const { createRng } = await import('@sp/shared');
    const { PlayerSim } = await import('../players/PlayerSim.ts');
    const { addPlayer } = await import('../players/factory.ts');
    const { NPCManager } = await import('../npc/NPCManager.ts');
    const { MatchController } = await import('../match/MatchController.ts');
    const state = new MatchState();
    state.phase = 'LOBBY';
    const sims = new Map<string, InstanceType<typeof PlayerSim>>();
    for (let i = 0; i < 2; i++) addPlayer(state, sims, { id: `h${i}`, nickname: `H${i}`, slot: i, joinOrder: i, isBot: false });
    const c = new MatchController(
      { state, sims, npcs: new NPCManager(1), rng: createRng(4), rttOf: () => 0, onMatchOver: () => {}, phaseScale: 0.01 },
      ['GLASS_BRIDGE'],
    );
    c.begin();
    expect(c.pickElement('h0', 'THUNDER')).toBe(true);
    expect(c.pickElement('h0', 'FIRE')).toBe(false); // not allowed on the bridge
    while (state.phase !== 'ROUND_PLAYING') c.update(1 / 60);
    for (let i = 0; i < 90; i++) c.update(1 / 60); // past the first-cast delay
    expect(c.castElement('h0', 0, 0)).toBe('ok');
    const h1 = state.players.get('h1')!;
    expect(h1.stunUntil).toBeGreaterThan(state.gameTime);
    const z = h1.z;
    c.handleAction('h1', { kind: 'JUMP_TILE', side: 0 });
    for (let i = 0; i < 30; i++) c.update(1 / 60);
    expect(h1.z).toBe(z); // the jump was ignored
  });
});
