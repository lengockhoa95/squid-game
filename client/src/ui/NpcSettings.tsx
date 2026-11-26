import { DIFFICULTIES, MAX_PLAYERS, vi, type Difficulty } from '@sp/shared';
import { network } from '../network/NetworkManager.ts';
import { sessionStore } from '../network/sessionStore.ts';
import { useStore } from '../store/UIStore.ts';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  EASY: vi.difficultyEASY,
  NORMAL: vi.difficultyNORMAL,
  HARD: vi.difficultyHARD,
  SMART: vi.difficultySMART,
};

/** Host edits NPC count + per-NPC difficulty; everyone else sees it read-only. Server validates. */
export function NpcSettings({ editable }: { editable: boolean }) {
  const npcCount = useStore(sessionStore, (s) => s.npcCount);
  const difficulties = useStore(sessionStore, (s) => s.npcDifficulties);
  const humans = useStore(sessionStore, (s) => s.players.filter((p) => !p.isBot).length);
  const maxBots = Math.max(0, MAX_PLAYERS - humans);

  const send = (count: number, list: readonly Difficulty[]) => network.setNpcConfig({ count, difficulties: [...list] });
  const setDifficulty = (i: number, d: Difficulty) => {
    const next = [...difficulties];
    next[i] = d;
    send(npcCount, next);
  };

  return (
    <section className="npc-settings">
      <div className="npc-head">
        <h2>{vi.npcSettings}</h2>
        <div className="stepper" aria-label={vi.npcCount}>
          <button type="button" disabled={!editable || npcCount <= 0} onClick={() => send(npcCount - 1, difficulties)}>−</button>
          <span>{npcCount}</span>
          <button type="button" disabled={!editable || npcCount >= maxBots} onClick={() => send(npcCount + 1, difficulties)}>+</button>
        </div>
      </div>
      <p className="muted">{npcCount === 0 ? vi.npcNone : vi.npcAuto}</p>
      {Array.from({ length: npcCount }, (_, i) => (
        <div className="npc-row" key={i}>
          <span>NPC {i + 1}</span>
          <div className="segmented segmented-sm">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                disabled={!editable}
                className={difficulties[i] === d ? 'active' : ''}
                onClick={() => setDifficulty(i, d)}
              >
                {DIFFICULTY_LABEL[d]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
