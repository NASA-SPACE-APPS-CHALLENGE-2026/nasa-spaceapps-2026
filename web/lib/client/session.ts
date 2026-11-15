'use client';

import { useSyncExternalStore } from 'react';

/**
 * Small per-browser UI memory (not farm data): which field the farmer looked at last, so links like
 * "Rotation Explorer" in the header can preselect it. Stored under its own key with a version envelope.
 */
const KEY = 'fieldshift.session';
const VERSION = 1;

interface Session {
  lastFieldId?: string;
}

const listeners = new Set<() => void>();
let cached: Session | null = null;

function read(): Session {
  if (cached) return cached;
  try {
    const raw = window.localStorage.getItem(KEY);
    const env = raw ? (JSON.parse(raw) as { schemaVersion?: number; items?: Session }) : null;
    cached = env?.items ?? {};
  } catch {
    cached = {};
  }
  return cached;
}

function write(next: Session) {
  cached = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ schemaVersion: VERSION, items: next }));
  } catch {
    // storage blocked: keep it in memory for this tab
  }
  listeners.forEach((l) => l());
}

export function setLastFieldId(id: string | undefined): void {
  if (typeof window === 'undefined' || read().lastFieldId === id) return;
  write({ ...read(), lastFieldId: id });
}

export function getLastFieldId(): string | undefined {
  return typeof window === 'undefined' ? undefined : read().lastFieldId;
}

export function useLastFieldId(): string | undefined {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      const onStorage = (e: StorageEvent) => {
        if (e.key === KEY) {
          cached = null;
          cb();
        }
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(cb);
        window.removeEventListener('storage', onStorage);
      };
    },
    getLastFieldId,
    () => undefined,
  );
}
