import { describe, expect, it } from 'vitest';
import { MemoryCache } from '@/lib/server/cache';
import { geocodeAddress, parseCensus, prettyAddress } from '@/lib/server/geocode';
import { parsePhoton, photonLabel, suggestAddresses } from '@/lib/server/photon';
import { fixture, mockFetch, text } from './helpers';

describe('US Census geocoder', () => {
  it('parses the recorded live match', () => {
    expect(parseCensus(fixture('census-match.json'))).toEqual([{ label: '2229 Lincoln Way, Ames, IA 50014', lat: 42.022837310681, lon: -93.645006093851 }]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(parseCensus(fixture('census-none.json'))).toEqual([]);
  });

  it('caps ambiguous results at five', () => {
    const m = parseCensus(fixture('census-multi.json'));
    expect(m).toHaveLength(5);
    expect(m[0].label).toBe('100 Main St, Springfield, CO 81073');
  });

  it('reports the service error text for bad input', () => {
    expect(() => parseCensus('{"errors":["Address cannot be empty and cannot exceed 100 characters"],"status":"400"}')).toThrow(/cannot exceed 100/);
  });

  it('formats addresses for people', () => {
    expect(prettyAddress('100 MAIN ST, SPRINGFIELD, MA, 01151')).toBe('100 Main St, Springfield, MA 01151');
    expect(prettyAddress('RURAL ROUTE 2')).toBe('Rural Route 2');
  });

  it('caches by normalised address and only calls the service once', async () => {
    const f = mockFetch([[/geocoding\.geo\.census\.gov/, () => text(fixture('census-match.json'))]]);
    const deps = { fetch: f, cache: new MemoryCache() };
    await geocodeAddress('2229 Lincoln Way,  Ames, IA 50011', deps);
    await geocodeAddress('2229 lincoln way, ames, ia 50011', deps);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toContain('address=2229%20Lincoln%20Way%2C%20Ames%2C%20IA%2050011');
  });

  it('surfaces HTTP failures', async () => {
    const f = mockFetch([[/geocoding/, () => text('busy', 503)]]);
    await expect(geocodeAddress('1 Main St, Ames, IA', { fetch: f, cache: new MemoryCache() })).rejects.toThrow(/HTTP 503/);
  });
});

describe('Photon type-ahead suggestions', () => {
  it('collapses POIs at one street address into a single US-style label (recorded live response)', () => {
    const m = parsePhoton(fixture('photon-lincoln.json'));
    expect(m).toEqual([{ label: '2229 Lincoln Way, Ames, IA 50014', lat: expect.any(Number), lon: expect.any(Number) }]);
    expect(m[0].lat).toBeCloseTo(42.024, 2);
    expect(m[0].lon).toBeCloseTo(-93.646, 2);
  });

  it('labels towns, counties and streets, de-duplicated, at most five', () => {
    const labels = parsePhoton(fixture('photon-town.json')).map((x) => x.label);
    expect(labels).toContain('Boone County, IA');
    expect(labels).toContain('Boone, IA 50036');
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.length).toBeLessThanOrEqual(5);
    expect(photonLabel({ type: 'street', name: '280th St', city: 'Boone', state: 'Iowa' })).toBe('280th St, Boone, IA');
  });

  it('drops non-US results, ignores short queries, and caches by query', async () => {
    const body = JSON.stringify({ features: [{ properties: { countrycode: 'CA', type: 'city', name: 'Ottawa', state: 'Ontario' }, geometry: { coordinates: [-75.7, 45.4] } }] });
    expect(parsePhoton(body)).toEqual([]);
    const f = mockFetch([[/photon\.komoot\.io/, () => text(fixture('photon-lincoln.json'))]]);
    const cache = new MemoryCache();
    expect(await suggestAddresses('22', { fetch: f, cache })).toEqual([]);
    await suggestAddresses('2229 lincoln way am', { fetch: f, cache });
    await suggestAddresses('2229  Lincoln Way AM ', { fetch: f, cache });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toMatch(/bbox=-125,24,-66,50/);
  });

  it('reports a format error for unexpected bodies', () => {
    expect(() => parsePhoton('{"oops":1}')).toThrow(/unexpected response/);
  });
});
