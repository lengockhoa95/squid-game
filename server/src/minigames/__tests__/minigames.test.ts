import { describe, expect, it } from 'vitest';
import { BRIDGE, RACE, RLGL, TILE_BROKEN, TILE_SAFE, bridgeFinishZ, bridgeRowZ, tileIndex } from '@sp/shared';
import { RedLightGreenLight } from '../RedLightGreenLight/Logic.ts';
import { GlassBridge } from '../GlassBridge/Logic.ts';
import { ObstacleRace } from '../ObstacleRace/Logic.ts';
import { hold, makeContext, run } from './helpers.ts';

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
  /** Stand a player on a tile (as if they just landed there). */
  function standOn(p: { sim: { reset(x: number, z: number, yaw: number): void } }, row: number, side: number) {
    p.sim.reset(BRIDGE.tileX[side as 0 | 1 | 2], bridgeRowZ(row), Math.PI);
  }

  it('3 tiles per row: landing on the breaking one drops you and reveals the rest', () => {
    const { ctx, players, match } = makeContext(2, 7);
    const game = new GlassBridge();
    game.initialize(ctx);
    expect(match.bridge!.rows).toBe(5); // 2 players → max(5, 2 + 3)
    expect(match.bridge!.tiles.length).toBe(5 * 3);
    const broken = (game as unknown as { brokenSide: number[] }).brokenSide[0]!;

    standOn(players[0]!, 0, broken);
    run(game, players, 0, 2);
    expect(players[0]!.state.roundState).toBe('OUT');
    for (let side = 0; side < 3; side++) {
      expect(match.bridge!.tiles[tileIndex(0, side)]).toBe(side === broken ? TILE_BROKEN : TILE_SAFE);
    }
    standOn(players[1]!, 0, (broken + 1) % 3);
    run(game, players, 2, 0.5);
    expect(players[1]!.state.score).toBe(1);
    expect(players[1]!.state.roundState).toBe('ACTIVE');
  });

  it('players walk on the start platform and finish on the far platform', () => {
    const { ctx, players, match } = makeContext(2, 3);
    const game = new GlassBridge();
    game.initialize(ctx);
    run(game, players, 0, 1);
    expect(players[0]!.state.roundState).toBe('ACTIVE'); // standing on the start platform
    players[1]!.sim.reset(0, bridgeFinishZ(match.bridge!.rows) - 2, Math.PI);
    run(game, players, 1, 0.2);
    expect(players[1]!.state.roundState).toBe('FINISHED');
    expect(game.finish().passed.has('p1')).toBe(true);
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

describe('Ice Race', () => {
  it('ice has little grip: you keep sliding after letting go', async () => {
    const { createCharacterState, createIceWorld, iceStep, ICE_MOVEMENT, MOVEMENT } = await import('@sp/shared');
    expect(ICE_MOVEMENT.decel).toBeLessThan(MOVEMENT.decel / 10);
    const step = iceStep(createIceWorld());
    const s = createCharacterState(0, 30);
    s.vz = -8;
    for (let i = 0; i < 60; i++) step(s, { dirX: 0, dirZ: 0, jump: false }, 1 / 60, 0);
    expect(Math.abs(s.vz)).toBeGreaterThan(5); // still sliding a second later
  });

  it('progress follows the track; falling respawns on the track', async () => {
    const { IceRace } = await import('../IceRace/Logic.ts');
    const { ICE, iceProgress } = await import('@sp/shared');
    expect(iceProgress(0, 34)).toBeCloseTo(0, 5);
    expect(iceProgress(24, 2)).toBeCloseTo(32 + 24, 5);
    const { ctx, players } = makeContext(1);
    const game = new IceRace();
    game.initialize(ctx);
    players[0]!.sim.state.y = ICE.killY - 1;
    run(game, players, 0, 1 / 60);
    expect(players[0]!.sim.state.y).toBe(0);
  });
});

describe('Lucky Doors', () => {
  it('fake doors bounce you back and get revealed; real doors let you through', async () => {
    const { LuckyDoors } = await import('../LuckyDoors/Logic.ts');
    const { DOORS, DOOR_FAKE, DOOR_REAL, doorRowZ, doorX } = await import('@sp/shared');
    const { ctx, players, match } = makeContext(2);
    const game = new LuckyDoors();
    game.initialize(ctx);
    const real = (game as unknown as { real: boolean[][] }).real[0]!;
    expect(real.filter(Boolean)).toHaveLength(DOORS.realPerRow);
    const fakeK = real.indexOf(false);
    const realK = real.indexOf(true);
    const [a, b] = players as [typeof players[0], typeof players[0]];
    a.sim.reset(doorX(fakeK), doorRowZ(0) + 1, Math.PI);
    b.sim.reset(doorX(realK), doorRowZ(0) + 1, Math.PI);
    hold(a, 0, -1, 1);
    hold(b, 0, -1, 1);
    run(game, players, 0, 1);
    expect(match.doors!.tiles[fakeK]).toBe(DOOR_FAKE);
    expect(a.sim.state.z).toBeGreaterThan(doorRowZ(0)); // still in front of the wall
    expect(match.doors!.tiles[realK]).toBe(DOOR_REAL);
    expect(b.state.score).toBe(1);
  });
});

describe('Paint', () => {
  it('walking paints cells; stepping on a rival cell steals it; fewest cells fails', async () => {
    const { Paint } = await import('../Paint/Logic.ts');
    const { paintCellAt } = await import('@sp/shared');
    const { ctx, players, match } = makeContext(2);
    const game = new Paint();
    game.initialize(ctx);
    for (let i = 0; i < 90; i++) {
      hold(players[0]!, 1, 0, 1 / 60); // one input per tick, like a client
      run(game, players, i / 60, 1 / 60);
    }
    expect(players[0]!.state.score).toBeGreaterThan(4);
    const cell = paintCellAt(players[0]!.sim.state.x, players[0]!.sim.state.z);
    expect(match.paint!.cells[cell]).toBe(players[0]!.state.slot + 1);
    players[1]!.sim.reset(players[0]!.sim.state.x, players[0]!.sim.state.z, 0);
    run(game, players, 1.5, 0.1);
    expect(match.paint!.cells[cell]).toBe(players[1]!.state.slot + 1);
    const outcome = game.finish();
    expect(outcome.passed.size).toBe(1);
    expect(outcome.passed.has(outcome.ranking[0]!)).toBe(true);
  });
});

describe('Zombie', () => {
  it('patient zero appears, touching infects, survivors pass', async () => {
    const { ZombieInfection } = await import('../Zombie/Logic.ts');
    const { TEAM_ZOMBIE, ZOMBIE } = await import('@sp/shared');
    const { ctx, players } = makeContext(3);
    const game = new ZombieInfection();
    game.initialize(ctx);
    run(game, players, 0, ZOMBIE.outbreakAt + 0.1);
    const zombies = players.filter((p) => p.state.team === TEAM_ZOMBIE);
    expect(zombies).toHaveLength(1);
    expect(zombies[0]!.state.moveMul).toBeCloseTo(ZOMBIE.speedMul, 5);
    const z = zombies[0]!;
    const victim = players.find((p) => p !== z)!;
    victim.sim.reset(z.sim.state.x + 0.5, z.sim.state.z, 0);
    run(game, players, ZOMBIE.outbreakAt + ZOMBIE.infectCooldown + 0.2, 0.1);
    expect(victim.state.team).toBe(TEAM_ZOMBIE);
    const outcome = game.finish();
    const survivor = players.find((p) => p.state.team !== TEAM_ZOMBIE)!;
    expect([...outcome.passed]).toEqual([survivor.id]);
  });
});

describe('Rope Climb', () => {
  it('planks sway with time, gusts push sideways, falls respawn on the highest station reached', async () => {
    const { RopeClimb } = await import('../RopeClimb/Logic.ts');
    const { ROPE, plankOffset, windAt, stationCenter } = await import('@sp/shared');
    expect(plankOffset(0, 3, 0)).not.toBeCloseTo(plankOffset(0, 3, 1), 2);
    const gusts = Array.from({ length: 120 }, (_, i) => windAt(i / 10)).filter((w) => Math.abs(w) > 0.5);
    expect(gusts.length).toBeGreaterThan(0);
    const { ctx, players } = makeContext(2);
    const game = new RopeClimb();
    game.initialize(ctx);
    const c = stationCenter(2);
    players[0]!.sim.reset(c.x, c.z, Math.PI);
    players[0]!.sim.state.y = c.y;
    run(game, players, 0, 0.1);
    expect(players[0]!.state.score).toBe(2);
    players[0]!.sim.state.y = ROPE.killY - 1;
    run(game, players, 0.1, 1 / 60);
    expect(players[0]!.sim.state.z).toBeCloseTo(c.z, 1);
  });
});

describe('Shark Swim', () => {
  it('swimming is slower than walking; a shark next to a swimmer bites; reaching the island passes', async () => {
    const { SharkSwim } = await import('../SharkSwim/Logic.ts');
    const { SEA, SWIM_MOVEMENT, MOVEMENT } = await import('@sp/shared');
    expect(SWIM_MOVEMENT.walkSpeed).toBeLessThan(MOVEMENT.walkSpeed);
    const { ctx, players, match } = makeContext(2);
    const game = new SharkSwim();
    game.initialize(ctx);
    expect(match.sea!.sharks.length).toBe(SEA.sharks);
    const [a, b] = players as [typeof players[0], typeof players[0]];
    const shark = match.sea!.sharks[0]!;
    a.sim.reset(shark.x, shark.z, Math.PI);
    a.sim.state.y = SEA.swimY;
    run(game, players, 0, 0.05);
    expect(a.state.roundState).toBe('OUT');
    b.sim.reset(0, SEA.islandZ - 3, Math.PI);
    run(game, players, 0.05, 0.1);
    expect(b.state.roundState).toBe('FINISHED');
    expect(game.finish().details.get('p0')).toContain('cá mập');
  });
});

describe('Castle (Thủ Thành)', () => {
  it('waves follow the host setting with a dragon boss every 5th wave', async () => {
    const { castleWave, isBossWave, castleWaveCount } = await import('@sp/shared');
    expect(castleWaveCount(15)).toBe(15);
    expect(castleWaveCount(7)).toBe(10); // unknown values fall back to the default
    expect(isBossWave(5) && isBossWave(10) && !isBossWave(4)).toBe(true);
    expect(castleWave(5, 4).some((s) => s.kind === 'DRAGON')).toBe(true);
    expect(castleWave(3, 4).some((s) => s.kind === 'DRAGON')).toBe(false);
    expect(castleWave(9, 4)[0]!.hpMul).toBeGreaterThan(castleWave(1, 4)[0]!.hpMul);
  });

  it('right click damages the monster in front; kills score; a cleared wave deals weapon cards', async () => {
    const { Castle } = await import('../Castle/Logic.ts');
    const { CASTLE } = await import('@sp/shared');
    const { ctx, players, match } = makeContext(1);
    match.castleWaves = 5;
    const game = new Castle();
    game.initialize(ctx);
    expect(match.castle!.waves).toBe(5);
    let t = run(game, players, 0, CASTLE.prepSeconds + 0.1);
    expect(match.castle!.wave).toBe(1);
    t = run(game, players, t, 3); // let the slimes spawn
    const p = players[0]!;
    // Kill every monster by standing in front of it and attacking.
    for (let guard = 0; guard < 400 && (match.castle!.monsters.some((m) => m.state !== 'DIE') || match.castle!.breakUntil === 0); guard++) {
      const m = match.castle!.monsters.find((mm) => mm.state !== 'DIE');
      if (m) {
        p.sim.reset(m.x, m.z - 1, 0); // facing +z, toward the monster
        const before = m.hp;
        game.handleAttack(p.id, t);
        if (before > 0) expect(m.hp).toBeLessThan(before);
      }
      t = run(game, players, t, 0.5);
    }
    expect(p.state.score).toBeGreaterThan(0);
    expect(match.castle!.breakUntil).toBeGreaterThan(t);
    const offer = game.offerOf(p.id);
    expect(offer.length).toBeGreaterThan(0);
    game.handlePick(p.id, offer[0]!);
    expect(p.state.perkOffer).toBe('');
    expect(p.state.perks !== '' || p.state.weaponTier > 0).toBe(true);
  });

  it('weapon stats scale with rarity and cards; maxed lines unlock ultimates', async () => {
    const { weaponStats, ultimatesFor, WEAPONS } = await import('@sp/shared');
    const base = weaponStats('SWORD', 0, {});
    expect(base.damage).toBe(WEAPONS.SWORD.damage);
    expect(weaponStats('SWORD', 3, {}).damage).toBeGreaterThan(base.damage * 2);
    expect(weaponStats('SWORD', 0, { HASTE: 3 }).cooldown).toBeLessThan(base.cooldown);
    expect(ultimatesFor({ POWER: 2 }, 'SWORD', 0)).toEqual([]);
    expect(ultimatesFor({ POWER: 3 }, 'SWORD', 0)).toEqual(['POWER']);
    expect(ultimatesFor({}, 'BOW', 3)).toEqual(['REACH']); // Truyền thuyết weapons have their own
  });

  it('walking over a better weapon equips it, a worse one is left on the ground', async () => {
    const { Castle } = await import('../Castle/Logic.ts');
    const { WeaponPickup } = await import('@sp/shared/schema');
    const { ctx, players, match } = makeContext(1);
    const game = new Castle();
    game.initialize(ctx);
    const p = players[0]!;
    const put = (id: number, weapon: string, tier: number, x: number) => {
      const pk = new WeaponPickup();
      pk.id = id;
      pk.weapon = weapon;
      pk.tier = tier;
      pk.x = x;
      pk.z = 0;
      match.castle!.pickups.push(pk);
    };
    put(900, 'GUN', 2, 0);
    p.sim.reset(0, 0, 0);
    let t = run(game, players, 0, 0.1);
    expect(p.state.weapon).toBe('GUN');
    expect(p.state.weaponTier).toBe(2);
    put(901, 'SWORD', 0, 4);
    p.sim.reset(4, 0, 0);
    t = run(game, players, t + 2, 0.1);
    expect(p.state.weapon).toBe('GUN');
    expect(match.castle!.pickups.length).toBe(1);
  });
});
