export type CardId = 'BUNNY' | 'SPEED' | 'TANK' | 'SHOVE' | 'LIFE' | 'RECHARGE' | 'REFLECT' | 'EYE';

export const CARD_IDS: readonly CardId[] = ['BUNNY', 'SPEED', 'TANK', 'SHOVE', 'LIFE', 'RECHARGE', 'REFLECT', 'EYE'];
export const CARD_MAX_LEVEL = 3;

export interface CardInfo {
  id: CardId;
  name: string;
  glyph: string;
  color: string;
  /** Description per level (index 0 = level 1). Level 3 is the awakening. */
  levels: readonly [string, string, string];
  /** Name of the level-3 awakening. */
  awaken: string;
}

export const CARDS: Readonly<Record<CardId, CardInfo>> = {
  BUNNY: {
    id: 'BUNNY', name: 'Chân Thỏ', glyph: 'T', color: '#ffb3d9', awaken: 'Nhảy ba',
    levels: ['Nhảy cao hơn 15%', 'Nhảy cao hơn 30%', 'Thức tỉnh: nhảy 3 lần giữa không trung'],
  },
  SPEED: {
    id: 'SPEED', name: 'Giày Gió', glyph: 'GG', color: '#7df9ff', awaken: 'Siêu tốc',
    levels: ['Chạy nhanh hơn 8%', 'Chạy nhanh hơn 15%', 'Thức tỉnh: nhanh hơn 25%, không bị vũng lầy'],
  },
  TANK: {
    id: 'TANK', name: 'Da Trâu', glyph: 'DT', color: '#c9a36b', awaken: 'Bất động',
    levels: ['Khó bị đẩy, giảm 35% lực gió', 'Rất khó bị đẩy, giảm 60% lực gió', 'Thức tỉnh: gần như không thể bị đẩy'],
  },
  SHOVE: {
    id: 'SHOVE', name: 'Cú Húc', glyph: 'CH', color: '#ff6b6b', awaken: 'Húc bay',
    levels: ['Húc người khác mạnh hơn 60%', 'Húc mạnh gấp đôi', 'Thức tỉnh: húc khi đang chạy làm đối thủ bay lên'],
  },
  LIFE: {
    id: 'LIFE', name: 'Mạng Phụ', glyph: 'M', color: '#ff4f6d', awaken: 'Phượng hoàng',
    levels: ['1 mạng mỗi vòng (thoát bị bắt / rơi)', '2 mạng mỗi vòng', 'Thức tỉnh: 3 mạng, được cứu thì chạy x2 2s'],
  },
  RECHARGE: {
    id: 'RECHARGE', name: 'Nạp Nhanh', glyph: 'NN', color: '#9dff6b', awaken: 'Vô tận',
    levels: ['Hồi chiêu nguyên tố nhanh hơn 20%', 'Hồi chiêu nhanh hơn 35%', 'Thức tỉnh: hồi chiêu x2, dùng ngay từ đầu vòng'],
  },
  REFLECT: {
    id: 'REFLECT', name: 'Phản Xạ', glyph: 'PX', color: '#e0e0ff', awaken: 'Gương thần',
    levels: ['Bị choáng ngắn hơn 40%', 'Bị choáng ngắn hơn 70%', 'Thức tỉnh: Lôi / Hoán đổi / Bóng tối dội ngược người dùng'],
  },
  EYE: {
    id: 'EYE', name: 'Mắt Thần', glyph: 'MT', color: '#ffd23f', awaken: 'Thấu thị',
    levels: ['Cầu Kính: biết ô vỡ ở hàng đầu tiên', 'Cầu Kính: biết ô vỡ ở 3 hàng đầu', 'Thức tỉnh: biết ô vỡ ở mọi hàng'],
  },
};

export function isCardId(v: unknown): v is CardId {
  return typeof v === 'string' && (CARD_IDS as readonly string[]).includes(v);
}

/** Cards are synced as "BUNNY:2,LIFE:1". */
export type CardLevels = Partial<Record<CardId, number>>;

export function parseCards(raw: string): CardLevels {
  const out: CardLevels = {};
  if (!raw) return out;
  for (const part of raw.split(',')) {
    const [id, lv] = part.split(':');
    const level = Number(lv);
    if (isCardId(id) && Number.isInteger(level) && level > 0) out[id] = Math.min(CARD_MAX_LEVEL, level);
  }
  return out;
}

export function formatCards(levels: CardLevels): string {
  return CARD_IDS.filter((id) => (levels[id] ?? 0) > 0).map((id) => `${id}:${levels[id]}`).join(',');
}

export function cardLevel(levels: CardLevels, id: CardId): number {
  return levels[id] ?? 0;
}

const pick = <T>(table: readonly T[], level: number, none: T): T => (level <= 0 ? none : table[Math.min(level, table.length) - 1]!);

/** Every gameplay number a card changes, resolved from card levels (level 0 = neutral). */
export interface CardMods {
  jumpMul: number;
  /** Extra mid-air jumps on top of everyone's double jump. */
  extraAirJumps: number;
  speedMul: number;
  slowImmune: boolean;
  mass: number;
  windTaken: number;
  push: number;
  launch: boolean;
  lives: number;
  lifeHaste: boolean;
  cooldownMul: number;
  instantFirstCast: boolean;
  stunMul: number;
  reflect: boolean;
  /** Bridge rows whose breaking tile is revealed to you (Infinity = all). */
  eyeRows: number;
}

export function cardMods(levels: CardLevels): CardMods {
  const lv = (id: CardId) => cardLevel(levels, id);
  return {
    jumpMul: pick([1.15, 1.3, 1.3], lv('BUNNY'), 1),
    extraAirJumps: lv('BUNNY') >= 3 ? 1 : 0,
    speedMul: pick([1.08, 1.15, 1.25], lv('SPEED'), 1),
    slowImmune: lv('SPEED') >= 3,
    mass: pick([1.6, 2.5, 6], lv('TANK'), 1),
    windTaken: pick([0.65, 0.4, 0.15], lv('TANK'), 1),
    push: pick([1.6, 2.2, 2.2], lv('SHOVE'), 1),
    launch: lv('SHOVE') >= 3,
    lives: pick([1, 2, 3], lv('LIFE'), 0),
    lifeHaste: lv('LIFE') >= 3,
    cooldownMul: pick([0.8, 0.65, 0.5], lv('RECHARGE'), 1),
    instantFirstCast: lv('RECHARGE') >= 3,
    stunMul: pick([0.6, 0.3, 0.3], lv('REFLECT'), 1),
    reflect: lv('REFLECT') >= 3,
    eyeRows: pick([1, 3, Number.POSITIVE_INFINITY], lv('EYE'), 0),
  };
}

/** Cards offered to a player: maxed cards excluded, owned cards twice as likely (to level them up). */
export function drawOffer(levels: CardLevels, count: number, rng: () => number): CardId[] {
  const pool = CARD_IDS.filter((id) => cardLevel(levels, id) < CARD_MAX_LEVEL);
  const out: CardId[] = [];
  while (out.length < count && out.length < pool.length) {
    const candidates = pool.filter((id) => !out.includes(id));
    const weights = candidates.map((id) => (cardLevel(levels, id) > 0 ? 2 : 1));
    let r = rng() * weights.reduce((a, b) => a + b, 0);
    let chosen = candidates[candidates.length - 1]!;
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i]!;
      if (r < 0) {
        chosen = candidates[i]!;
        break;
      }
    }
    out.push(chosen);
  }
  return out;
}

/** Validates an untrusted PICK_CARD payload. */
export function parsePickCard(raw: unknown): { card: CardId } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { card } = raw as { card?: unknown };
  return isCardId(card) ? { card } : null;
}
