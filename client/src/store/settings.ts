import { QUALITY_LEVELS, QUALITY_PRESETS, type FpsCap, type QualityLevel } from '@sp/shared';
import { createStore } from './UIStore.ts';

export interface Settings {
  quality: QualityLevel;
  fpsCap: FpsCap;
}

const KEY = 'sp.settings.v1';

function load(): Settings {
  const fallback: Settings = { quality: 'MEDIUM', fpsCap: QUALITY_PRESETS.MEDIUM.fpsCap };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const quality = QUALITY_LEVELS.includes(parsed.quality as QualityLevel) ? (parsed.quality as QualityLevel) : fallback.quality;
    const fpsCap: FpsCap = parsed.fpsCap === 30 ? 30 : parsed.fpsCap === 60 ? 60 : QUALITY_PRESETS[quality].fpsCap;
    return { quality, fpsCap };
  } catch {
    return fallback;
  }
}

export const settingsStore = createStore<Settings>(load());

settingsStore.subscribe(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(settingsStore.get()));
  } catch {
    // storage unavailable (private mode): settings just won't persist
  }
});
