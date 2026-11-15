import { DAY, type ResponseCache } from './cache';
import { fetchOkText, type FetchImpl, parseJson, SourceError } from './http';
import type { AddressMatch } from './geocode';

/**
 * Type-ahead address suggestions from Photon (komoot, OpenStreetMap data, free, no key, built for autocomplete).
 * Tested live 2026-11-15: ~0.3–0.8 s. Results are limited to the lower 48 with a bounding box and to US results.
 * https://photon.komoot.io
 */
const PHOTON_URL = 'https://photon.komoot.io/api/';
const US_BBOX = '-125,24,-66,50';
export const MAX_SUGGESTIONS = 5;

const STATES: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
};

interface PhotonProps {
  type?: string;
  osm_key?: string;
  name?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  district?: string;
  county?: string;
  state?: string;
  postcode?: string;
  countrycode?: string;
}

interface PhotonResponse {
  features?: Array<{ properties?: PhotonProps; geometry?: { type?: string; coordinates?: number[] } }>;
}

export function photonLabel(p: PhotonProps): string | null {
  const st = p.state ? (STATES[p.state] ?? p.state) : '';
  const tail = (place?: string) => [place, [st, p.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (p.housenumber && p.street) return `${p.housenumber} ${p.street}, ${tail(p.city ?? p.district ?? p.county)}`;
  if (p.type === 'county' && p.name) return `${/county/i.test(p.name) ? p.name : `${p.name} County`}, ${st}`;
  if ((p.type === 'city' || p.type === 'town' || p.type === 'village' || p.type === 'locality' || p.type === 'district') && p.name) return `${p.name}, ${tail()}`;
  if (p.type === 'street' && p.name) return `${p.name}, ${tail(p.city ?? p.county)}`;
  if (p.street) return `${p.street}, ${tail(p.city ?? p.county)}`;
  if (p.name) return `${p.name}, ${tail(p.city ?? p.county)}`;
  return null;
}

export function parsePhoton(text: string): AddressMatch[] {
  const json = parseJson<PhotonResponse>(text, 'Photon address search');
  if (!Array.isArray(json.features)) throw new SourceError('Photon address search sent an unexpected response.', 'format');
  const out: AddressMatch[] = [];
  const seen = new Set<string>();
  for (const f of json.features) {
    const p = f.properties ?? {};
    if (p.countrycode && p.countrycode !== 'US') continue;
    const [lon, lat] = f.geometry?.coordinates ?? [];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const label = photonLabel(p);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push({ label, lat, lon });
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

export async function suggestAddresses(query: string, deps: { fetch: FetchImpl; cache: ResponseCache }, now = new Date()): Promise<AddressMatch[]> {
  const q = query.replace(/\s+/g, ' ').trim();
  if (q.length < 3) return [];
  const url = `${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=10&lang=en&bbox=${US_BBOX}`;
  const res = await deps.cache.getOrFetch(`photon:${q.toLowerCase()}`, 30 * DAY, async () => {
    const text = await fetchOkText(deps.fetch, url, { label: 'Photon address search', timeoutMs: 6000 });
    parsePhoton(text);
    return text;
  }, now);
  return parsePhoton(res.value);
}
