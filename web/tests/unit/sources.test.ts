import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { squareAroundPoint } from '@/lib/domain/acreage';
import { MemoryCache } from '@/lib/server/cache';
import { albersToLonLat, detectCdl, dominantClass, lonLatToAlbers, parseCdlValue, parseReturnUrl, resetCdlBreaker, zonalHistogram } from '@/lib/sources/cdl';
import { imergSource, smapSource } from '@/lib/sources/earthdataStubs';
import { compositeCode, ndviSource, readNdvi, sinusoidalToLonLat } from '@/lib/sources/ndvi';
import { elevationSource, parseEpqs, planeSlopePct } from '@/lib/sources/elevation';
import { gddF, parseDaily, powerSource } from '@/lib/sources/power';
import { runSource, SOURCES } from '@/lib/sources/registry';
import { parseTable, ssurgoSource, toWkt } from '@/lib/sources/ssurgo';
import type { SourceContext } from '@/lib/sources/types';
import { AMES_FIELD, deps, fixture, mockFetch, NOW, text } from './helpers';

const ctx: SourceContext = { geometry: AMES_FIELD, point: [-93.738, 42.008], bbox: [-93.742, 42.006, -93.734, 42.01], now: NOW };

describe('NASA POWER', () => {
  const routes = () =>
    mockFetch([
      [/temporal\/daily\/point/, () => text(fixture('power-daily.json'))],
      [/temporal\/climatology\/point/, () => text(fixture('power-climatology.json'))],
    ]);

  it('summarises the recorded live response (last 30 complete days vs 1991–2020 normal)', async () => {
    const r = await powerSource.run(ctx, deps(routes()));
    expect(r.status).toBe('ok');
    const v = Object.fromEntries(r.values.map((x) => [x.key, x.value]));
    expect(v).toMatchObject({ rain30: 3.44, rainNormal: 2.24, avgHigh: 63.6, avgLow: 45.5, tempVsNormal: '+9.2', gdd30: 217 });
    expect(r.values.every((x) => x.honesty === 'Estimated')).toBe(true);
    expect(r.message).toMatch(/Oct 13, 2026 – Nov 11, 2026/);
    expect(r.fetchedAt).toBe(NOW.toISOString());
  });

  it('drops -999 fill values and implausible values', () => {
    const rows = parseDaily({ properties: { parameter: { T2M_MAX: { '20261101': 10, '20261102': -999, '20261103': 99 }, T2M_MIN: { '20261101': 1, '20261102': 2, '20261103': 3 }, PRECTOTCORR: { '20261101': 0, '20261102': 1, '20261103': 2 } } } });
    expect(rows.map((r) => r.date)).toEqual(['20261101']);
  });

  it('computes GDD with the 50/86 °F method', () => {
    expect(gddF(30, 20)).toBeCloseTo((86 + 68) / 2 - 50, 5);
    expect(gddF(5, -5)).toBe(0);
  });

  it('reports unavailable with a plain message on HTTP errors and bad JSON', async () => {
    const down = mockFetch([[/power\.larc/, () => text('Service Unavailable', 503)]]);
    const r = await powerSource.run(ctx, deps(down));
    expect(r).toMatchObject({ status: 'unavailable', values: [] });
    expect(r.message).toMatch(/NASA POWER.*HTTP 503/);
    const garbage = mockFetch([[/power\.larc/, () => text('<html>oops</html>')]]);
    expect((await powerSource.run(ctx, deps(garbage))).message).toMatch(/not the expected data format/);
  });

  it('caches responses', async () => {
    const f = routes();
    const d = deps(f);
    await powerSource.run(ctx, d);
    await powerSource.run(ctx, d);
    expect(f.calls).toHaveLength(2); // daily + climatology once each
  });
});

describe('USDA SSURGO (Soil Data Access)', () => {
  it('area-weights the recorded live response', async () => {
    const f = mockFetch([[/sdmdataaccess/, (_u, init) => text(fixture(String(init?.body).includes('GetClippedMapunits') ? 'sda-mukeys.json' : 'sda-properties.json'))]]);
    const r = await ssurgoSource.run(ctx, deps(f));
    expect(r.status).toBe('ok');
    const v = Object.fromEntries(r.values.map((x) => [x.key, x]));
    expect(v.dominantSoil.value).toMatch(/^Webster clay loam/);
    expect(v.dominantSoil.note).toMatch(/about 37% of the field; 6 soil map units/);
    expect(v.texture.value).toBe('Clay loam');
    expect(v.drainage.value).toBe('Poorly drained');
    expect(v.hydrologicGroup.value).toBe('C/D');
    expect(v.organicMatter.value).toBeGreaterThan(5);
    expect(v.organicMatter.value).toBeLessThan(6.5);
    expect(r.values.every((x) => x.honesty === 'Estimated')).toBe(true);
  });

  it('says plainly when no survey covers the location (SDA returns {})', async () => {
    const f = mockFetch([[/sdmdataaccess/, () => text('{}')]]);
    const r = await ssurgoSource.run(ctx, deps(f));
    expect(r.status).toBe('unavailable');
    expect(r.message).toMatch(/No soil survey/);
  });

  it('surfaces SDA error text from the XML error body', async () => {
    const f = mockFetch([[/sdmdataaccess/, () => text(fixture('sda-error.xml'), 400)]]);
    const r = await ssurgoSource.run(ctx, deps(f));
    expect(r.message).toMatch(/HTTP 400.*Invalid query/);
  });

  it('builds safe WKT and parses COLUMNNAME tables', () => {
    expect(toWkt(AMES_FIELD)).toBe('POLYGON((-93.742000 42.006000, -93.734000 42.006000, -93.734000 42.010000, -93.742000 42.010000, -93.742000 42.006000))');
    expect(parseTable('{"Table":[["a","b"],["1",null]]}')).toEqual([{ a: '1', b: null }]);
    expect(parseTable('{}')).toEqual([]);
  });
});

describe('USGS elevation (EPQS)', () => {
  it('parses the recorded live response and rejects no-data', () => {
    expect(parseEpqs(fixture('epqs.json'))).toEqual({ meters: 328.928375244, resolutionM: 1 });
    expect(() => parseEpqs('{"value":"-1000000"}')).toThrow(/no elevation/);
    expect(() => parseEpqs('Call failed.  [Failed cloud operation]')).toThrow(/not the expected data format/);
  });

  it('fits a plane: a field rising 2 m per 100 m northward has 2% slope', () => {
    const samples = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => {
      const lon = -93.74 + i * 0.002;
      const lat = 42.0 + j * 0.002;
      return { point: [lon, lat] as [number, number], meters: 300 + (lat - 42.0) * 111195 * 0.02, resolutionM: 1 };
    }));
    expect(planeSlopePct(samples)).toBeCloseTo(2, 1);
    expect(planeSlopePct(samples.slice(0, 2))).toBeNull();
  });

  it('labels elevation Measured and slope Estimated; survives some failed points', async () => {
    let n = 0;
    const f = mockFetch([[/epqs\.nationalmap/, (url) => {
      n++;
      if (n === 1) return text('Call failed.');
      const y = Number(new URL(url).searchParams.get('y'));
      return text(JSON.stringify({ value: String(300 + (y - 42.006) * 111195 * 0.01), resolution: 1 }));
    }]]);
    const r = await elevationSource.run(ctx, deps(f));
    expect(r.status).toBe('ok');
    expect(r.message).toMatch(/1 of 9 elevation points could not be read/);
    const v = Object.fromEntries(r.values.map((x) => [x.key, x]));
    expect(v.elevationMean.honesty).toBe('Measured');
    expect(v.slopePct.honesty).toBe('Estimated');
    expect(v.slopePct.value).toBeCloseTo(1, 0);
  });

  it('is unavailable when every point fails', async () => {
    const f = mockFetch([[/epqs/, () => text('Call failed.')]]);
    expect((await elevationSource.run(ctx, deps(f))).status).toBe('unavailable');
  });
});

describe('Earthdata stubs (SMAP, IMERG)', () => {
  it('needs a token when EARTHDATA_TOKEN is unset, without any network call', async () => {
    const f = mockFetch([]);
    const r = await smapSource.run(ctx, deps(f));
    expect(r).toMatchObject({ status: 'needs_token', values: [], message: 'Not available yet.' });
    expect(JSON.stringify(r)).not.toMatch(/EARTHDATA_TOKEN|env/);
    expect(f.calls).toHaveLength(0);
  });

  it('validates a token and then says "not built yet" with no values', async () => {
    const f = mockFetch([[/cmr\.earthdata/, (_u, init) => text('{}', (init?.headers as Record<string, string>).Authorization === 'Bearer good' ? 200 : 401)]]);
    const ok = await imergSource.run(ctx, deps(f, { EARTHDATA_TOKEN: 'good' }));
    expect(ok).toMatchObject({ status: 'not_built', values: [] });
    expect(ok.message).toMatch(/Coming soon/);
    const bad = await imergSource.run(ctx, deps(f, { EARTHDATA_TOKEN: 'bad' }));
    expect(bad).toMatchObject({ status: 'needs_token' });
    expect(bad.message).toBe('Not available right now.');
  });
});

describe('NASA MODIS NDVI (ORNL DAAC)', () => {
  it('computes composite codes and sinusoidal coordinates', () => {
    expect(compositeCode(new Date('2026-11-14T00:00:00Z'))).toBe('A2026305');
    const [lon, lat] = sinusoidalToLonLat(-7723423.02 + 4.5 * 231.656358264, 4672508.71 + 4.5 * 231.656358264);
    expect(lat).toBeCloseTo(42.031, 2);
    expect(lon).toBeCloseTo(-93.497, 2);
  });

  it('averages clear pixels inside the field from the recorded live response', () => {
    const big = { type: 'Polygon' as const, coordinates: [[[-93.505, 42.025], [-93.489, 42.025], [-93.489, 42.037], [-93.505, 42.037], [-93.505, 42.025]]] };
    const r = readNdvi(JSON.parse(fixture('modis-ndvi.json')), JSON.parse(fixture('modis-reliability.json')), big, [-93.497, 42.031]);
    expect(r).toMatchObject({ date: '2026-10-16', insideField: true });
    expect(r!.pixels).toBeGreaterThan(10);
    expect(r!.ndvi).toBeGreaterThan(0.1);
    expect(r!.ndvi).toBeLessThan(0.6);
  });

  it('runs end to end with mocked responses and labels values', async () => {
    const f = mockFetch([
      [/pixel_reliability/, () => text(fixture('modis-reliability.json'))],
      [/startDate=A2025/, () => text(fixture('modis-ndvi-lastyear.json'))],
      [/250m_16_days_NDVI/, () => text(fixture('modis-ndvi.json'))],
    ]);
    const wide = { ...ctx, geometry: { type: 'Polygon' as const, coordinates: [[[-93.505, 42.025], [-93.489, 42.025], [-93.489, 42.037], [-93.505, 42.037], [-93.505, 42.025]]] }, point: [-93.497, 42.031] as [number, number] };
    const r = await ndviSource.run(wide, deps(f));
    expect(r.status).toBe('ok');
    expect(r.values.map((v) => [v.key, v.honesty])).toEqual([
      ['ndviLatest', 'Measured'],
      ['ndviLastYear', 'Measured'],
    ]);
  });
});

describe('source isolation', () => {
  const original = SOURCES.power.run;
  afterEach(() => {
    SOURCES.power.run = original;
  });

  it('turns an unexpected throw into "unavailable" instead of propagating', async () => {
    SOURCES.power.run = async () => {
      throw new Error('boom');
    };
    const r = await runSource('power', AMES_FIELD, deps(mockFetch([])), NOW);
    expect(r).toMatchObject({ status: 'unavailable', sourceId: 'power' });
    expect(r.message).toMatch(/boom/);
  });
});

describe('USDA Cropland Data Layer (CropScape)', () => {
  beforeEach(() => resetCdlBreaker());

  it('parses the recorded GetCDLValue response and faults', () => {
    expect(parseCdlValue(fixture('cdl-value-2025.xml'))).toEqual({ code: 5, name: 'Soybeans' });
    expect(() => parseCdlValue(fixture('cdl-value-fault.xml'))).toThrow(/Failed to get value/);
    expect(parseReturnUrl('<returnURL>https://x.test/a.tif</returnURL>')).toBe('https://x.test/a.tif');
  });

  it('round-trips Albers (EPSG:5070) like the live probe', () => {
    const [x, y] = lonLatToAlbers([-93.738, 42.008]);
    expect(x).toBeCloseTo(186047.4, 0);
    expect(y).toBeCloseTo(2114021.6, 0);
    const back = albersToLonLat([x, y]);
    expect(back[0]).toBeCloseTo(-93.738, 6);
  });

  it('counts only pixels inside the field and ignores no-data for the share', () => {
    const [x0, y0] = lonLatToAlbers([-93.745, 42.013]); // NW of the field
    const width = 30;
    const height = 20;
    const data = new Uint8Array(width * height).map((_, i) => (i % width < 15 ? 1 : 5)); // west half corn, east half soy
    const counts = zonalHistogram({ width, height, originX: x0, originY: y0, resX: 30, resY: -30, data }, AMES_FIELD);
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(150);
    expect(total).toBeLessThan(width * height);
    expect(dominantClass(new Map([[1, 70], [5, 30], [81, 500]]))).toEqual({ code: 1, share: 0.7, total: 100 });
    expect(dominantClass(new Map([[0, 10]]))).toBeNull();
  });

  it('falls back to point sampling when the area endpoint fails, then skips it while the breaker is open', async () => {
    const f = mockFetch([
      [/GetCDLFile/, () => text('timeout', 504)],
      [/GetCDLValue\?year=2025/, () => text(fixture('cdl-value-2025.xml'))],
      [/GetCDLValue\?year=2024/, () => text('<Result>{x: 1, y: 2, value: 1, category: "Corn", color: "#FFD400"}</Result>')],
    ]);
    const d = deps(f);
    const r = await detectCdl(AMES_FIELD, [2025, 2024], d, NOW);
    expect(r.status).toBe('ok');
    expect(r.years.map((y) => [y.year, y.detection?.cdlName, y.detection?.method, y.detection?.sharePct])).toEqual([
      [2025, 'Soybeans', 'sampled', 100],
      [2024, 'Corn', 'sampled', 100],
    ]);
    const fileCalls = f.calls.filter((u) => u.includes('GetCDLFile')).length;
    await detectCdl(squareAroundPoint([-93.6, 42.05], 40), [2025], { ...d, cache: new MemoryCache() }, NOW);
    expect(f.calls.filter((u) => u.includes('GetCDLFile')).length).toBe(fileCalls); // breaker open
  });

  it('does not prefill a year when no class covers at least half the samples', async () => {
    let i = 0;
    const names = ['Corn', 'Soybeans', 'Developed/Low Intensity', 'Grass/Pasture', 'Oats'];
    const codes = [1, 5, 122, 176, 28];
    const f = mockFetch([
      [/GetCDLFile/, () => text('timeout', 504)],
      [
        /GetCDLValue\?year=2025/,
        () => {
          const k = i++ % 5;
          return text(`<Result>{x: 1, y: 2, value: ${codes[k]}, category: "${names[k]}", color: "#000"}</Result>`);
        },
      ],
      [/GetCDLValue\?year=2024/, () => text(fixture('cdl-value-2025.xml'))],
    ]);
    const r = await detectCdl(AMES_FIELD, [2025, 2024], deps(f), NOW);
    expect(r.status).toBe('partial');
    expect(r.years[0]).toMatchObject({ year: 2025, detection: null });
    expect(r.years[0].message).toMatch(/mix of crops/);
    expect(r.years[1].detection?.cdlName).toBe('Soybeans');
    expect(r.message).toMatch(/For 2025, the crop maps show a mix/);
  });

  it('reports unavailable plainly when CropScape is down entirely', async () => {
    const f = mockFetch([[/CDLService/, () => text(fixture('cdl-value-fault.xml'), 500)]]);
    const r = await detectCdl(AMES_FIELD, [2025], deps(f), NOW);
    expect(r.status).toBe('unavailable');
    expect(r.message).toMatch(/enter past crops by hand/i);
  });

  it('skips fields outside the lower 48', async () => {
    const f = mockFetch([]);
    const r = await detectCdl(squareAroundPoint([-149.9, 61.2], 40), [2025], deps(f), NOW);
    expect(r.status).toBe('unavailable');
    expect(f.calls).toHaveLength(0);
  });
});
