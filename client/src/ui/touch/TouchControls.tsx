import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { vi } from '@sp/shared';
import type { GameEngine } from '../../core/GameEngine.ts';
import { touchStore } from '../../store/touch.ts';

const STICK_RADIUS = 60;
const TAP_MAX_MOVE = 12;
const TAP_MAX_MS = 280;

/**
 * Twin-stick touch controls (like mobile shooters):
 * left half — a floating joystick that appears under the thumb; right half — drag to turn the
 * camera, tap to use the element there; plus a jump button.
 */
export function TouchControls({ engine }: { engine: RefObject<GameEngine | null> }) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const stick = useRef<{ id: number; x: number; y: number } | null>(null);
  const look = useRef<{ id: number; x: number; y: number; startX: number; startY: number; t: number } | null>(null);

  /** A mouse/pen on a touch-capable laptop: go back to mouse controls. */
  const notTouch = (e: ReactPointerEvent): boolean => {
    if (e.pointerType === 'touch') return false;
    touchStore.set({ enabled: false });
    return true;
  };

  const onStickDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (notTouch(e) || stick.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    stick.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    if (base.current && knob.current) {
      base.current.style.display = 'block';
      base.current.style.left = `${e.clientX}px`;
      base.current.style.top = `${e.clientY}px`;
      knob.current.style.transform = 'translate(-50%, -50%)';
    }
  };
  const onStickMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stick.current;
    if (!s || s.id !== e.pointerId) return;
    let dx = e.clientX - s.x;
    let dy = e.clientY - s.y;
    const d = Math.hypot(dx, dy);
    if (d > STICK_RADIUS) {
      dx = (dx / d) * STICK_RADIUS;
      dy = (dy / d) * STICK_RADIUS;
    }
    engine.current?.setMoveStick(dx / STICK_RADIUS, -dy / STICK_RADIUS);
    if (knob.current) knob.current.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  };
  const onStickUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stick.current?.id !== e.pointerId) return;
    stick.current = null;
    engine.current?.setMoveStick(0, 0);
    if (base.current) base.current.style.display = 'none';
  };

  const onLookDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (notTouch(e) || look.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    look.current = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, t: performance.now() };
  };
  const onLookMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const l = look.current;
    if (!l || l.id !== e.pointerId) return;
    engine.current?.lookDrag(e.clientX - l.x, e.clientY - l.y);
    l.x = e.clientX;
    l.y = e.clientY;
  };
  const onLookUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const l = look.current;
    if (!l || l.id !== e.pointerId) return;
    look.current = null;
    const moved = Math.hypot(e.clientX - l.startX, e.clientY - l.startY);
    if (moved < TAP_MAX_MOVE && performance.now() - l.t < TAP_MAX_MS) engine.current?.tapAt(e.clientX, e.clientY);
  };

  return (
    <div className="touch-layer">
      <div
        className="touch-zone touch-left"
        onPointerDown={onStickDown}
        onPointerMove={onStickMove}
        onPointerUp={onStickUp}
        onPointerCancel={onStickUp}
      />
      <div
        className="touch-zone touch-right"
        onPointerDown={onLookDown}
        onPointerMove={onLookMove}
        onPointerUp={onLookUp}
        onPointerCancel={onLookUp}
      />
      <div ref={base} className="touch-stick" style={{ display: 'none' }}>
        <div ref={knob} className="touch-knob" />
      </div>
      <button
        type="button"
        className="touch-btn touch-jump"
        aria-label={vi.touchJump}
        onPointerDown={(e) => {
          e.preventDefault();
          engine.current?.jump();
        }}
      >
        {vi.touchJump}
      </button>
    </div>
  );
}
