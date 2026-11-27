import type { CSSProperties } from 'react';
import { CARDS, CARD_MAX_LEVEL, isCardId, parseCards, vi, type CardId } from '@sp/shared';
import type { MatchNetAdapter } from '../network/types.ts';
import { sessionStore } from '../network/sessionStore.ts';
import { useStore } from '../store/UIStore.ts';
import { audio } from '../audio/AudioManager.ts';

function useMe() {
  return useStore(sessionStore, (s) => s.players.find((p) => p.id === s.myId));
}

function Pips({ level }: { level: number }) {
  return (
    <span className="card-pips" aria-label={`${vi.cardLevel} ${level}`}>
      {Array.from({ length: CARD_MAX_LEVEL }, (_, i) => <i key={i} className={i < level ? 'on' : ''} />)}
    </span>
  );
}

/** Round result: pick one of the offered cards. */
export function CardDraft({ net }: { net: MatchNetAdapter }) {
  const me = useMe();
  const enabled = useStore(sessionStore, (s) => s.cardsEnabled);
  if (!enabled || !me || !me.alive || !me.cardOffer) return null;
  const owned = parseCards(me.cards);
  const offer = me.cardOffer.split(',').filter(isCardId);
  return (
    <div className="card-draft">
      <span className="eyebrow">{vi.cardPick}</span>
      {offer.length > 3 && <small className="card-bonus">{vi.cardPickLast}</small>}
      <div className="card-options">
        {offer.map((id) => {
          const info = CARDS[id];
          const now = owned[id] ?? 0;
          const next = now + 1;
          return (
            <button
              key={id}
              type="button"
              className={`skill-card ${next === CARD_MAX_LEVEL ? 'is-awaken' : ''}`}
              style={{ '--card': info.color } as CSSProperties}
              onClick={() => {
                audio.play(next === CARD_MAX_LEVEL ? 'win' : 'pass');
                net.pickCard(id);
              }}
            >
              <span className="card-tag">{next === CARD_MAX_LEVEL ? vi.cardAwaken : now > 0 ? vi.cardUpgrade : vi.cardNew}</span>
              <span className="card-glyph">{info.glyph}</span>
              <strong>{info.name}</strong>
              <Pips level={next} />
              <small>{info.levels[next - 1]}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** In match: my cards with levels, plus lives left this round. */
export function CardBar() {
  const me = useMe();
  const enabled = useStore(sessionStore, (s) => s.cardsEnabled);
  if (!enabled || !me || !me.cards) return null;
  const owned = parseCards(me.cards);
  return (
    <div className="card-bar">
      {(Object.keys(owned) as CardId[]).map((id) => {
        const info = CARDS[id];
        const level = owned[id] ?? 0;
        return (
          <span
            key={id}
            className={`card-chip ${level >= CARD_MAX_LEVEL ? 'is-awakened' : ''}`}
            style={{ '--card': info.color } as CSSProperties}
            title={`${info.name} · ${info.levels[level - 1]}`}
          >
            <b>{info.glyph}</b>
            <Pips level={level} />
          </span>
        );
      })}
      {me.lives > 0 && <span className="card-lives" title={vi.lives}>{'♥'.repeat(me.lives)}</span>}
    </div>
  );
}

export function AnnounceBanner() {
  const text = useStore(sessionStore, (s) => s.announce);
  if (!text) return null;
  return <div className="announce" key={text}>{text}</div>;
}
