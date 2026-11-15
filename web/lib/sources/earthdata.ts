import { DAY, HOUR } from '../server/cache';
import { fetchOkText, fetchText, parseJson, SourceError } from '../server/http';
import type { SourceDeps } from './types';

/**
 * Shared helpers for NASA Earthdata sources (SMAP, IMERG).
 * Values come from the Earthdata Cloud OPeNDAP service, which can cut a few pixels out of a
 * global file and return them as CSV, so we never download whole granules.
 * Tested live 2026-11-15: SMAP subsets ~1.5 s each; IMERG needs the GES DISC data licence approved
 * on the Earthdata account (otherwise OPeNDAP answers 200 with an "EULA Acceptance Failure" error body).
 */

const warned = new Set<string>();
/** Developer-facing configuration hints go to the server console once, never to farmers. */
export function devHint(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[PlotTwist] ${message}`);
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

/** The account has not approved a data centre's licence (EULA) yet. Fixable only by the account owner. */
export class EarthdataLicenceError extends SourceError {
  constructor(readonly approveUrl: string | undefined) {
    super('NASA Earthdata needs a one-time data licence approval on this account.', 'http', 403);
    this.name = 'EarthdataLicenceError';
  }
}

export interface Granule {
  /** YYYY-MM-DD (start of the granule's day, UTC). */
  date: string;
  opendap: string;
}

interface CmrResponse {
  feed?: { entry?: Array<{ title?: string; time_start?: string; links?: Array<{ href?: string }> }> };
}

/** Daily granules for a collection between two dates, newest first, de-duplicated by day. */
export function parseCmrGranules(text: string): Granule[] {
  const json = parseJson<CmrResponse>(text, 'NASA CMR');
  if (!Array.isArray(json.feed?.entry)) throw new SourceError('NASA CMR sent an unexpected response.', 'format');
  const byDay = new Map<string, Granule>();
  for (const e of json.feed!.entry!) {
    const date = e.time_start?.slice(0, 10);
    const opendap = e.links?.find((l) => l.href?.startsWith('https://opendap.earthdata.nasa.gov/'))?.href;
    if (!date || !opendap || byDay.has(date)) continue;
    byDay.set(date, { date, opendap });
  }
  return [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export async function findGranules(deps: SourceDeps, shortName: string, version: string, start: Date, end: Date, now: Date): Promise<Granule[]> {
  const iso = (d: Date) => `${d.toISOString().slice(0, 10)}T00:00:00Z`;
  const url = `https://cmr.earthdata.nasa.gov/search/granules.json?short_name=${shortName}&version=${version}&temporal=${iso(start)},${iso(end)}&page_size=60&sort_key=-start_date`;
  const res = await deps.cache.getOrFetch(`cmr:${url}`, 6 * HOUR, async () => {
    const text = await fetchOkText(deps.fetch, url, { label: 'NASA CMR', timeoutMs: 20000 });
    parseCmrGranules(text);
    return text;
  }, now);
  return parseCmrGranules(res.value);
}

/**
 * Parse OPeNDAP DAP4 CSV output:
 *   Dataset: NAME
 *   /Group/var[0], 0.28, 0.27, 0.27
 *   /Group/var[1], ...
 * Returns every variable's values in row order (keyed by the path without the group, e.g. "soil_moisture").
 */
export function parseDapCsv(text: string, label: string): Record<string, number[]> {
  if (/^\s*Error\s*\{/m.test(text)) {
    if (/EULA/i.test(text)) throw new EarthdataLicenceError(text.match(/https:\/\/urs\.earthdata\.nasa\.gov\/approve_app\?client_id=[\w-]+/)?.[0]);
    const code = Number(text.match(/code\s*=\s*(\d+)/)?.[1]);
    throw new SourceError(`${label} returned an error${code ? ` (code ${code})` : ''}.`, 'http', code || undefined);
  }
  if (!/^Dataset:/m.test(text)) throw new SourceError(`${label} sent a response that was not the expected data format.`, 'format');
  const out: Record<string, number[]> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\/?(?:[\w]+\/)*([\w]+)(?:\[\d+\])*\s*,(.*)$/);
    if (!m) continue;
    const nums = m[2].split(',').map((s) => s.trim()).filter(Boolean).map(Number);
    (out[m[1]] ??= []).push(...nums.filter((n) => Number.isFinite(n)));
  }
  return out;
}

/** Fetch a DAP4 CSV subset with the token. Past days never change, so they are cached for a year. */
export async function dapSubset(deps: SourceDeps, token: string, opendap: string, constraint: string, label: string, now: Date): Promise<Record<string, number[]>> {
  const url = `${opendap}.dap.csv?dap4.ce=${encodeURIComponent(constraint)}`;
  const res = await deps.cache.getOrFetch(`dap:${url}`, 365 * DAY, async () => {
    const text = await fetchOkText(deps.fetch, url, { label, timeoutMs: 30000, headers: { Authorization: `Bearer ${token}` } });
    parseDapCsv(text, label); // only cache answers that parse
    return text;
  }, now);
  return parseDapCsv(res.value, label);
}

/** The middle value of a 3×3 window if valid, otherwise the mean of the valid neighbours. */
export function centreOrMean(values: number[] | undefined, valid: (v: number) => boolean): number | null {
  if (!values || values.length !== 9) return null;
  if (valid(values[4])) return values[4];
  const ok = values.filter(valid);
  return ok.length ? ok.reduce((s, v) => s + v, 0) / ok.length : null;
}
