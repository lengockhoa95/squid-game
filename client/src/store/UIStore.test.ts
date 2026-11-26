import { describe, expect, it, vi } from 'vitest';
import { createStore } from './UIStore.ts';

describe('createStore', () => {
  it('merges partial updates and notifies subscribers', () => {
    const store = createStore({ a: 1, b: 'x' });
    const fn = vi.fn();
    store.subscribe(fn);
    store.set({ a: 2 });
    expect(store.get()).toEqual({ a: 2, b: 'x' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('skips notification when nothing changed', () => {
    const store = createStore({ a: 1 });
    const fn = vi.fn();
    store.subscribe(fn);
    store.set({ a: 1 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('unsubscribes', () => {
    const store = createStore({ a: 1 });
    const fn = vi.fn();
    const off = store.subscribe(fn);
    off();
    store.set({ a: 5 });
    expect(fn).not.toHaveBeenCalled();
  });
});
