import { generateRoomCode } from '@sp/shared';

/**
 * Tracks room codes in use by this server process so new rooms get a unique code.
 * Single-process only; a multi-process deployment would need Colyseus presence (e.g. Redis).
 */
export class RoomCodeRegistry {
  private readonly active = new Set<string>();

  reserve(rng: () => number = Math.random): string {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const code = generateRoomCode(rng);
      if (!this.active.has(code)) {
        this.active.add(code);
        return code;
      }
    }
    throw new Error('Could not allocate a unique room code');
  }

  release(code: string): void {
    this.active.delete(code);
  }

  has(code: string): boolean {
    return this.active.has(code);
  }
}

export const roomCodes = new RoomCodeRegistry();
