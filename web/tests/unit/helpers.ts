import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MemoryCache } from '@/lib/server/cache';
import type { FetchImpl } from '@/lib/server/http';
import type { SourceDeps } from '@/lib/sources/types';
import type { FieldGeometry } from '@/lib/domain/types';

export function fixture(name: string): string {
  return readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf8');
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** Route-based fetch mock. Unmatched URLs throw, so tests can't silently hit the network. */
export function mockFetch(routes: Array<[RegExp, Handler]>): FetchImpl & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    for (const [re, h] of routes) if (re.test(url)) return h(url, init);
    throw new Error(`Unmocked request: ${url}`);
  }) as FetchImpl & { calls: string[] };
  fn.calls = calls;
  return fn;
}

export const text = (body: string, status = 200) => new Response(body, { status });

export function deps(fetchImpl: FetchImpl, env: Record<string, string | undefined> = {}): SourceDeps {
  return { fetch: fetchImpl, cache: new MemoryCache(), env };
}

/** ~19 ha rectangle near Ames, Iowa: the same area the fixtures were recorded for. */
export const AMES_FIELD: FieldGeometry = {
  type: 'Polygon',
  coordinates: [[[-93.742, 42.006], [-93.734, 42.006], [-93.734, 42.01], [-93.742, 42.01], [-93.742, 42.006]]],
};

export const NOW = new Date('2026-11-14T18:00:00Z');
