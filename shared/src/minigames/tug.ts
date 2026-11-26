export const TUG = {
  strongPull: 1,
  weakPull: 0.3,
  /** Rope displacement per unit of pull. The rope ends at ±1. */
  ropeGain: 0.022,
  fatigueMs: 300,
  cursorPeriodS: 1.4,
  zoneHalfWidth: 0.11,
  toleranceMs: 90,
  maxLatencyCompMs: 120,
  minPullIntervalMs: 110,
  ropeLength: 10,
  /** Layout: metres the rope/teams shift per unit of rope value, gap from centre, spacing between teammates. */
  shift: 3,
  teamGap: 2.2,
  spacing: 1.5,
} as const;

/** Timing cursor in [0, 1] (triangle wave). The green zone is centred on 0.5. */
export function tugCursor(t: number): number {
  const phase = (t / TUG.cursorPeriodS) % 1;
  return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}

export function tugInZone(t: number): boolean {
  return Math.abs(tugCursor(t) - 0.5) <= TUG.zoneHalfWidth;
}

/** True if the cursor is in the zone at any moment within ±tolerance of t (sampled). */
export function tugInZoneWithin(t: number, toleranceS: number): boolean {
  const steps = 8;
  for (let k = -steps; k <= steps; k++) if (tugInZone(t + (k / steps) * toleranceS)) return true;
  return false;
}
