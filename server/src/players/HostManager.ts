interface HostCandidate {
  id: string;
  joinOrder: number;
  isBot: boolean;
  connected: boolean;
}

/** Next host: earliest-joined connected human, else earliest-joined disconnected human, else ''. */
export function pickNextHost(players: Iterable<HostCandidate>): string {
  let best: HostCandidate | null = null;
  for (const p of players) {
    if (p.isBot) continue;
    if (
      !best ||
      (p.connected && !best.connected) ||
      (p.connected === best.connected && p.joinOrder < best.joinOrder)
    ) {
      best = p;
    }
  }
  return best ? best.id : '';
}

/** Lowest slot index not used by any player, or -1 if all `maxSlots` are taken. */
export function freeSlot(players: Iterable<{ slot: number }>, maxSlots: number): number {
  const used = new Set<number>();
  for (const p of players) used.add(p.slot);
  for (let s = 0; s < maxSlots; s++) if (!used.has(s)) return s;
  return -1;
}
