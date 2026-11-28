import { useRef, type CSSProperties } from 'react';
import { ELEMENTS, MINIGAMES, elementsFor, isElementId, vi, type ElementId } from '@sp/shared';
import type { MatchNetAdapter, NetPlayer } from '../network/types.ts';
import { sessionStore } from '../network/sessionStore.ts';
import { useStore } from '../store/UIStore.ts';
import { useAnimationFrame } from '../ui/match/useAnimationFrame.ts';
import { audio } from '../audio/AudioManager.ts';
import { elementUi } from './elementUi.ts';
import { touchStore } from '../store/touch.ts';
import { CAST_AT_CROSSHAIR_EVENT } from '../core/GameEngine.ts';

function useMyElement(): ElementId | null {
  const el = useStore(sessionStore, (s) => s.players.find((p) => p.id === s.myId)?.element ?? '');
  return isElementId(el) ? el : null;
}

function localPlayer(net: MatchNetAdapter): NetPlayer | null {
  let me: NetPlayer | null = null;
  net.forEachPlayer((p) => {
    if (p.id === net.localId) me = p;
  });
  return me;
}

/** Round intro / countdown: choose this round's element. */
export function ElementPicker({ net }: { net: MatchNetAdapter }) {
  const enabled = useStore(sessionStore, (s) => s.elementsEnabled);
  const game = useStore(sessionStore, (s) => s.currentGame);
  const alive = useStore(sessionStore, (s) => s.players.find((p) => p.id === s.myId)?.alive ?? false);
  const off = useStore(sessionStore, (s) => s.disabledElements);
  const mine = useMyElement();
  if (!enabled || !game || !alive) return null;
  const movement = MINIGAMES[game].movement;
  const combat = MINIGAMES[game].combat === true;
  const list = elementsFor(game, movement).filter((id) => !off.includes(id));
  if (list.length === 0) return <div className="element-picker"><small className="muted">{vi.elementNoneHere}</small></div>;
  return (
    <div className="element-picker">
      <span className="eyebrow">{vi.elementPick}</span>
      <div className="element-options">
        {list.map((id) => {
          const info = ELEMENTS[id];
          return (
            <button
              key={id}
              type="button"
              className={`element-option ${mine === id ? 'is-picked' : ''}`}
              style={{ '--el': info.color } as CSSProperties}
              title={combat ? info.descPve : movement ? info.desc : info.descAction ?? info.desc}
              onClick={() => {
                audio.play('click');
                net.pickElement(id);
              }}
            >
              <span className="element-glyph">{info.glyph}</span>
              <span className="element-name">{info.name}</span>
              <small>{combat ? info.descPve : movement ? info.desc : info.descAction ?? info.desc}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** While playing: the cast button with cooldown, plus the darkness overlay when blinded. */
export function ElementBar({ net }: { net: MatchNetAdapter }) {
  const enabled = useStore(sessionStore, (s) => s.elementsEnabled);
  const game = useStore(sessionStore, (s) => s.currentGame);
  const aiming = useStore(elementUi, (s) => s.aiming);
  const active = useStore(sessionStore, (s) => {
    const me = s.players.find((p) => p.id === s.myId);
    return !!me && me.alive && me.roundState === 'ACTIVE';
  });
  const mine = useMyElement();
  const btn = useRef<HTMLButtonElement>(null);
  const cd = useRef<HTMLSpanElement>(null);
  const dark = useRef<HTMLDivElement>(null);
  const stun = useRef<HTMLDivElement>(null);
  const lastText = useRef('');

  useAnimationFrame(() => {
    const me = localPlayer(net);
    const t = net.gameTimeNow();
    if (dark.current) {
      const left = me ? me.blindUntil - t : 0;
      dark.current.style.opacity = left > 0 ? String(Math.min(1, left * 2)) : '0';
    }
    if (stun.current) stun.current.style.display = me && t < me.stunUntil ? '' : 'none';
    if (!btn.current || !cd.current || !me) return;
    const wait = Math.max(me.elementReadyAt - t, me.stunUntil - t, 0);
    const text = wait > 0 ? `${Math.ceil(wait)}s` : vi.elementReady;
    if (text !== lastText.current) {
      lastText.current = text;
      cd.current.textContent = text;
      btn.current.classList.toggle('is-cooling', wait > 0);
    }
  });

  const movement = game ? MINIGAMES[game].movement : false;
  const info = mine ? ELEMENTS[mine] : null;
  return (
    <>
      <div ref={dark} className="dark-overlay" style={{ opacity: 0 }} />
      <div ref={stun} className="stun-banner" style={{ display: 'none' }}>{vi.elementStunned}</div>
      {enabled && info && active && (
        <div className="element-bar">
          <button
            ref={btn}
            type="button"
            className={`element-cast ${aiming ? 'is-aiming' : ''}`}
            style={{ '--el': info.color } as CSSProperties}
            onClick={() => {
              // Touch: there is no cursor — use the element at the crosshair right away.
              if (touchStore.get().enabled) window.dispatchEvent(new Event(CAST_AT_CROSSHAIR_EVENT));
              else if (movement && info.aim === 'point') elementUi.set({ aiming: !elementUi.get().aiming });
              else net.sendCast(0, 0);
            }}
          >
            <span className="element-glyph">{info.glyph}</span>
            <span className="element-name">{info.name}</span>
            <span ref={cd} className="element-cd">{vi.elementReady}</span>
          </button>
          <small className="element-hint">{aiming ? vi.elementAiming : game !== '' && MINIGAMES[game].combat ? vi.elementHintCombat : vi.elementHint}</small>
        </div>
      )}
    </>
  );
}
