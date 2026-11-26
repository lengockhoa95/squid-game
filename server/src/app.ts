import { defineServer, defineRoom } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '@sp/shared';
import { MatchRoom } from './rooms/MatchRoom.ts';

export function createServer() {
  return defineServer({
    transport: new WebSocketTransport(),
    rooms: {
      [ROOM_NAME]: defineRoom(MatchRoom),
    },
  });
}
