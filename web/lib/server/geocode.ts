import { DAY, type ResponseCache } from './cache';
import { fetchOkText, type FetchImpl, parseJson, SourceError } from './http';

/**
 * US Census Bureau one-line address geocoder (free, no key, US addresses only).
 * Tested live 2026-11-14: ~1 s; no match → `addressMatches: []`; addresses over 100 characters → HTTP 400.
 * https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html
 */
const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
export const MAX_ADDRESS_LENGTH = 100;
const MAX_MATCHES = 5;

export interface AddressMatch {
  label: string;
  lat: number;
  lon: number;
}

interface CensusResponse {
  result?: { addressMatches?: Array<{ matchedAddress?: string; coordinates?: { x?: number; y?: number } }> };
  errors?: string[];
}

/** "2229 LINCOLN WAY, AMES, IA, 50014" → "2229 Lincoln Way, Ames, IA 50014". */
export function prettyAddress(s: string): string {
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  const words = (p: string) => p.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
  if (parts.length >= 4 && /^[A-Z]{2}$/.test(parts[parts.length - 2]) && /^\d{5}/.test(parts[parts.length - 1])) {
    const zip = parts.pop()!;
    const state = parts.pop()!;
    return `${parts.map(words).join(', ')}, ${state} ${zip}`;
  }
  return parts.map(words).join(', ');
}

export function parseCensus(text: string): AddressMatch[] {
  const json = parseJson<CensusResponse>(text, 'US Census geocoder');
  if (!json.result || !Array.isArray(json.result.addressMatches)) {
    throw new SourceError(`US Census geocoder sent an unexpected response${json.errors?.length ? `: ${json.errors[0]}` : ''}.`, 'format');
  }
  const out: AddressMatch[] = [];
  for (const m of json.result.addressMatches) {
    const lon = Number(m.coordinates?.x);
    const lat = Number(m.coordinates?.y);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    out.push({ label: prettyAddress(m.matchedAddress ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`), lat, lon });
    if (out.length >= MAX_MATCHES) break;
  }
  return out;
}

export function cleanAddress(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export async function geocodeAddress(address: string, deps: { fetch: FetchImpl; cache: ResponseCache }, now = new Date()): Promise<AddressMatch[]> {
  const q = cleanAddress(address);
  if (!q) return [];
  const url = `${CENSUS_URL}?address=${encodeURIComponent(q)}&benchmark=Public_AR_Current&format=json`;
  const res = await deps.cache.getOrFetch(`geocode:${q.toLowerCase()}`, 30 * DAY, async () => {
    const text = await fetchOkText(deps.fetch, url, { label: 'US Census geocoder', timeoutMs: 15000 });
    parseCensus(text); // only cache answers that parse
    return text;
  }, now);
  return parseCensus(res.value);
}
