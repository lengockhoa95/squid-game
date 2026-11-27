import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { MAX_PLAYERS, MSG, ROOM_CODE_LENGTH, ROOM_NAME } from '@sp/shared';
import type { MatchState } from '@sp/shared/schema';
import { createServer } from '../app.ts';
import type { MatchRoom } from './MatchRoom.ts';

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await boot(createServer({ phaseScale: 0.05 }), 2611);
});
afterEach(async () => {
  await colyseus.cleanup();
});
afterAll(async () => {
  await colyseus.shutdown();
});

async function waitFor(pred: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function createLobby(nicknames: string[]) {
  const host = await colyseus.sdk.create(ROOM_NAME, { nickname: nicknames[0] });
  const room = colyseus.getRoomById(host.roomId) as unknown as MatchRoom;
  const others = [];
  for (const nickname of nicknames.slice(1)) others.push(await colyseus.sdk.joinById(host.roomId, { nickname }));
  const state = room.state as MatchState;
  return { host, others, room, state };
}

function forwardBatch(seq: number, n = 3) {
  return { s: seq, i: Array.from({ length: n }, () => [0, -1, 0]).flat() };
}

describe('MatchRoom lobby', () => {
  it('creates a room whose id is a short room code and makes the creator host', async () => {
    const { host, state } = await createLobby(['An']);
    expect(host.roomId).toHaveLength(ROOM_CODE_LENGTH);
    expect(state.roomCode).toBe(host.roomId);
    expect(state.hostId).toBe(host.sessionId);
    expect(state.phase).toBe('LOBBY');
    expect(state.players.get(host.sessionId)?.nickname).toBe('An');
  });

  it('lets others join by code, assigns distinct slots, sanitizes nicknames', async () => {
    const { others, state } = await createLobby(['An', '  <Bình>  ', '']);
    expect(state.players.size).toBe(3);
    expect(state.players.get(others[0]!.sessionId)?.nickname).toBe('Bình');
    expect(state.players.get(others[1]!.sessionId)?.nickname).toBe('Người chơi 3');
    const slots = [...state.players.values()].map((p) => p.slot).sort();
    expect(slots).toEqual([0, 1, 2]);
  });

  it(`rejects a ${MAX_PLAYERS + 1}th player`, async () => {
    const { host } = await createLobby(['1', '2', '3', '4']);
    await expect(colyseus.sdk.joinById(host.roomId, { nickname: '5' })).rejects.toThrow();
  });

  it('only the host can start, and only when every human is ready', async () => {
    const { host, others, state } = await createLobby(['Host', 'Guest']);
    const guest = others[0]!;

    const notHost = guest.waitForMessage(MSG.ERROR);
    guest.send(MSG.START);
    expect(await notHost).toEqual({ code: 'NOT_HOST' });

    const notReady = host.waitForMessage(MSG.ERROR);
    host.send(MSG.START);
    expect(await notReady).toEqual({ code: 'NOT_ALL_READY' });
    expect(state.phase).toBe('LOBBY');
  });

  it('transfers host when the host leaves', async () => {
    const { host, others, state } = await createLobby(['Host', 'Next']);
    await host.leave();
    await waitFor(() => state.hostId === others[0]!.sessionId);
    expect(state.players.size).toBe(1);
  });

  it('marks a dropped player disconnected and restores them on reconnect', async () => {
    const { others, state } = await createLobby(['Host', 'Flaky']);
    const flaky = others[0]!;
    const id = flaky.sessionId;
    const token = flaky.reconnectionToken;
    flaky.reconnection.enabled = false; // simulate a page reload: no automatic retry
    await flaky.leave(false); // non-consented: server keeps the seat
    await waitFor(() => state.players.get(id)?.connected === false);
    expect(state.players.size).toBe(2);

    const back = await colyseus.sdk.reconnect(token);
    expect(back.sessionId).toBe(id);
    await waitFor(() => state.players.get(id)?.connected === true);
  }, 15000);
});

describe('MatchRoom match flow', () => {
  it('ignores movement in the lobby', async () => {
    const { host, room, state } = await createLobby(['Solo']);
    const before = state.players.get(host.sessionId)!.z;
    host.send(MSG.MOVE, forwardBatch(1, 6));
    await room.waitForNextPatch();
    await room.waitForNextPatch();
    expect(state.players.get(host.sessionId)!.z).toBe(before);
  });

  it('host configures NPCs; START fills empty slots with bots and locks the room', async () => {
    const { host, others, room, state } = await createLobby(['Host', 'Guest']);
    expect(state.npcCount).toBe(2); // default fills the room, clamped to free slots

    const denied = others[0]!.waitForMessage(MSG.ERROR);
    others[0]!.send(MSG.NPC_CONFIG, { count: 1, difficulties: ['HARD'] });
    expect(await denied).toEqual({ code: 'NOT_HOST' });

    host.send(MSG.NPC_CONFIG, { count: 1, difficulties: ['SMART', 'EASY'] });
    await waitFor(() => state.npcCount === 1 && state.npcDifficulties[0] === 'SMART');

    host.send(MSG.READY, { ready: true });
    others[0]!.send(MSG.READY, { ready: true });
    await waitFor(() => [...state.players.values()].every((p) => p.ready));
    host.send(MSG.START);
    await waitFor(() => state.phase === 'ROUND_INTRO');
    expect(room.locked).toBe(true);
    const bots = [...state.players.values()].filter((p) => p.isBot);
    expect(bots).toHaveLength(1);
    expect(bots[0]!.difficulty).toBe('SMART');
    expect(state.totalRounds).toBeGreaterThanOrEqual(3);
    expect(state.currentGame).not.toBe('');
    await expect(colyseus.sdk.joinById(host.roomId, { nickname: 'Late' })).rejects.toThrow();

    // Host aborts back to the lobby: bots removed, room unlocked, ready flags reset.
    host.send(MSG.BACK_TO_LOBBY);
    await waitFor(() => state.phase === 'LOBBY');
    await waitFor(() => room.locked === false);
    expect([...state.players.values()].some((p) => p.isBot)).toBe(false);
    expect([...state.players.values()].every((p) => !p.ready)).toBe(true);
  }, 15000);

  it('simulates validated movement only while the round is playing', async () => {
    const { host, room, state } = await createLobby(['Solo']);
    host.send(MSG.NPC_CONFIG, { count: 1, difficulties: ['EASY'] });
    host.send(MSG.READY, { ready: true });
    await waitFor(() => state.players.get(host.sessionId)!.ready);
    host.send(MSG.START);
    await waitFor(() => state.phase === 'ROUND_PLAYING', 5000);
    const me = state.players.get(host.sessionId)!;
    if (state.currentGame === 'RLGL' || state.currentGame === 'OBSTACLE_RACE') {
      const startZ = me.z;
      host.send(MSG.MOVE, forwardBatch(1));
      host.send(MSG.MOVE, forwardBatch(4));
      await waitFor(() => me.lastSeq === 6);
      expect(me.z).toBeLessThan(startZ);
    }
    // Malformed / oversized payloads are dropped without crashing the room.
    host.send(MSG.MOVE, { s: 100, i: [999, 0, 5] });
    host.send(MSG.MOVE, 'garbage');
    host.send(MSG.ACTION, { kind: 'WIN_ROUND' });
    await room.waitForNextPatch();
    expect(state.phase).toBe('ROUND_PLAYING');
  }, 15000);

  it('a human leaving mid-match forfeits but stays listed until the lobby', async () => {
    const { host, others, state } = await createLobby(['Host', 'Quitter']);
    host.send(MSG.NPC_CONFIG, { count: 0, difficulties: [] });
    host.send(MSG.READY, { ready: true });
    others[0]!.send(MSG.READY, { ready: true });
    await waitFor(() => [...state.players.values()].every((p) => p.ready));
    host.send(MSG.START);
    await waitFor(() => state.phase === 'ROUND_INTRO');
    const quitterId = others[0]!.sessionId;
    await others[0]!.leave();
    await waitFor(() => state.players.get(quitterId)?.alive === false);
    expect(state.players.get(quitterId)?.connected).toBe(false);
    // Only one player left: the match ends with the host as winner.
    await waitFor(() => state.winnerId === host.sessionId, 10000);
  }, 20000);

  it('element mode: only the host toggles it; players pick during the intro and cast while playing', async () => {
    const { host, others, state } = await createLobby(['Host', 'Guest']);
    const guest = others[0]!;
    const denied = guest.waitForMessage(MSG.ERROR);
    guest.send(MSG.ELEMENTS_TOGGLE, { enabled: false });
    expect(await denied).toEqual({ code: 'NOT_HOST' });
    host.send(MSG.ELEMENTS_TOGGLE, { enabled: false });
    await waitFor(() => !state.elementsEnabled);
    host.send(MSG.ELEMENTS_TOGGLE, { enabled: true });
    await waitFor(() => state.elementsEnabled);

    host.send(MSG.NPC_CONFIG, { count: 0, difficulties: [] });
    host.send(MSG.READY, { ready: true });
    guest.send(MSG.READY, { ready: true });
    await waitFor(() => [...state.players.values()].every((p) => p.ready));
    host.send(MSG.START);
    await waitFor(() => state.phase === 'ROUND_INTRO');
    const me = state.players.get(host.sessionId)!;
    expect(me.element).not.toBe('');
    host.send(MSG.PICK_ELEMENT, { element: 'THUNDER' }); // allowed in every game
    await waitFor(() => me.element === 'THUNDER');
    host.send(MSG.PICK_ELEMENT, { element: 'NUKE' });
    host.send(MSG.CAST, { x: 'a', z: 0 });
    await waitFor(() => state.phase === 'ROUND_PLAYING', 5000);
    await waitFor(() => state.gameTime > 1.1, 5000);
    const g = state.players.get(guest.sessionId)!;
    host.send(MSG.CAST, { x: g.x, z: g.z });
    await waitFor(() => me.elementReadyAt > state.gameTime, 3000);
    expect(state.effects.some((e) => e.kind === 'BOLT')).toBe(true);
  }, 20000);

  it('no-elimination mode: host-only toggle; a forfeit still ends a 2-player match with the other as winner', async () => {
    const { host, others, state } = await createLobby(['Host', 'Guest']);
    const guest = others[0]!;
    const denied = guest.waitForMessage(MSG.ERROR);
    guest.send(MSG.NO_ELIMINATION_TOGGLE, { enabled: true });
    expect(await denied).toEqual({ code: 'NOT_HOST' });
    host.send(MSG.NO_ELIMINATION_TOGGLE, { enabled: true });
    await waitFor(() => state.noElimination);
    host.send(MSG.NPC_CONFIG, { count: 0, difficulties: [] });
    host.send(MSG.READY, { ready: true });
    guest.send(MSG.READY, { ready: true });
    await waitFor(() => [...state.players.values()].every((p) => p.ready));
    host.send(MSG.START);
    await waitFor(() => state.phase === 'ROUND_INTRO');
    expect(state.totalRounds).toBe(5);
    await guest.leave();
    await waitFor(() => state.winnerId === host.sessionId, 10000);
  }, 20000);
});
