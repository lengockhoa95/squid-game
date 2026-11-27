import { describe, expect, it } from 'vitest';
import { RACE, RLGL, TILE_BROKEN, TILE_SAFE, tileIndex } from '@sp/shared';
import { RedLightGreenLight } from '../RedLightGreenLight/Logic.ts';
import { GlassBridge } from '../GlassBridge/Logic.ts';
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

describe('Floor Collapse', () => {
  it('tiles crack under a player, drop after the delay, and the player falls to the next floor', async () => {
    const { FloorCollapse } = await import('../FloorCollapse/Logic.ts');
    const { COLLAPSE, TILE_CRACKING, TILE_GONE, tileAt, layerTop } = await import('@sp/shared');
    const { ctx, players, match } = makeContext(2);
    const game = new FloorCollapse();
    game.initialize(ctx);
    const p = players[0]!;
    run(game, players, 0, 0.1);
    const under = tileAt(p.sim.state.x, p.sim.state.y, p.sim.state.z);
    expect(under).toBeGreaterThanOrEqual(0);
    expect(match.collapse!.tiles[under]).toBe(TILE_CRACKING);
    run(game, players, 0.1, COLLAPSE.crackSeconds + 0.95); // standing still: the tile drops, we land a floor lower
    expect(match.collapse!.tiles[under]).toBe(TILE_GONE);
    expect(p.sim.state.y).toBeCloseTo(layerTop(1), 1);
    expect(p.state.roundState).toBe('ACTIVE');
  });

  it('falling through the last floor is out; survivors rank first and pass', async () => {
    const { FloorCollapse } = await import('../FloorCollapse/Logic.ts');
    const { COLLAPSE } = await import('@sp/shared');
    const { ctx, players } = makeContext(3);
    const game = new FloorCollapse();
    game.initialize(ctx);
    players[1]!.sim.state.y = COLLAPSE.killY - 1;
    run(game, players, 0, 0.05);
    players[2]!.sim.state.y = COLLAPSE.killY - 1;
    run(game, players, 1, 0.05);
    expect(players[1]!.state.roundState).toBe('OUT');
    expect(game.isFinished()).toBe(true); // one left standing
    const outcome = game.finish();
    expect(outcome.ranking).toEqual(['p0', 'p2', 'p1']);
    expect([...outcome.passed]).toEqual(['p0']);
  });

  it('Mạng Phụ puts a falling player back on a solid tile', async () => {
    const { FloorCollapse } = await import('../FloorCollapse/Logic.ts');
    const { COLLAPSE } = await import('@sp/shared');
    const { ctx, players } = makeContext(2);
    let lives = 1;
    const game = new FloorCollapse();
    game.initialize({ ...ctx, tryRescue: () => (lives-- > 0) });
    players[0]!.sim.state.y = COLLAPSE.killY - 1;
    run(game, players, 0, 0.05);
    expect(players[0]!.state.roundState).toBe('ACTIVE');
    expect(players[0]!.sim.state.y).toBeGreaterThan(-1);
  });
});

describe('Tower Climb', () => {
  it('reaching the top platform finishes; lava below you is out', async () => {
    const { TowerClimb } = await import('../TowerClimb/Logic.ts');
    const { TOWER, TOWER_PLATFORMS, platformCenter, lavaHeight } = await import('@sp/shared');
    const { ctx, players } = makeContext(2);
    const game = new TowerClimb();
    game.initialize(ctx);
    const top = TOWER_PLATFORMS[TOWER.platforms - 1]!;
    const c = platformCenter(top, 1);
    players[0]!.sim.reset(c.x, c.z, 0);
    players[0]!.sim.state.y = top.y;
    run(game, players, 1, 0.1);
    expect(players[0]!.state.roundState).toBe('FINISHED');
    // Player 1 stands on the ground floor: once the lava is above y=0 they burn.
    let t = 1;
    while (lavaHeight(t) < 0.1) t += 0.5;
    run(game, players, t, 0.1);
    expect(players[1]!.state.roundState).toBe('OUT');
    const outcome = game.finish();
    expect(outcome.ranking[0]).toBe('p0');
    expect(outcome.passed.has('p0')).toBe(true);
  });

  it('ghost platforms vanish from the collision world and come back', async () => {
    const { TOWER_PLATFORMS, createTowerWorld, updateTowerWorld, ghostIsSolid } = await import('@sp/shared');
    const tw = createTowerWorld();
    const ghost = TOWER_PLATFORMS.find((p) => p.kind === 'ghost')!;
    let sawSolid = false;
    let sawGone = false;
    for (let t = 0; t < 6; t += 0.1) {
      updateTowerWorld(tw, t);
      const away = tw.platforms[ghost.index]!.minX > 1e5;
      expect(away).toBe(!ghostIsSolid(ghost, t));
      if (away) sawGone = true;
      else sawSolid = true;
    }
    expect(sawSolid && sawGone).toBe(true);
  });
});

describe('Maze', () => {
  it('generates the same maze for a seed, with every cell reachable from the exit', async () => {
    const { MAZE, MAZE_EXIT_COL, generateMaze, mazeDistances } = await import('@sp/shared');
    const a = generateMaze(1234);
    expect(generateMaze(1234)).toEqual(a);
    expect(generateMaze(99)).not.toEqual(a);
    const dist = mazeDistances(a, 0, MAZE_EXIT_COL);
    expect([...dist].every((d) => d >= 0)).toBe(true);
    expect(dist.length).toBe(MAZE.rows * MAZE.cols);
  });

  it('the minotaur catches a player who stands still; the exit gate finishes', async () => {
    const { MazeRun } = await import('../Maze/Logic.ts');
    const { MAZE, MAZE_EXIT_Z } = await import('@sp/shared');
    const { ctx, players } = makeContext(2);
    const game = new MazeRun();
    game.initialize(ctx);
    players[1]!.sim.reset(players[1]!.sim.state.x, MAZE_EXIT_Z - 0.5, Math.PI);
    run(game, players, 0, 0.1);
    expect(players[1]!.state.roundState).toBe('FINISHED');
    run(game, players, 0.1, MAZE.minotaurDelay + 8);
    expect(players[0]!.state.roundState).toBe('OUT');
    expect(game.finish().details.get('p0')).toBe('Bị Minotaur bắt');
  });
});

describe('Parkour', () => {
  it('jump pads launch, the conveyor drags you back', async () => {
    const { PARKOUR, PARKOUR_STATIC, createCharacterState, createParkourWorld, parkourStep, MOVEMENT } = await import('@sp/shared');
    const step = parkourStep(createParkourWorld(), MOVEMENT.radius);
    const pad = PARKOUR_STATIC.find((b) => b.kind === 'pad')!;
    const s = createCharacterState(0, (pad.minZ + pad.maxZ) / 2);
    s.y = pad.top;
    step(s, { dirX: 0, dirZ: 0, jump: false }, 1 / 60, 0);
    expect(s.vy).toBeGreaterThan(PARKOUR.padLaunch - 1);
    const belt = PARKOUR_STATIC.find((b) => b.kind === 'conveyor')!;
    const c = createCharacterState(0, (belt.minZ + belt.maxZ) / 2);
    c.y = belt.top;
    const z0 = c.z;
    for (let i = 0; i < 60; i++) step(c, { dirX: 0, dirZ: 0, jump: false }, 1 / 60, i / 60);
    expect(c.z - z0).toBeGreaterThan(PARKOUR.conveyorSpeed * 0.9);
  });

  it('falling respawns at the last checkpoint (at its height); crossing the line finishes', async () => {
    const { Parkour } = await import('../Parkour/Logic.ts');
    const { PARKOUR } = await import('@sp/shared');
    const { ctx, players } = makeContext(2);
    const game = new Parkour();
    game.initialize(ctx);
    const p = players[0]!;
    p.sim.reset(0, -50, Math.PI);
    p.sim.state.y = PARKOUR.deck;
    run(game, players, 0, 0.1); // stood on the high deck
    p.sim.state.y = PARKOUR.killY - 1;
    run(game, players, 0.1, 1 / 60);
    expect(p.sim.state.z).toBeCloseTo(-47.5, 1);
    expect(p.sim.state.y).toBeCloseTo(PARKOUR.deck, 1);
    players[1]!.sim.reset(0, PARKOUR.finishZ - 0.5, Math.PI);
    run(game, players, 1, 0.1);
    expect(players[1]!.state.roundState).toBe('FINISHED');
  });
});
