import { vi } from '@sp/shared';
import { SettingsPanel } from './SettingsPanel.tsx';

export function HomeScreen({ onEnterPlayground }: { onEnterPlayground: () => void }) {
  return (
    <main className="home">
      <div className="home-card">
        <h1 className="logo">
          <span>SURVIVAL</span>
          <span className="logo-accent">PARTY</span>
        </h1>
        <p className="tagline">{vi.tagline}</p>
        <button type="button" className="btn btn-primary" onClick={onEnterPlayground}>
          {vi.enterPlayground}
        </button>
        <p className="muted">{vi.comingSoon}</p>
        <section className="card-section">
          <h2>{vi.settings}</h2>
          <SettingsPanel />
        </section>
      </div>
    </main>
  );
}
