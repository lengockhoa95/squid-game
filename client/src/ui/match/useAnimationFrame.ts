import { useEffect, useRef } from 'react';

/** Run `cb` every animation frame while mounted — for HUD bits that update via refs, not React state. */
export function useAnimationFrame(cb: (now: number) => void): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    let id = 0;
    const loop = (t: number) => {
      ref.current(t);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
}
