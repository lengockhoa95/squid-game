import { useState, type FormEvent } from 'react';
import { normalizeRoomCode, NICKNAME_MAX, ROOM_CODE_LENGTH, vi } from '@sp/shared';
import { network } from '../network/NetworkManager.ts';
import { sessionStore } from '../network/sessionStore.ts';
import { profileStore } from '../store/profile.ts';
import { useStore } from '../store/UIStore.ts';
import { SettingsPanel } from './SettingsPanel.tsx';

export function HomeScreen({ onEnterPlayground }: { onEnterPlayground: () => void }) {
  const nickname = useStore(profileStore, (s) => s.nickname);
  const status = useStore(sessionStore, (s) => s.status);
  const error = useStore(sessionStore, (s) => s.error);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const busy = status === 'connecting';

  const create = () => {
    void network.createRoom(nickname).catch(() => undefined);
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeRoomCode(code);
    if (!normalized) {
      setCodeError(vi.errInvalidCode);
      return;
    }
    setCodeError(null);
    void network.joinRoom(normalized, nickname).catch(() => undefined);
  };

  return (
    <main className="home">
      <div className="home-card">
        <h1 className="logo">
          <span>SURVIVAL</span>
          <span className="logo-accent">PARTY</span>
        </h1>
        <p className="tagline">{vi.tagline}</p>

        <label className="field">
          <span className="field-label">{vi.nickname}</span>
          <input
            className="input"
            value={nickname}
            maxLength={NICKNAME_MAX}
            placeholder={vi.nicknamePlaceholder}
            onChange={(e) => profileStore.set({ nickname: e.target.value })}
          />
        </label>

        <button type="button" className="btn btn-primary" disabled={busy} onClick={create}>
          {busy ? vi.connecting : vi.createRoom}
        </button>

        <div className="divider"><span>{vi.orDivider}</span></div>

        <form className="join-row" onSubmit={join}>
          <input
            className="input input-code"
            value={code}
            maxLength={ROOM_CODE_LENGTH}
            placeholder={vi.roomCodePlaceholder}
            aria-label={vi.roomCode}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button type="submit" className="btn btn-secondary" disabled={busy}>{vi.joinRoom}</button>
        </form>

        {(codeError ?? error) && <p className="error-text" role="alert">{codeError ?? error}</p>}

        <button type="button" className="btn btn-link" onClick={onEnterPlayground}>{vi.offlinePlayground}</button>

        <section className="card-section">
          <h2>{vi.settings}</h2>
          <SettingsPanel />
        </section>
      </div>
    </main>
  );
}
