import { describe, expect, it } from 'vitest';
import { RACE, REACTION, RLGL, TILE_BROKEN, TILE_SAFE, TUG, tugInZone, tileIndex } from '@sp/shared';
import { RedLightGreenLight } from '../RedLightGreenLight/Logic.ts';
import { GlassBridge } from '../GlassBridge/Logic.ts';
import { TugOfWar } from '../TugOfWar/Logic.ts';
import { QuickReaction } from '../QuickReaction/Logic.ts';
import { ObstacleRace } from '../ObstacleRace/Logic.ts';
import { makeContext, run } from './helpers.ts';

describe('Red Light Green Light', () => {
  it('catches a player who keeps moving after the grace period of a red light', () => {
    const { ctx, players } = makeContext(2);
    const game = new RedLightGreenLight();
    game.initialize(ctx);
    game.start();
    let t = 0;
    // Run until the light turns red, with p0 walking constantly and p1 standing still.
    while (game.publicLight.light !== 'RED') {
      players[0]!.sim.enqueue({ s: players[0]!.sim.nextSeq, i: [0, -1, 0] });
      t = run(game, players, t, 1 / 60);
    }
    for (let i = 0; i < 60; i++) {
      players[0]!.sim.enqueue({ s: players[0]!.sim.nextSeq, i: [0, -1, 0] });
      t = run(game, players, t, 1 / 60);
    }
    expect(players[0]!.state.roundState).toBe('OUT');
    expect(players[1]!.state.roundState).toBe('ACTIVE');
  });

  it('does not punish movement within the grace window', () => {
    const { ctx, players } = makeContext(1);
    const game = new RedLightGreenLight();
    game.initialize(ctx);
    let t = 0;
    while (game.publicLight.light !== 'RED') {
      players[0]!.sim.enqueue({ s: players[0]!.sim.nextSeq, i: [0, -1, 0] });
      t = run(game, players, t, 1 / 60);
    }
    // React within the grace period: stop sending forward input (character brakes).
    t = run(game, players, t, (RLGL.graceMs + 200) / 1000);
    expect(players[0]!.state.roundState).toBe('ACTIVE');
  });

  it('marks players crossing the finish line as FINISHED and passes them', () => {
    const { ctx, players } = makeContext(1);
    const game = new RedLightGreenLight();
    game.initialize(ctx);
    players[0]!.sim.reset(0, RLGL.finishZ - 0.5, Math.PI);
    run(game, players, 0, 0.1);
    expect(players[0]!.state.roundState).toBe('FINISHED');
    expect(game.finish().passed.has('p0')).toBe(true);
  });
});

describe('Glass Bridge', () => {
  it('3 tiles per row: the breaking one drops you and reveals the rest; broken tiles cannot be picked', () => {
    const { ctx, players, match } = makeContext(2, 7);
    const game = new GlassBridge();
    game.initialize(ctx);
    expect(match.bridge!.rows).toBe(5); // 2 players → max(5, 2 + 3)
    expect(match.bridge!.tiles.length).toBe(5 * 3);
    const broken = (game as unknown as { brokenSide: number[] }).brokenSide[0] as 0 | 1 | 2;

    game.handlePlayerInput('p0', { kind: 'JUMP_TILE', side: broken }, 0);
    run(game, players, 0, 1);
    expect(players[0]!.state.roundState).toBe('OUT');
    for (let side = 0; side < 3; side++) {
      expect(match.bridge!.tiles[tileIndex(0, side)]).toBe(side === broken ? TILE_BROKEN : TILE_SAFE);
    }
    game.handlePlayerInput('p1', { kind: 'JUMP_TILE', side: broken }, 1.1); // broken: rejected
    run(game, players, 1.1, 1);
    expect(players[1]!.state.score).toBe(0);
    const safe = ((broken + 1) % 3) as 0 | 1 | 2;
    game.handlePlayerInput('p1', { kind: 'JUMP_TILE', side: safe }, 2.2);
    run(game, players, 2.2, 1);
    expect(players[1]!.state.score).toBe(1);
    expect(players[1]!.state.roundState).toBe('ACTIVE');
  });

  it('ignores actions from players who are out, mid-jump, or spamming', () => {
    const { ctx, players } = makeContext(1, 3);
    const game = new GlassBridge();
    game.initialize(ctx);
    game.handlePlayerInput('p0', { kind: 'JUMP_TILE', side: 1 }, 0);
    game.handlePlayerInput('p0', { kind: 'JUMP_TILE', side: 0 }, 0.05); // mid-jump: ignored
    run(game, players, 0, 2);
    expect(players[0]!.state.score).toBeLessThanOrEqual(1);
    game.handlePlayerInput('nobody', { kind: 'JUMP_TILE', side: 0 }, 2.1); // unknown id: ignored
  });
});

describe('Tug of War', () => {
  it('splits players into two equal teams', () => {
    const { ctx, players } = makeContext(4);
    new TugOfWar().initialize(ctx);
    expect(players.filter((p) => p.state.team === 0)).toHaveLength(2);
    expect(players.filter((p) => p.state.team === 1)).toHaveLength(2);
  });

  it('on-beat pulls are strong, off-beat pulls weak + fatigue, and spam is throttled', () => {
    const { ctx, players, match } = makeContext(2);
    const game = new TugOfWar();
    game.initialize(ctx);
    const puller = players.find((p) => p.state.team === 1)!;
    // Find an on-beat time and an off-beat time.
    let onBeat = 0;
    while (!tugInZone(onBeat)) onBeat += 0.001;
    let offBeat = onBeat + TUG.cursorPeriodS / 4;
    while (tugInZone(offBeat) || tugInZone(offBeat - 0.1) || tugInZone(offBeat + 0.1)) offBeat += 0.01;

    game.handlePlayerInput(puller.id, { kind: 'PULL' }, onBeat);
    const strong = match.tug!.rope;
    expect(strong).toBeCloseTo(TUG.strongPull * TUG.ropeGain);
    game.handlePlayerInput(puller.id, { kind: 'PULL' }, onBeat + 0.01); // too soon: throttled
    expect(match.tug!.rope).toBe(strong);
    game.handlePlayerInput(puller.id, { kind: 'PULL' }, offBeat);
    expect(match.tug!.rope).toBeCloseTo(strong + TUG.weakPull * TUG.ropeGain);
    const afterWeak = match.tug!.rope;
    game.handlePlayerInput(puller.id, { kind: 'PULL' }, offBeat + 0.15); // fatigued: no effect
    expect(match.tug!.rope).toBe(afterWeak);
  });

  it('the losing team fails the round', () => {
    const { ctx, players } = makeContext(2);
    const game = new TugOfWar();
    game.initialize(ctx);
    const winner = players.find((p) => p.state.team === 0)!;
    let t = 0;
    while (!game.isFinished() && t < 60) {
      if (tugInZone(t)) game.handlePlayerInput(winner.id, { kind: 'PULL' }, t);
      t += 0.005;
    }
    const outcome = game.finish();
    expect(outcome.passed.has(winner.id)).toBe(true);
    expect(outcome.passed.size).toBe(1);
  });
});

describe('Quick Reaction', () => {
  it('penalizes false starts and ranks by total server-measured time', () => {
    const { ctx, players } = makeContext(2);
    const game = new QuickReaction();
    game.initialize(ctx);
    game.start();
    let t = 0;
    let falseStarted = false;
    const dt = 1 / 60;
    while (!game.isFinished() && t < 60) {
      t += dt;
      game.update(dt, t);
      const stage = game.publicStage.stage;
      if (stage === 'WAIT' && !falseStarted) {
        game.handlePlayerInput('p1', { kind: 'REACT' }, t); // jumps the gun on attempt 1
        falseStarted = true;
      }
      if (stage === 'GO') {
        game.handlePlayerInput('p0', { kind: 'REACT' }, t + 0.25);
        if (!game.publicStage.pressed('p1')) game.handlePlayerInput('p1', { kind: 'REACT' }, t + 0.25);
      }
    }
    const outcome = game.finish();
    expect(outcome.ranking[0]).toBe('p0');
    expect(players[1]!.state.score).toBeGreaterThanOrEqual(REACTION.falseStartMs);
    expect(outcome.passed.has('p1')).toBe(false);
  });

  it('treats impossibly fast reactions as guesses', () => {
    const { ctx, players } = makeContext(1);
    const game = new QuickReaction();
    game.initialize(ctx);
    let t = 0;
    while (game.publicStage.stage !== 'GO') {
      t += 1 / 60;
      game.update(1 / 60, t);
    }
    game.handlePlayerInput('p0', { kind: 'REACT' }, t + 0.01); // 10ms after GO
    expect(players[0]!.state.score).toBe(REACTION.falseStartMs);
  });
});

describe('Obstacle Race', () => {
  it('respawns fallen players at their last checkpoint instead of eliminating them', () => {
    const { ctx, players } = makeContext(1);
    const game = new ObstacleRace();
    game.initialize(ctx);
    players[0]!.sim.reset(0, 12.6, Math.PI); // inside the first gap, past checkpoint 30 only
    run(game, players, 0, 2);
    expect(players[0]!.state.roundState).toBe('ACTIVE');
    expect(players[0]!.sim.state.y).toBeGreaterThanOrEqual(0);
    expect(players[0]!.sim.state.z).toBeGreaterThan(13.6); // back on the first segment
  });

  it('when everyone finishes, the slowest finisher fails', () => {
    const { ctx, players } = makeContext(2);
    const game = new ObstacleRace();
    game.initialize(ctx);
    players[0]!.sim.reset(0, RACE.finishZ - 0.5, Math.PI);
    run(game, players, 0, 0.1);
    players[1]!.sim.reset(2, RACE.finishZ - 0.5, Math.PI);
    run(game, players, 1, 0.1);
    const outcome = game.finish();
    expect(outcome.passed.has('p0')).toBe(true);
    expect(outcome.passed.has('p1')).toBe(false);
  });
});
