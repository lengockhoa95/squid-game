import { MINIGAME_IDS, type MinigameId } from '@sp/shared';

export const SERVER_PORT = Number(process.env.PORT ?? 2567);

/** Testing aid: SP_GAMES=RLGL,OBSTACLE_RACE limits which minigames are scheduled (unset = all). */
export function gamesFromEnv(raw = process.env.SP_GAMES): MinigameId[] | undefined {
  if (!raw) return undefined;
  const ids = raw.split(',').map((s) => s.trim()).filter((s): s is MinigameId => (MINIGAME_IDS as readonly string[]).includes(s));
  return ids.length > 0 ? ids : undefined;
}
