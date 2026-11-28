import { MINIGAMES, vi } from '@sp/shared';
import { sessionStore } from '../network/sessionStore.ts';
import { useStore } from '../store/UIStore.ts';

export function ControlsHint() {
  const game = useStore(sessionStore, (s) => s.currentGame);
  const combat = game !== '' && MINIGAMES[game].combat === true;
  return (
    <div className="controls-hint">
      <b>{vi.controlsTitle}</b>
      <span>{vi.controlClickMove}</span>
      <span>{combat ? vi.controlCombatLeft : vi.controlRightTap}</span>
      <span>{vi.controlRightDrag}</span>
      <span>{vi.controlWheel}</span>
      <span>{combat ? vi.controlCombatRight : vi.controlMiddle}</span>
      <span>{vi.controlKeys}</span>
      <span>{vi.controlElement}</span>
      <span>{vi.controlDebug}</span>
    </div>
  );
}
