export interface EliminationInput {
  /** Ids still in the match that took part in the round. */
  alive: readonly string[];
  /** All participants, best first. */
  ranking: readonly string[];
  passed: ReadonlySet<string>;
  /** Planned rounds remaining after this one (0 = this was the final round). */
  roundsLeftAfter: number;
}

/**
 * Decide who is eliminated after a round:
 * - players who failed the round are out;
 * - the final round leaves exactly one winner (best-ranked);
 * - nobody is eliminated if that would empty the match (best-ranked survives);
 * - before the final round at least two players remain (best-ranked failures are spared);
 * - if everyone passed but there are not enough rounds left to reach one winner, the last-ranked is out.
 */
export function decideEliminations(input: EliminationInput): string[] {
  const { alive, ranking, passed, roundsLeftAfter } = input;
  const order = ranking.filter((id) => alive.includes(id));
  const best = order[0];
  if (alive.length <= 1 || best === undefined) return [];

  if (roundsLeftAfter <= 0) return order.slice(1);

  let out = order.filter((id) => !passed.has(id));
  if (out.length >= alive.length) out = order.slice(1);
  // Before the final round, keep at least two players so the match continues to a real final:
  // the best-ranked of the failing players are spared (they are the last entries removed).
  if (alive.length >= 3 && out.length > alive.length - 2) out = out.slice(out.length - (alive.length - 2));
  // Each remaining round (the final included) removes at least one player, so we need
  // (alive - 1) <= roundsLeftAfter + eliminatedNow to still finish with a single winner.
  if (out.length === 0 && alive.length - 1 > roundsLeftAfter) out = [order[order.length - 1]!];
  return out;
}
