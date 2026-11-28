import { CASTLE_WAVE_OPTIONS, ELEMENTS, ELEMENT_IDS, MINIGAMES, MINIGAME_IDS, vi } from '@sp/shared';
import type { CSSProperties } from 'react';
import { network } from '../network/NetworkManager.ts';
import { sessionStore } from '../network/sessionStore.ts';
import { useStore } from '../store/UIStore.ts';

function OnOff({ value, editable, onChange, label }: { value: boolean; editable: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <div className="segmented segmented-sm" role="group" aria-label={label}>
      <button type="button" className={value ? 'active' : ''} disabled={!editable} onClick={() => onChange(true)}>{vi.elementsOn}</button>
      <button type="button" className={!value ? 'active' : ''} disabled={!editable} onClick={() => onChange(false)}>{vi.elementsOff}</button>
    </div>
  );
}

/** Lobby: match modes (host edits; everyone sees the settings). */
export function ElementsToggle({ editable }: { editable: boolean }) {
  const elements = useStore(sessionStore, (s) => s.elementsEnabled);
  const noElim = useStore(sessionStore, (s) => s.noElimination);
  const cards = useStore(sessionStore, (s) => s.cardsEnabled);
  const offGames = useStore(sessionStore, (s) => s.disabledGames);
  const offElements = useStore(sessionStore, (s) => s.disabledElements);
  const castleWaves = useStore(sessionStore, (s) => s.castleWaves);
  const lastGame = offGames.length >= MINIGAME_IDS.length - 1;
  return (
    <>
      <section className="npc-settings pool-games">
        <h2>{vi.poolGames}</h2>
        <p className="muted">{vi.poolGamesDesc}</p>
        <div className="pool-chips">
          {MINIGAME_IDS.map((id) => {
            const on = !offGames.includes(id);
            return (
              <button
                key={id}
                type="button"
                className={`pool-chip ${on ? 'is-on' : ''}`}
                aria-pressed={on}
                disabled={!editable || (on && lastGame)}
                onClick={() => network.setGameEnabled(id, !on)}
              >
                <span className="pool-check" aria-hidden="true">{on ? '✓' : ''}</span>
                {MINIGAMES[id].title}
              </button>
            );
          })}
        </div>
        {!offGames.includes('CASTLE') && (
          <div className="npc-head castle-waves">
            <span>{vi.castleWavesSetting}</span>
            <div className="segmented segmented-sm" role="group" aria-label={vi.castleWavesSetting}>
              {CASTLE_WAVE_OPTIONS.map((n) => (
                <button key={n} type="button" className={castleWaves === n ? 'active' : ''} disabled={!editable} onClick={() => network.setCastleWaves(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
      <section className="npc-settings elements-toggle">
        <div className="npc-head">
          <h2>{vi.elementsMode}</h2>
          <OnOff value={elements} editable={editable} onChange={(v) => network.setElementsEnabled(v)} label={vi.elementsMode} />
        </div>
        <p className="muted">{vi.elementsModeDesc}</p>
        {elements && (
          <div className="pool-chips" aria-label={vi.poolElements}>
            {ELEMENT_IDS.map((id) => {
              const on = !offElements.includes(id);
              const info = ELEMENTS[id];
              return (
                <button
                  key={id}
                  type="button"
                  className={`pool-chip ${on ? 'is-on' : ''}`}
                  style={{ '--el': info.color } as CSSProperties}
                  aria-pressed={on}
                  title={info.desc}
                  disabled={!editable}
                  onClick={() => network.setElementEnabled(id, !on)}
                >
                  <span className="pool-check" aria-hidden="true">{on ? '✓' : ''}</span>
                  {info.name}
                </button>
              );
            })}
          </div>
        )}
      </section>
      <section className="npc-settings no-elim-toggle">
        <div className="npc-head">
          <h2>{vi.noElimMode}</h2>
          <OnOff value={noElim} editable={editable} onChange={(v) => network.setNoElimination(v)} label={vi.noElimMode} />
        </div>
        <p className="muted">{noElim ? vi.noElimModeDesc : vi.classicModeDesc}</p>
      </section>
      <section className="npc-settings cards-toggle">
        <div className="npc-head">
          <h2>{vi.cardsMode}</h2>
          <OnOff value={cards} editable={editable} onChange={(v) => network.setCardsEnabled(v)} label={vi.cardsMode} />
        </div>
        <p className="muted">{vi.cardsModeDesc}</p>
      </section>
    </>
  );
}
