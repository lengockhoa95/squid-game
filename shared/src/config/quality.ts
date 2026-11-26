export type QualityLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type FpsCap = 30 | 60;

export interface QualityPreset {
  pixelRatioMax: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  fpsCap: FpsCap;
}

export const QUALITY_LEVELS: readonly QualityLevel[] = ['LOW', 'MEDIUM', 'HIGH'];

export const QUALITY_PRESETS: Readonly<Record<QualityLevel, QualityPreset>> = {
  LOW: { pixelRatioMax: 0.75, antialias: false, shadows: false, shadowMapSize: 0, fpsCap: 30 },
  MEDIUM: { pixelRatioMax: 1, antialias: false, shadows: true, shadowMapSize: 1024, fpsCap: 60 },
  HIGH: { pixelRatioMax: 2, antialias: true, shadows: true, shadowMapSize: 2048, fpsCap: 60 },
};
