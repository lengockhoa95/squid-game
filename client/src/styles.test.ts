import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('styles.css', () => {
  it('has balanced braces (an unclosed @media block silently scopes every later rule)', () => {
    const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    let depth = 0;
    for (const ch of css) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });
});
