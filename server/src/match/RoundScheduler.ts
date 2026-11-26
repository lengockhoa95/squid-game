import { MINIGAMES, MINIGAME_IDS, type MinigameId } from '@sp/shared';

/** A match has 3–5 minigames (it may end earlier when one player is left). */
export function planRoundCount(rng: () => number): number {
  return 3 + Math.floor(rng() * 3);
}

/**
 * Choose the next minigame: never the same as the previous one, team games only with an even
 * number of players, and unplayed games first.
 */
export function pickNextGame(
  rng: () => number,
  aliveCount: number,
  history: readonly MinigameId[],
  available: readonly MinigameId[] = MINIGAME_IDS,
): MinigameId {
  const prev = history[history.length - 1];
  const fits = (id: MinigameId) => !MINIGAMES[id].needsEvenPlayers || aliveCount % 2 === 0;
  let eligible = available.filter((id) => id !== prev && fits(id));
  if (eligible.length === 0) eligible = available.filter(fits); // only one game available: allow a repeat
  const fresh = eligible.filter((id) => !history.includes(id));
  const pool = fresh.length > 0 ? fresh : eligible;
  return pool[Math.floor(rng() * pool.length)]!;
}
