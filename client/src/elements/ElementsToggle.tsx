import { vi } from '@sp/shared';
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
  return (
    <>
      <section className="npc-settings elements-toggle">
        <div className="npc-head">
          <h2>{vi.elementsMode}</h2>
          <OnOff value={elements} editable={editable} onChange={(v) => network.setElementsEnabled(v)} label={vi.elementsMode} />
        </div>
        <p className="muted">{vi.elementsModeDesc}</p>
      </section>
      <section className="npc-settings no-elim-toggle">
        <div className="npc-head">
          <h2>{vi.noElimMode}</h2>
          <OnOff value={noElim} editable={editable} onChange={(v) => network.setNoElimination(v)} label={vi.noElimMode} />
        </div>
        <p className="muted">{noElim ? vi.noElimModeDesc : vi.classicModeDesc}</p>
      </section>
    </>
  );
}
