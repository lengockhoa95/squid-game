import { createStore } from '../store/UIStore.ts';

/** Local-only element UI state: whether the next ground click is an element aim. */
export const elementUi = createStore<{ aiming: boolean }>({ aiming: false });
