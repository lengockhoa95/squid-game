import { describe, expect, it } from 'vitest';
import { RoomCodeRegistry } from './RoomCodeRegistry.ts';

describe('RoomCodeRegistry', () => {
  it('never hands out a code that is still active', () => {
    const reg = new RoomCodeRegistry();
    let calls = 0;
    // First two draws produce the same code, third differs.
    const values = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5];
    const rng = () => values[calls++ % values.length]!;
    const a = reg.reserve(rng);
    const b = reg.reserve(rng);
    expect(a).not.toBe(b);
    expect(reg.has(a)).toBe(true);
  });

  it('frees a code on release', () => {
    const reg = new RoomCodeRegistry();
    const code = reg.reserve(() => 0);
    reg.release(code);
    expect(reg.has(code)).toBe(false);
    expect(reg.reserve(() => 0)).toBe(code);
  });
});
