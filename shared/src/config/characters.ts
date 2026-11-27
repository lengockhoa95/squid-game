/** Kenney "Mini Characters" (CC0) a player can pick in the lobby. Ids are the model file names. */
export const CHARACTER_IDS = [
  'character-male-a', 'character-female-a', 'character-male-e', 'character-female-e',
  'character-male-b', 'character-female-b', 'character-male-c', 'character-female-c',
  'character-male-d', 'character-female-d', 'character-male-f', 'character-female-f',
  'character-male-g', 'character-knight', 'character-soldier', 'character-raider',
  'character-worker', 'character-robot', 'character-alien', 'character-zombie',
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

/** Default per slot when a player has not picked one. */
export const SLOT_CHARACTERS: readonly CharacterId[] = ['character-male-a', 'character-female-a', 'character-male-e', 'character-female-e'];

export const CHARACTER_NAMES: Readonly<Record<CharacterId, string>> = {
  'character-male-a': 'Minh', 'character-female-a': 'Lan', 'character-male-e': 'Huy', 'character-female-e': 'Mai',
  'character-male-b': 'Nam', 'character-female-b': 'Hoa', 'character-male-c': 'Tuấn', 'character-female-c': 'Thảo',
  'character-male-d': 'Khang', 'character-female-d': 'Vy', 'character-male-f': 'Long', 'character-female-f': 'Ngọc',
  'character-male-g': 'Bảo', 'character-knight': 'Hiệp sĩ', 'character-soldier': 'Lính', 'character-raider': 'Cướp biển',
  'character-worker': 'Thợ xây', 'character-robot': 'Robot', 'character-alien': 'Người ngoài hành tinh', 'character-zombie': 'Zombie',
};

export function isCharacterId(v: unknown): v is CharacterId {
  return typeof v === 'string' && (CHARACTER_IDS as readonly string[]).includes(v);
}

/** The character a player shows: their pick, or the slot default. */
export function characterFor(picked: string, slot: number): CharacterId {
  return isCharacterId(picked) ? picked : SLOT_CHARACTERS[slot % SLOT_CHARACTERS.length]!;
}
