import { createStore } from './UIStore.ts';

const KEY = 'sp.nickname';

function load(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export const profileStore = createStore({ nickname: load() });

profileStore.subscribe(() => {
  try {
    localStorage.setItem(KEY, profileStore.get().nickname);
  } catch {
    // storage unavailable: nickname just won't persist
  }
});
