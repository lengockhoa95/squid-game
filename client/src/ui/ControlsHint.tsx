import { vi } from '@sp/shared';

export function ControlsHint() {
  return (
    <div className="controls-hint">
      <b>{vi.controlsTitle}</b>
      <span>{vi.controlClickMove}</span>
      <span>{vi.controlRightTap}</span>
      <span>{vi.controlRightDrag}</span>
      <span>{vi.controlWheel}</span>
      <span>{vi.controlMiddle}</span>
      <span>{vi.controlKeys}</span>
      <span>{vi.controlDebug}</span>
    </div>
  );
}
