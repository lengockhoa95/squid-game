import { useState } from 'react';
import { MAX_PLAYERS, vi } from '@sp/shared';
import { network } from '../network/NetworkManager.ts';
import { sessionStore, type LobbyPlayer } from '../network/sessionStore.ts';
import { useStore } from '../store/UIStore.ts';
import { Avatar } from './Avatar.tsx';
import { NpcSettings, DIFFICULTY_LABEL } from './NpcSettings.tsx';
import { ElementsToggle } from '../elements/ElementsToggle.tsx';

function PlayerCard({ p, isHost, isMe }: { p: LobbyPlayer; isHost: boolean; isMe: boolean }) {
  return (
    <li className={`slot-card ${p.ready ? 'is-ready' : ''}`}>
      <Avatar slot={p.slot} name={p.nickname} />
      <div className="slot-info">
        <div className="slot-name">
          {p.nickname}
          {isMe && <span className="tag tag-me">{vi.you}</span>}
          {isHost && <span className="tag tag-host">{vi.host}</span>}
        </div>
        <div className="slot-meta">
          <span className={`dot ${p.connected ? 'dot-on' : 'dot-off'}`} />
          {p.connected ? vi.connected : vi.disconnected}
          <span className="sep">·</span>
          {p.isBot ? vi.bot : vi.human}
        </div>
      </div>
      <span className={`ready-badge ${p.ready ? 'on' : ''}`}>{p.ready ? vi.ready : vi.notReady}</span>
    </li>
  );
}

export function LobbyScreen() {
  const roomCode = useStore(sessionStore, (s) => s.roomCode);
  const players = useStore(sessionStore, (s) => s.players);
  const hostId = useStore(sessionStore, (s) => s.hostId);
  const myId = useStore(sessionStore, (s) => s.myId);
  const [copied, setCopied] = useState(false);

  const me = players.find((p) => p.id === myId);
  const amHost = myId === hostId;
  const allReady = players.length > 0 && players.every((p) => p.isBot || p.ready);
  const npcCount = useStore(sessionStore, (s) => s.npcCount);
  const npcDifficulties = useStore(sessionStore, (s) => s.npcDifficulties);
  const plannedBots = Math.min(npcCount, MAX_PLAYERS - players.length);
  const emptySlots = Math.max(0, MAX_PLAYERS - players.length - plannedBots);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked (e.g. insecure context): the code is still visible to copy by hand
    }
  };

  return (
    <main className="home">
      <div className="home-card lobby-card">
        <h2>{vi.lobbyTitle}</h2>
        <div className="code-box">
          <span className="code-label">{vi.roomCode}</span>
          <strong className="code-value">{roomCode}</strong>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy()}>
            {copied ? vi.copied : vi.copyCode}
          </button>
        </div>
        <p className="muted">{vi.shareHint}</p>

        <ul className="slots">
          {players.map((p) => (
            <PlayerCard key={p.id} p={p} isHost={p.id === hostId} isMe={p.id === myId} />
          ))}
          {Array.from({ length: plannedBots }, (_, i) => (
            <li key={`bot-${i}`} className="slot-card slot-bot">
              <div className="avatar avatar-bot" aria-hidden="true"><span>AI</span></div>
              <div className="slot-info">
                <div className="slot-name">NPC {i + 1}<span className="tag tag-bot">{vi.bot}</span></div>
                <div className="slot-meta">{vi.npcPreview} · {DIFFICULTY_LABEL[npcDifficulties[i] ?? 'NORMAL']}</div>
              </div>
            </li>
          ))}
          {Array.from({ length: emptySlots }, (_, i) => (
            <li key={`empty-${i}`} className="slot-card slot-empty">{vi.waitingSlot}</li>
          ))}
        </ul>

        <NpcSettings editable={amHost} />
        <ElementsToggle editable={amHost} />

        <div className="lobby-actions">
          <button
            type="button"
            className={`btn ${me?.ready ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => network.setReady(!me?.ready)}
          >
            {me?.ready ? vi.unsetReady : vi.setReady}
          </button>
          {amHost ? (
            <button type="button" className="btn btn-primary" disabled={!allReady} onClick={() => network.start()}>
              {allReady ? vi.startGame : vi.waitAllReady}
            </button>
          ) : (
            <p className="muted">{vi.waitHost}</p>
          )}
        </div>
        <button type="button" className="btn btn-link" onClick={() => void network.leave()}>{vi.leaveRoom}</button>
      </div>
    </main>
  );
}
