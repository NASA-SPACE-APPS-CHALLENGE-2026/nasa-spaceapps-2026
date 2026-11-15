/** Minimal Storage subset so tests can pass an in-memory implementation. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements KeyValueStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

export const SCHEMA_VERSION = 1;

interface Envelope<T> {
  schemaVersion: number;
  items: Record<string, T>;
}

type Migration = (items: Record<string, unknown>) => Record<string, unknown>;

/**
 * A versioned map stored under one key. `migrations[n]` upgrades data written at version n to n+1.
 * Unreadable data is kept aside under `<key>.corrupt` instead of being silently discarded.
 */
export class VersionedCollection<T> {
  constructor(
    private storage: KeyValueStorage,
    private key: string,
    private migrations: Record<number, Migration> = {},
  ) {}

  read(): Record<string, T> {
    const raw = this.storage.getItem(this.key);
    if (!raw) return {};
    try {
      const env = JSON.parse(raw) as Envelope<unknown>;
      let items = env.items ?? {};
      for (let v = env.schemaVersion ?? 1; v < SCHEMA_VERSION; v++) {
        const m = this.migrations[v];
        if (m) items = m(items);
      }
      return items as Record<string, T>;
    } catch {
      this.storage.setItem(`${this.key}.corrupt`, raw);
      this.storage.removeItem(this.key);
      return {};
    }
  }

  write(items: Record<string, T>): void {
    const env: Envelope<T> = { schemaVersion: SCHEMA_VERSION, items };
    this.storage.setItem(this.key, JSON.stringify(env));
  }
}
