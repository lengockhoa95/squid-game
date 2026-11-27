import { MINIGAMES, vi } from '@sp/shared';
import { network } from '../../network/NetworkManager.ts';
import { sessionStore } from '../../network/sessionStore.ts';
import { useStore } from '../../store/UIStore.ts';
import { Avatar } from '../Avatar.tsx';

function useGameInfo() {
  const game = useStore(sessionStore, (s) => s.currentGame);
  return game ? MINIGAMES[game] : null;
}

export function RoundHeader() {
  const info = useGameInfo();
  const round = useStore(sessionStore, (s) => s.roundIndex);
  const total = useStore(sessionStore, (s) => s.totalRounds);
  const phase = useStore(sessionStore, (s) => s.phase);
  const timer = useStore(sessionStore, (s) => s.timerSeconds);
  if (!info || phase === 'MATCH_END') return null;
  return (
    <div className="round-header">
      <span className="round-index">{vi.round} {round}/{total}</span>
      <strong>{info.title}</strong>
      {phase === 'ROUND_PLAYING' && <span className={`round-timer ${timer <= 5 ? 'is-low' : ''}`}>{timer}s</span>}
    </div>
  );
}

export function RulesCard() {
  const info = useGameInfo();
  const timer = useStore(sessionStore, (s) => s.timerSeconds);
  if (!info) return null;
  return (
    <div className="overlay-card rules-card">
      <span className="eyebrow">{vi.rulesTitle}</span>
      <h2 className="card-title">{info.title}</h2>
      <ul>
        {info.rules.map((r) => <li key={r}>{r}</li>)}
      </ul>
      <p className="muted">{vi.getReady} {timer}s</p>
    </div>
  );
}

export function CountdownOverlay() {
  const timer = useStore(sessionStore, (s) => s.timerSeconds);
  return (
    <div className="countdown" key={timer}>
      <span>{timer > 0 ? timer : vi.countdownGo}</span>
    </div>
  );
}

export function ResultsCard() {
  const results = useStore(sessionStore, (s) => s.results);
  const timer = useStore(sessionStore, (s) => s.timerSeconds);
  const players = useStore(sessionStore, (s) => s.players);
  const myId = useStore(sessionStore, (s) => s.myId);
  const aliveCount = players.filter((p) => p.alive).length;
  const round = useStore(sessionStore, (s) => s.roundIndex);
  const total = useStore(sessionStore, (s) => s.totalRounds);
  const isLast = aliveCount <= 1 || round >= total;
  const noElim = useStore(sessionStore, (s) => s.noElimination);
  return (
    <div className="overlay-card results-card">
      <h2 className="card-title">{vi.resultTitle}</h2>
      <ol className="results">
        {results.map((r) => {
          const slot = players.find((p) => p.id === r.id)?.slot ?? 0;
          return (
            <li key={r.id} className={r.eliminated ? 'is-out' : 'is-pass'}>
              <span className="rank">#{r.rank}</span>
              <Avatar slot={slot} name={r.nickname} />
              <div className="result-info">
                <strong>{r.nickname}{r.id === myId ? ` (${vi.you})` : ''}</strong>
                <span>{r.detail}</span>
              </div>
              {noElim && !r.eliminated ? (
                <span className={`badge ${r.passed ? 'badge-pass' : 'badge-lost'}`}>
                  +{r.gained} {vi.points}
                </span>
              ) : (
                <span className={`badge ${r.eliminated ? 'badge-out' : 'badge-pass'}`}>
                  {r.eliminated ? vi.eliminatedBadge : vi.passedBadge}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="muted">{isLast ? vi.finalIn : vi.nextRoundIn} {timer}s</p>
    </div>
  );
}

export function WinnerCard() {
  const winnerId = useStore(sessionStore, (s) => s.winnerId);
  const players = useStore(sessionStore, (s) => s.players);
  const timer = useStore(sessionStore, (s) => s.timerSeconds);
  const amHost = useStore(sessionStore, (s) => s.myId !== '' && s.myId === s.hostId);
  const winner = players.find((p) => p.id === winnerId);
  const noElim = useStore(sessionStore, (s) => s.noElimination);
  // Winner first (the server breaks ties by the last round's ranking), then by points.
  const standings = [...players]
    .filter((p) => p.alive)
    .sort((a, b) => Number(b.id === winnerId) - Number(a.id === winnerId) || b.points - a.points);
  return (
    <div className="overlay-card winner-card">
      <span className="eyebrow">{vi.winnerTitle}</span>
      {winner ? (
        <>
          <div className="winner-avatar"><Avatar slot={winner.slot} name={winner.nickname} /></div>
          <h2 className="card-title winner-name">{winner.nickname}</h2>
          {winner.isBot && <span className="tag tag-bot">{vi.bot}</span>}
        </>
      ) : (
        <h2 className="card-title">{vi.noWinner}</h2>
      )}
      {noElim && (
        <ol className="standings" aria-label={vi.standings}>
          {standings.map((p, i) => (
            <li key={p.id} className={p.id === winnerId ? 'is-winner' : ''}>
              <span className="rank">#{i + 1}</span>
              <Avatar slot={p.slot} name={p.nickname} />
              <span className="standings-name">{p.nickname}</span>
              <b>{p.points} {vi.points}</b>
            </li>
          ))}
        </ol>
      )}
      <p className="muted">{vi.backToLobbyIn} {timer}s</p>
      {amHost && <button type="button" className="btn btn-primary" onClick={() => network.backToLobby()}>{vi.backToLobby}</button>}
    </div>
  );
}

export function StatusBanner() {
  const phase = useStore(sessionStore, (s) => s.phase);
  const me = useStore(sessionStore, (s) => s.players.find((p) => p.id === s.myId));
  const noElim = useStore(sessionStore, (s) => s.noElimination);
  if (!me || phase === 'MATCH_END' || phase === 'ROUND_RESULT') return null;
  if (!me.alive) {
    return <div className="status-banner is-spectating">{vi.spectating} · <small>{vi.spectateHint}</small></div>;
  }
  if (phase !== 'ROUND_PLAYING') return null;
  if (me.roundState === 'FINISHED') return <div className="status-banner is-pass">{vi.youFinished}</div>;
  if (me.roundState === 'OUT') return <div className="status-banner is-out">{noElim ? vi.youLostRound : vi.youOut}</div>;
  return null;
}

export function PlayerList() {
  const players = useStore(sessionStore, (s) => s.players);
  const myId = useStore(sessionStore, (s) => s.myId);
  const noElim = useStore(sessionStore, (s) => s.noElimination);
  const inMatch = useStore(sessionStore, (s) => s.phase !== 'LOBBY');
  return (
    <ul className="hud-players">
      {players.map((p) => {
        const status = !p.alive ? 'is-eliminated' : p.roundState === 'FINISHED' ? 'is-finished' : p.roundState === 'OUT' ? 'is-round-out' : '';
        return (
          <li key={p.id} className={`${p.connected || p.isBot ? '' : 'is-off'} ${status}`}>
            <Avatar slot={p.slot} name={p.nickname} />
            <span className="hud-name">{p.nickname}{p.id === myId ? ` (${vi.you})` : ''}</span>
            {p.isBot && <span className="tag tag-bot">{vi.bot}</span>}
            {!p.connected && !p.isBot && <em>{vi.disconnected}</em>}
            {noElim && inMatch && <span className="hud-points">{p.points}</span>}
          </li>
        );
      })}
    </ul>
  );
}
