import type { MinigameId } from '../minigames/catalog.ts';

export type ElementId = 'EARTH' | 'WATER' | 'THUNDER' | 'WIND' | 'FIRE' | 'SWAP' | 'CLONE' | 'BLINK' | 'DARK';

export const ELEMENT_IDS: readonly ElementId[] = ['EARTH', 'WATER', 'THUNDER', 'WIND', 'FIRE', 'SWAP', 'CLONE', 'BLINK', 'DARK'];

/** point = aimed at a ground point · self = centred on the caster · auto = server picks the target. */
export type ElementAim = 'point' | 'self';

export interface ElementInfo {
  id: ElementId;
  name: string;
  /** One-letter badge (emoji is unreliable on some systems). */
  glyph: string;
  color: string;
  aim: ElementAim;
  /** Max distance from the caster to the aimed point (movement games). */
  range: number;
  cooldown: number;
  /** Short description for movement games. */
  desc: string;
  /** Short description for non-movement games (if allowed there). */
  descAction?: string;
  /** Description in monster games (Thủ Thành): elements hit monsters, not players. */
  descPve: string;
}

export const ELEMENTS: Readonly<Record<ElementId, ElementInfo>> = {
  EARTH: { id: 'EARTH', name: 'Đất', glyph: 'Đ', color: '#b07a45', aim: 'point', range: 12, cooldown: 5, desc: 'Dựng cột đá chặn đường 4s', descPve: 'Cột đá đâm quái, chặn đường quái' },
  WATER: { id: 'WATER', name: 'Nước', glyph: 'N', color: '#3aa0ff', aim: 'point', range: 12, cooldown: 6, desc: 'Vũng lầy làm người khác đi chậm', descPve: 'Vũng lầy làm quái đi chậm' },
  THUNDER: {
    id: 'THUNDER', name: 'Lôi', glyph: 'L', color: '#ffd23f', aim: 'point', range: 14, cooldown: 6,
    desc: 'Sét đánh người gần con trỏ, choáng 1s', descPve: 'Sét đánh mọi quái quanh con trỏ, choáng 2s', descAction: 'Sét đánh 1 đối thủ, khoá thao tác 1.5s',
  },
  WIND: { id: 'WIND', name: 'Gió', glyph: 'G', color: '#bfefff', aim: 'self', range: 0, cooldown: 6, desc: 'Thổi văng người xung quanh', descPve: 'Thổi văng quái xung quanh' },
  FIRE: { id: 'FIRE', name: 'Lửa', glyph: 'H', color: '#ff7a2f', aim: 'self', range: 0, cooldown: 7, desc: 'Chạy nhanh gấp đôi 2.5s', descPve: 'Chạy nhanh + đòn đánh mạnh x1.5' },
  SWAP: {
    id: 'SWAP', name: 'Hoán đổi', glyph: 'Đổi', color: '#c77dff', aim: 'point', range: 1000, cooldown: 9,
    desc: 'Đổi chỗ với người gần con trỏ', descPve: 'Đẩy quái gần con trỏ về hang quái', descAction: 'Đổi tiến độ với người dẫn đầu',
  },
  CLONE: { id: 'CLONE', name: 'Phân thân', glyph: 'P', color: '#7bffb0', aim: 'self', range: 0, cooldown: 8, desc: 'Tạo 2 bản sao giả chạy lung tung', descPve: '2 bản sao dụ quái đuổi theo' },
  BLINK: { id: 'BLINK', name: 'Không gian', glyph: 'K', color: '#8f7bff', aim: 'point', range: 5, cooldown: 5, desc: 'Dịch chuyển tức thời tới con trỏ (≤5m)', descPve: 'Dịch chuyển tức thời tới con trỏ (≤5m)' },
  DARK: {
    id: 'DARK', name: 'Bóng tối', glyph: 'B', color: '#5a4a7a', aim: 'point', range: 14, cooldown: 7,
    desc: 'Che tối màn hình người gần con trỏ', descPve: 'Quái trong mây đen lạc đường 3.5s', descAction: 'Che tối màn hình mọi đối thủ 2s',
  },
};

/** Tuning (deliberately not balanced: fun first). */
export const ELEMENT_FX = {
  pillarRadius: 0.9,
  pillarHeight: 3,
  pillarSeconds: 4,
  puddleRadius: 2.2,
  puddleSeconds: 4,
  puddleSlow: 0.35,
  thunderHitRadius: 3.5,
  stunSeconds: 1,
  actionStunSeconds: 1.5,
  windRadius: 4.5,
  windSpeed: 13,
  windLift: 6,
  hasteSeconds: 2.5,
  swapHitRadius: 1000,
  cloneCount: 2,
  cloneSeconds: 5,
  cloneSpeed: 5,
  darkRadius: 5,
  darkSeconds: 2.5,
  actionDarkSeconds: 2,
  /** How long instant effects (bolt, wind ring…) stay in the synced list for clients to draw. */
  flashSeconds: 0.7,
} as const;

const ACTION_GAME_ELEMENTS: Partial<Record<MinigameId, readonly ElementId[]>> = {
};

/** Elements usable in a minigame. Movement games allow all of them. */
export function elementsFor(game: MinigameId, movement: boolean): readonly ElementId[] {
  if (movement) return ELEMENT_IDS;
  return ACTION_GAME_ELEMENTS[game] ?? [];
}

export function isElementId(v: unknown): v is ElementId {
  return typeof v === 'string' && (ELEMENT_IDS as readonly string[]).includes(v);
}

/** Kinds stored in MatchState.effects. */
export type EffectKind = 'PILLAR' | 'PUDDLE' | 'CLONE' | 'BOLT' | 'WIND' | 'BLINK' | 'SWAP' | 'DARK' | 'FIRE' | 'RESCUE' | 'BUMP' | 'SLASH' | 'SHOT' | 'BREATH' | 'GATE_HIT' | 'QUAKE' | 'TORNADO' | 'THRUST' | 'HOOK' | 'MSHOT' | 'EXPLODE' | 'GATE_BREAK' | 'ENRAGE';
