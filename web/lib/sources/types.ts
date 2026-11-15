import type { FieldGeometry, LonLat, SourceId, SourceResult } from '../domain/types';
import type { ResponseCache } from '../server/cache';
import type { FetchImpl } from '../server/http';

export interface SourceContext {
  geometry: FieldGeometry;
  /** A point inside the field. */
  point: LonLat;
  bbox: [number, number, number, number];
  now: Date;
}

export interface SourceDeps {
  fetch: FetchImpl;
  cache: ResponseCache;
  env: Record<string, string | undefined>;
}

/**
 * Every profile source implements this. `run` must resolve (never reject) with a SourceResult;
 * the registry also wraps it so an unexpected throw becomes `unavailable` instead of breaking other sources.
 */
export interface ProfileSource {
  id: SourceId;
  run(ctx: SourceContext, deps: SourceDeps): Promise<SourceResult>;
}
