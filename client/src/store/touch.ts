import { createStore } from './UIStore.ts';

function detect(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  } catch {
    return false;
  }
}

/** Touch mode: on-screen twin-stick controls. Detected at start, switched on by the first touch. */
export const touchStore = createStore<{ enabled: boolean }>({ enabled: detect() });

if (typeof window !== 'undefined') {
  window.addEventListener('touchstart', () => touchStore.set({ enabled: true }), { once: true, passive: true });
}
