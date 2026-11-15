'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/**
 * true / false once known in the browser; null during server render and hydration.
 * Layout never depends on it (CSS motion-reduce: variants handle that); it only decides which WebGL canvas to mount.
 */
export function useReducedMotion(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => null,
  );
}
