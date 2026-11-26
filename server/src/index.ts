import { defineServer } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { GAME_NAME } from '@sp/shared';
import { SERVER_PORT } from './config.ts';

// Rooms are registered in Phase 2 (MatchRoom).
const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: {},
});

await server.listen(SERVER_PORT);
console.log(`[${GAME_NAME}] server listening on :${SERVER_PORT}`);
