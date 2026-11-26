import { isElementId, type ElementId } from './elements.ts';

export interface PickElementMessage {
  element: ElementId;
}

export interface CastMessage {
  x: number;
  z: number;
}

export interface ElementsToggleMessage {
  enabled: boolean;
}

const COORD_LIMIT = 500;

export function parsePickElement(raw: unknown): PickElementMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { element } = raw as { element?: unknown };
  return isElementId(element) ? { element } : null;
}

/** Aim point for a cast; missing/invalid coordinates → null (self/auto elements send {x:0,z:0}). */
export function parseCast(raw: unknown): CastMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { x, z } = raw as { x?: unknown; z?: unknown };
  if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (Math.abs(x) > COORD_LIMIT || Math.abs(z) > COORD_LIMIT) return null;
  return { x, z };
}

export function parseElementsToggle(raw: unknown): ElementsToggleMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { enabled } = raw as { enabled?: unknown };
  return typeof enabled === 'boolean' ? { enabled } : null;
}
