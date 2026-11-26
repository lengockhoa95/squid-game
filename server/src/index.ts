import { GAME_NAME } from '@sp/shared';
import { SERVER_PORT } from './config.ts';
import { createServer } from './app.ts';

const server = createServer();
await server.listen(SERVER_PORT);
console.log(`[${GAME_NAME}] server listening on :${SERVER_PORT}`);
