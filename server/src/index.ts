import { GAME_NAME } from '@sp/shared';
import { SERVER_PORT, gamesFromEnv } from './config.ts';
import { createServer } from './app.ts';

const games = gamesFromEnv();
if (games) console.log(`SP_GAMES: only ${games.join(', ')}`);
const server = createServer({ games });
await server.listen(SERVER_PORT);
console.log(`[${GAME_NAME}] server listening on :${SERVER_PORT}`);
