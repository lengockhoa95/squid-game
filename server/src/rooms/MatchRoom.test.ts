import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { boot, type ColyseusTestServer } from '@colyseus/testing';
import { MAX_PLAYERS, MSG, ROOM_CODE_LENGTH, ROOM_NAME } from '@sp/shared';
import type { MatchState } from '@sp/shared/schema';
import { createServer } from '../app.ts';
import type { MatchRoom } from './MatchRoom.ts';

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await boot(createServer(), 2611);
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

  it('counts down, locks the room, then simulates validated movement', async () => {
    const { host, others, room, state } = await createLobby(['Host', 'Guest']);
    host.send(MSG.READY, { ready: true });
    others[0]!.send(MSG.READY, { ready: true });
    await waitFor(() => [...state.players.values()].every((p) => p.ready));

    host.send(MSG.START);
    await waitFor(() => state.phase === 'STARTING');
    expect(room.locked).toBe(true);
    await expect(colyseus.sdk.joinById(host.roomId, { nickname: 'Late' })).rejects.toThrow();

    await waitFor(() => state.phase === 'PLAYING', 5000);
    const me = state.players.get(host.sessionId)!;
    const startZ = me.z;
    host.send(MSG.MOVE, forwardBatch(1));
    host.send(MSG.MOVE, forwardBatch(4));
    await waitFor(() => me.lastSeq === 6);
    expect(me.z).toBeLessThan(startZ);

    // Malformed / oversized payloads are dropped without crashing the room.
    host.send(MSG.MOVE, { s: 7, i: [999, 0, 5] });
    host.send(MSG.MOVE, 'garbage');
    await room.waitForNextPatch();
    expect(me.lastSeq).toBe(6);

    // Host returns everyone to the lobby: room unlocks and ready flags reset.
    host.send(MSG.BACK_TO_LOBBY);
    await waitFor(() => state.phase === 'LOBBY');
    await waitFor(() => room.locked === false);
    expect([...state.players.values()].every((p) => !p.ready)).toBe(true);
  }, 15000);
});
