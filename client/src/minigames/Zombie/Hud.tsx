import { useRef } from 'react';
import { TEAM_HUMAN, TEAM_ZOMBIE, ZOMBIE, vi } from '@sp/shared';
import type { MatchNetAdapter } from '../../network/types.ts';
import { useAnimationFrame } from '../../ui/match/useAnimationFrame.ts';

export function ZombieHud({ net }: { net: MatchNetAdapter }) {
  const chip = useRef<HTMLDivElement>(null);
  const role = useRef<HTMLDivElement>(null);
  const last = useRef('');
  useAnimationFrame(() => {
    const state = net.getState();
    const me = state?.players.get(net.localId);
    if (!state || !me || !chip.current || !role.current) return;
    let humans = 0;
    state.players.forEach((p) => {
      if (p.alive && p.roundState === 'ACTIVE' && p.team === TEAM_HUMAN) humans++;
    });
    const t = net.gameTimeNow();
    const outbreakIn = Math.ceil(ZOMBIE.outbreakAt - t);
    const isZombie = me.team === TEAM_ZOMBIE;
    const text = `${outbreakIn > 0 ? `${vi.zombieOutbreakIn} ${outbreakIn}s` : `${vi.zombieHumansLeft}: ${humans}`}|${isZombie}`;
    if (text === last.current) return;
    last.current = text;
    chip.current.textContent = text.split('|')[0]!;
    role.current.textContent = isZombie ? vi.zombieYouAre : vi.zombieYouHuman;
    role.current.className = `zombie-role ${isZombie ? 'is-zombie' : ''}`;
  });
  return (
    <div className="game-hud game-hud-center">
      <div ref={role} className="zombie-role" />
      <div ref={chip} className="hud-chip" />
    </div>
  );
}
