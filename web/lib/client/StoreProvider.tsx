'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { createLocalRepositories } from '../repo/local';
import { MemoryStorage } from '../repo/local/storage';
import { FarmStore, type FarmState } from './store';

const StoreContext = createContext<FarmStore | null>(null);

function browserStorage() {
  try {
    const probe = '__fieldshift_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return new MemoryStorage(); // private mode / blocked storage: works for this tab only
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() =>
    typeof window === 'undefined' ? new FarmStore(createLocalRepositories(new MemoryStorage())) : new FarmStore(createLocalRepositories(browserStorage())),
  );
  useEffect(() => {
    void store.load();
  }, [store]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): FarmStore {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used inside <StoreProvider>');
  return s;
}

const SERVER_STATE: FarmState = { loaded: false, fields: [], profiles: {}, management: {}, plans: [], scenarios: [], settings: { externalLookups: true } };

export function useFarm(): FarmState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => SERVER_STATE);
}
