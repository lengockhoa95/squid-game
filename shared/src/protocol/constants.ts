export const ROOM_NAME = 'match';
export const MAX_PLAYERS = 4;
/** Server simulation rate; one client input = one step of 1/SIM_HZ seconds. */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
/** State patch interval sent to clients. */
export const PATCH_MS = 50;
/** Inputs per MOVE message (60Hz / 3 = 20 messages per second). */
export const INPUT_BATCH = 3;
export const MAX_INPUTS_PER_MESSAGE = 6;
export const RECONNECT_SECONDS = 20;
export const COUNTDOWN_SECONDS = 3;
export const NICKNAME_MAX = 16;

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;

/** Per-slot look: color + accessory. Slot index is stable for a player's lifetime in the room. */
export const SLOT_LOOKS: ReadonlyArray<{ color: number; accessory: 'none' | 'cap' | 'glasses' | 'band' }> = [
  { color: 0x3df5c8, accessory: 'none' },
  { color: 0xff5d8f, accessory: 'cap' },
  { color: 0xffd23f, accessory: 'glasses' },
  { color: 0x7b61ff, accessory: 'band' },
];
