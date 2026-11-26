import { useSyncExternalStore } from 'react';

export interface Store<T extends object> {
  get(): T;
  set(partial: Partial<T>): void;
  subscribe(listener: () => void): () => void;
}

/** Minimal external store. The game loop writes at a throttled rate; React reads via useStore. */
export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(partial) {
      let changed = false;
      for (const key in partial) {
        if (!Object.is(state[key], partial[key])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...partial };
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T extends object, S>(store: Store<T>, selector: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}
