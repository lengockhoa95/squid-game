import { createStore } from '../store/UIStore.ts';

/** Private Mắt Thần hints for the local player: row → breaking tile, valid for one round. */
export const bridgeHints = createStore<{ round: number; broken: ReadonlyMap<number, number> }>({ round: -1, broken: new Map() });
