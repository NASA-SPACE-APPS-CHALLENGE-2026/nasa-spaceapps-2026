import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface Cached<T> {
  value: T;
  fetchedAt: string;
  fromCache: boolean;
}

export interface ResponseCache {
  getOrFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>, now?: Date): Promise<Cached<T>>;
}

interface Entry<T> {
  key: string;
  fetchedAt: string;
  expiresAt: number;
  value: T;
}

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

/** In-memory cache (tests, and a fast layer in front of the disk cache). Failures are never cached. */
export class MemoryCache implements ResponseCache {
  private entries = new Map<string, Entry<unknown>>();

  async getOrFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>, now = new Date()): Promise<Cached<T>> {
    const hit = this.entries.get(key) as Entry<T> | undefined;
    if (hit && hit.expiresAt > now.getTime()) return { value: hit.value, fetchedAt: hit.fetchedAt, fromCache: true };
    const value = await fetcher();
    const fetchedAt = now.toISOString();
    this.entries.set(key, { key, fetchedAt, expiresAt: now.getTime() + ttlMs, value });
    return { value, fetchedAt, fromCache: false };
  }
}

/** JSON-file cache under web/.cache so responses survive dev-server restarts. Local-dev only. */
export class DiskCache implements ResponseCache {
  private memory = new Map<string, Entry<unknown>>();

  constructor(private dir: string) {}

  private file(key: string): string {
    return path.join(this.dir, `${createHash('sha1').update(key).digest('hex')}.json`);
  }

  async getOrFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>, now = new Date()): Promise<Cached<T>> {
    const t = now.getTime();
    let hit = this.memory.get(key) as Entry<T> | undefined;
    if (!hit) {
      try {
        hit = JSON.parse(await readFile(this.file(key), 'utf8')) as Entry<T>;
        if (hit.key !== key) hit = undefined;
      } catch {
        hit = undefined;
      }
    }
    if (hit && hit.expiresAt > t) {
      this.memory.set(key, hit);
      return { value: hit.value, fetchedAt: hit.fetchedAt, fromCache: true };
    }
    const value = await fetcher();
    const entry: Entry<T> = { key, fetchedAt: now.toISOString(), expiresAt: t + ttlMs, value };
    this.memory.set(key, entry);
    try {
      await mkdir(this.dir, { recursive: true });
      await writeFile(this.file(key), JSON.stringify(entry));
    } catch {
      // A read-only disk only costs us persistence; the memory layer still works.
    }
    return { value, fetchedAt: entry.fetchedAt, fromCache: false };
  }
}

let shared: ResponseCache | undefined;
export function serverCache(): ResponseCache {
  shared ??= new DiskCache(path.join(process.cwd(), '.cache'));
  return shared;
}
