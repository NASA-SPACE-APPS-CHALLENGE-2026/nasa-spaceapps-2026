import { SOURCE_META } from '../domain/sourceMeta';
import type { SourceId, SourceResult } from '../domain/types';
import { HOUR } from '../server/cache';
import { fetchText, SourceError } from '../server/http';
import { messageOf } from './power';
import type { ProfileSource, SourceContext, SourceDeps } from './types';

const warned = new Set<string>();
/** Developer-facing configuration hints go to the server console once, never to farmers. */
export function devHint(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[FieldShift] ${message}`);
}

/** A cheap authenticated request: CMR answers 401 "Token does not exist" for bad tokens. */
const TOKEN_CHECK_URL = 'https://cmr.earthdata.nasa.gov/search/collections.json?page_size=1&short_name=SPL3SMP_E';

export type TokenCheck = 'valid' | 'rejected';

export async function checkEarthdataToken(token: string, deps: SourceDeps, now: Date): Promise<TokenCheck> {
  // Key by a short fingerprint, never the token itself.
  const fp = `${token.length}:${token.slice(-6)}`;
  const res = await deps.cache.getOrFetch(`earthdata:token:${fp}`, HOUR, async () => {
    const { status } = await fetchText(deps.fetch, TOKEN_CHECK_URL, {
      label: 'NASA Earthdata',
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: 15000,
    });
    if (status === 401 || status === 403) return 'rejected' as TokenCheck;
    if (status >= 200 && status < 300) return 'valid' as TokenCheck;
    throw new SourceError(`NASA Earthdata returned HTTP ${status} while checking the token.`, 'http', status);
  }, now);
  return res.value;
}

/**
 * SMAP, IMERG and NDVI need a NASA Earthdata login token. In Milestone 1 they are honest stubs:
 * they never return values, they only report whether the token is present and accepted.
 */
function earthdataStub(id: SourceId): ProfileSource {
  return {
    id,
    async run(ctx: SourceContext, deps: SourceDeps): Promise<SourceResult> {
      const meta = SOURCE_META[id];
      const base = { sourceId: id, sourceName: meta.provider, docsUrl: meta.docsUrl, values: [] };
      const token = deps.env.EARTHDATA_TOKEN?.trim();
      if (!token) {
        devHint('EARTHDATA_TOKEN is not set, so SMAP, IMERG and NDVI are off. Add it to web/.env.local (see .env.example) and restart the server.');
        return { ...base, status: 'needs_token', message: 'Not available yet.' };
      }
      try {
        const check = await checkEarthdataToken(token, deps, ctx.now);
        if (check === 'rejected') {
          devHint('NASA Earthdata rejected EARTHDATA_TOKEN (expired or invalid). Generate a new one at https://urs.earthdata.nasa.gov.');
          return { ...base, status: 'needs_token', message: 'Not available right now.' };
        }
        return { ...base, status: 'not_built', fetchedAt: ctx.now.toISOString(), message: 'Coming soon. No values are shown yet.' };
      } catch (err) {
        return { ...base, status: 'unavailable', message: messageOf(err) };
      }
    },
  };
}

export const smapSource = earthdataStub('smap');
export const imergSource = earthdataStub('imerg');
export const ndviSource = earthdataStub('ndvi');
