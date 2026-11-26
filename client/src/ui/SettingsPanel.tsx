import { QUALITY_LEVELS, QUALITY_PRESETS, vi, type FpsCap, type QualityLevel } from '@sp/shared';
import { settingsStore } from '../store/settings.ts';
import { useStore } from '../store/UIStore.ts';

const QUALITY_LABEL: Record<QualityLevel, string> = { LOW: vi.qualityLow, MEDIUM: vi.qualityMedium, HIGH: vi.qualityHigh };
const FPS_OPTIONS: readonly FpsCap[] = [30, 60];

export function SettingsPanel() {
  const quality = useStore(settingsStore, (s) => s.quality);
  const fpsCap = useStore(settingsStore, (s) => s.fpsCap);
  const sound = useStore(settingsStore, (s) => s.sound);

  return (
    <div className="settings">
      <div className="field">
        <span className="field-label">{vi.quality}</span>
        <div className="segmented">
          {QUALITY_LEVELS.map((q) => (
            <button
              key={q}
              type="button"
              className={q === quality ? 'active' : ''}
              onClick={() => settingsStore.set({ quality: q, fpsCap: QUALITY_PRESETS[q].fpsCap })}
            >
              {QUALITY_LABEL[q]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">{vi.fpsCap}</span>
        <div className="segmented">
          {FPS_OPTIONS.map((f) => (
            <button key={f} type="button" className={f === fpsCap ? 'active' : ''} onClick={() => settingsStore.set({ fpsCap: f })}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">{vi.sound}</span>
        <div className="segmented">
          <button type="button" className={sound ? 'active' : ''} onClick={() => settingsStore.set({ sound: true })}>{vi.soundOn}</button>
          <button type="button" className={!sound ? 'active' : ''} onClick={() => settingsStore.set({ sound: false })}>{vi.soundOff}</button>
        </div>
      </div>
    </div>
  );
}
