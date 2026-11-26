import { vi } from '@sp/shared';
import { network } from '../network/NetworkManager.ts';
import { sessionStore } from '../network/sessionStore.ts';
import { useStore } from '../store/UIStore.ts';

/** Lobby: element mode on/off (host only; everyone sees the setting). */
export function ElementsToggle({ editable }: { editable: boolean }) {
  const enabled = useStore(sessionStore, (s) => s.elementsEnabled);
  return (
    <section className="npc-settings elements-toggle">
      <div className="npc-head">
        <h2>{vi.elementsMode}</h2>
        <div className="segmented segmented-sm" role="group" aria-label={vi.elementsMode}>
          <button type="button" className={enabled ? 'active' : ''} disabled={!editable} onClick={() => network.setElementsEnabled(true)}>
            {vi.elementsOn}
          </button>
          <button type="button" className={!enabled ? 'active' : ''} disabled={!editable} onClick={() => network.setElementsEnabled(false)}>
            {vi.elementsOff}
          </button>
        </div>
      </div>
      <p className="muted">{vi.elementsModeDesc}</p>
    </section>
  );
}
