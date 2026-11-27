import { classifyRightGesture } from './inputMath.ts';

export interface InputHandlers {
  /** Left click / left drag on the 3D view. Coordinates are normalized device coords (-1..1). */
  onGroundPoint(ndcX: number, ndcY: number): void;
  onStop(): void;
  onJump(): void;
  onCameraRotate(dx: number, dy: number): void;
  onZoom(steps: number): void;
  onToggleDebug(): void;
  /** Any game key pressed (not repeated). */
  onKeyPress(code: string): void;
}

const FORWARD_KEYS = ['KeyW', 'ArrowUp'];
const BACK_KEYS = ['KeyS', 'ArrowDown'];
const LEFT_KEYS = ['KeyA', 'ArrowLeft'];
const RIGHT_KEYS = ['KeyD', 'ArrowRight'];
const GAME_KEYS = new Set([
  ...FORWARD_KEYS, ...BACK_KEYS, ...LEFT_KEYS, ...RIGHT_KEYS,
  'Space', 'KeyQ', 'KeyE', 'KeyX', 'KeyF', 'F3', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract',
]);

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/**
 * Mouse-first input with keyboard always available in parallel.
 * - Left click / hold+drag: set click-to-move target
 * - Right tap: stop · Right drag: rotate camera
 * - Middle click / Space: jump · Wheel / +/-: zoom
 * - WASD/arrows: move (camera-relative) · Q/E: rotate camera · X: stop · F3: debug
 * Listeners attach to the host element (not the canvas) so recreating the renderer keeps input working.
 */
export class InputManager {
  private readonly host: HTMLElement;
  private readonly handlers: InputHandlers;
  private readonly keys = new Set<string>();
  private leftDown = false;
  private rightDown = false;
  private rightTotalDx = 0;
  private rightTotalDy = 0;
  private rightDragging = false;
  private enabled = true;
  /** Last pointer position over the view in NDC (for "cast at cursor"). */
  readonly pointer = { x: 0, y: 0, valid: false };

  constructor(host: HTMLElement, handlers: InputHandlers) {
    this.host = host;
    this.handlers = handlers;
    host.addEventListener('pointerdown', this.onPointerDown);
    host.addEventListener('pointermove', this.onPointerMove);
    host.addEventListener('pointerup', this.onPointerUp);
    host.addEventListener('pointercancel', this.onPointerCancel);
    host.addEventListener('contextmenu', this.onContextMenu);
    host.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.reset();
  }

  /** Forward/right axes from the keyboard, each in -1..1. */
  getKeyAxes(out: { fwd: number; right: number }): void {
    out.fwd = (this.anyDown(FORWARD_KEYS) ? 1 : 0) - (this.anyDown(BACK_KEYS) ? 1 : 0);
    out.right = (this.anyDown(RIGHT_KEYS) ? 1 : 0) - (this.anyDown(LEFT_KEYS) ? 1 : 0);
  }

  /** -1 (Q), 0, 1 (E) */
  getKeyRotate(): number {
    return (this.keys.has('KeyQ') ? 1 : 0) - (this.keys.has('KeyE') ? 1 : 0);
  }

  get isRightDragging(): boolean {
    return this.rightDragging;
  }

  dispose(): void {
    const h = this.host;
    h.removeEventListener('pointerdown', this.onPointerDown);
    h.removeEventListener('pointermove', this.onPointerMove);
    h.removeEventListener('pointerup', this.onPointerUp);
    h.removeEventListener('pointercancel', this.onPointerCancel);
    h.removeEventListener('contextmenu', this.onContextMenu);
    h.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.reset();
  }

  private anyDown(codes: readonly string[]): boolean {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  private reset(): void {
    this.keys.clear();
    this.leftDown = false;
    this.rightDown = false;
    this.rightDragging = false;
  }

  private emitGroundPoint(e: PointerEvent): void {
    const rect = this.host.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.handlers.onGroundPoint(ndcX, ndcY);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    const onView = e.target === this.host || e.target instanceof HTMLCanvasElement;
    if (!this.enabled || !onView) return;
    if (e.button === 0) {
      this.leftDown = true;
      this.host.setPointerCapture(e.pointerId);
      this.emitGroundPoint(e);
    } else if (e.button === 2) {
      this.rightDown = true;
      this.rightDragging = false;
      this.rightTotalDx = 0;
      this.rightTotalDy = 0;
      this.host.setPointerCapture(e.pointerId);
    } else if (e.button === 1) {
      e.preventDefault(); // suppress autoscroll (jump is Space: the mouse is for elements only)
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const rect = this.host.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.pointer.valid = true;
    }
    if (!this.enabled) return;
    if (this.rightDown) {
      this.rightTotalDx += e.movementX;
      this.rightTotalDy += e.movementY;
      if (!this.rightDragging && classifyRightGesture(this.rightTotalDx, this.rightTotalDy) === 'drag') {
        this.rightDragging = true;
      }
      if (this.rightDragging) this.handlers.onCameraRotate(e.movementX, e.movementY);
    }
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.button === 0) this.leftDown = false;
    if (e.button === 2 && this.rightDown) {
      if (!this.rightDragging && this.enabled) this.handlers.onStop();
      this.rightDown = false;
      this.rightDragging = false;
    }
    if (this.host.hasPointerCapture(e.pointerId)) this.host.releasePointerCapture(e.pointerId);
  };

  private readonly onPointerCancel = (): void => {
    this.leftDown = false;
    this.rightDown = false;
    this.rightDragging = false;
  };

  private readonly onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.enabled) return;
    e.preventDefault();
    this.handlers.onZoom(Math.sign(e.deltaY));
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled || isTypingTarget(e.target) || !GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    if (e.code === 'F3') {
      if (!e.repeat) this.handlers.onToggleDebug();
      return;
    }
    if (e.repeat) return;
    this.keys.add(e.code);
    this.handlers.onKeyPress(e.code);
    if (e.code === 'Space') this.handlers.onJump();
    else if (e.code === 'KeyX') this.handlers.onStop();
    else if (e.code === 'Equal' || e.code === 'NumpadAdd') this.handlers.onZoom(-1);
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.handlers.onZoom(1);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.reset();
  };
}
