import { CHARACTER_IDS, CHARACTER_NAMES, characterFor, vi } from '@sp/shared';
import { network } from '../network/NetworkManager.ts';
import { sessionStore } from '../network/sessionStore.ts';
import { useStore } from '../store/UIStore.ts';
import { characterPreview } from '../player/characters.ts';
import { audio } from '../audio/AudioManager.ts';

/** Lobby: pick your character (Kenney Mini Characters). Others' picks are marked. */
export function CharacterPicker() {
  const players = useStore(sessionStore, (s) => s.players);
  const myId = useStore(sessionStore, (s) => s.myId);
  const me = players.find((p) => p.id === myId);
  if (!me) return null;
  const mine = characterFor(me.character, me.slot);
  const takenBy = new Map(players.filter((p) => p.id !== myId).map((p) => [characterFor(p.character, p.slot), p.nickname]));
  return (
    <section className="npc-settings character-picker">
      <h2>{vi.characterPick}</h2>
      <div className="char-grid">
        {CHARACTER_IDS.map((id) => {
          const owner = takenBy.get(id);
          return (
            <button
              key={id}
              type="button"
              className={`char-option ${id === mine ? 'is-picked' : ''} ${owner ? 'is-taken' : ''}`}
              title={owner ? `${CHARACTER_NAMES[id]} · ${owner}` : CHARACTER_NAMES[id]}
              aria-pressed={id === mine}
              onClick={() => {
                audio.play('click');
                network.setCharacter(id);
              }}
            >
              <img src={characterPreview(id)} alt="" width={48} height={48} />
              <span>{CHARACTER_NAMES[id]}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
