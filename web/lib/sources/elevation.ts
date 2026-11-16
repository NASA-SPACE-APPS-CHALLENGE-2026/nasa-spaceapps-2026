import { samplePointsInside } from '../domain/acreage';
import { SOURCE_META } from '../domain/sourceMeta';
import type { LonLat, ProfileValue, SourceResult } from '../domain/types';
import { DAY } from '../server/cache';
import { fetchOkText, mapLimit, parseJson, SourceError } from '../server/http';
import { messageOf } from './power';
import type { ProfileSource, SourceContext, SourceDeps } from './types';

const EPQS_URL = 'https://epqs.nationalmap.gov/v1/json';
const NODATA = -1000000;

export interface ElevationSample {
  point: LonLat;
  meters: number;
  resolutionM: number | null;
}

/** EPQS answers `{ value: "328.92", resolution: 1, ... }`, or the plain text "Call failed." on errors. */
export function parseEpqs(text: string): { meters: number; resolutionM: number | null } {
  const json = parseJson<{ value?: string | number; resolution?: number }>(text, 'USGS elevation service');
  const meters = Number(json.value);
  if (!Number.isFinite(meters) || meters <= NODATA) {
    throw new SourceError('USGS elevation service has no elevation for this point.', 'empty');
  }
  return { meters, resolutionM: typeof json.resolution === 'number' ? json.resolution : null };
}

/**
 * Least-squares plane z = a·x + b·y + c through the samples (x, y in metres east/north of the first point).
 * Returns the slope of that plane in percent, or null when the points are too few or nearly collinear.
 */
export function planeSlopePct(samples: ElevationSample[]): number | null {
  if (samples.length < 3) return null;
  const [lon0, lat0] = samples[0].point;
  const R = 6371008.8;
  const k = Math.PI / 180;
  const pts = samples.map((s) => ({
    x: (s.point[0] - lon0) * k * R * Math.cos(lat0 * k),
    y: (s.point[1] - lat0) * k * R,
    z: s.meters,
  }));
  let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0, sxz = 0, syz = 0, sz = 0;
  for (const p of pts) {
    sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y;
    sx += p.x; sy += p.y; sz += p.z; sxz += p.x * p.z; syz += p.y * p.z;
  }
  const n = pts.length;
  // Solve [[sxx,sxy,sx],[sxy,syy,sy],[sx,sy,n]] · [a,b,c] = [sxz,syz,sz] by Cramer's rule.
  const det3 = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
  const D = det3(A);
  const scale = Math.max(Math.abs(sxx * syy * n), 1e-9);
  if (Math.abs(D) / scale < 1e-9) return null;
  const a = det3([[sxz, sxy, sx], [syz, syy, sy], [sz, sy, n]]) / D;
  const b = det3([[sxx, sxz, sx], [sxy, syz, sy], [sx, sz, n]]) / D;
  return Math.sqrt(a * a + b * b) * 100;
}

const ftFromM = (m: number) => m * 3.28084;

export function elevationValues(samples: ElevationSample[]): ProfileValue[] {
  const mean = samples.reduce((s, x) => s + x.meters, 0) / samples.length;
  const min = Math.min(...samples.map((s) => s.meters));
  const max = Math.max(...samples.map((s) => s.meters));
  const res = samples.map((s) => s.resolutionM).filter((r): r is number => r !== null);
  const resText = res.length ? ` Source grid about ${Math.min(...res)} m.` : '';
  const values: ProfileValue[] = [
    {
      key: 'elevationMean',
      label: 'Average elevation',
      value: Math.round(ftFromM(mean)),
      unit: 'ft',
      note: `USGS 3DEP ground elevation model (mostly lidar), averaged over ${samples.length} point${samples.length === 1 ? '' : 's'} in the field.${resText}`,
    },
  ];
  if (samples.length >= 2) {
    values.push({
      key: 'elevationRange',
      label: 'Height difference across the field',
      value: Math.round(ftFromM(max - min)),
      unit: 'ft',
      note: `Highest minus lowest of the ${samples.length} sample points.`,
    });
  }
  const slope = planeSlopePct(samples);
  if (slope !== null) {
    values.push({
      key: 'slopePct',
      label: 'Average slope',
      value: Math.round(slope * 10) / 10,
      unit: '%',
      note: `Plane fitted through ${samples.length} elevation points. Steeper spots and dips between points are not captured.`,
    });
  }
  return values;
}

/**
 * EPQS is flaky (tested 2026-11-14): instant HTTP 500s and 29-second 504s, even for sequential calls.
 * Fast 5xx answers are retried twice with a short pause; timeouts are not retried (they already cost ~30 s).
 */
async function fetchWithRetry(deps: SourceDeps, url: string, delays = [400, 1200]): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchOkText(deps.fetch, url, { label: 'USGS elevation service', timeoutMs: 35000 });
    } catch (err) {
      const retryable = err instanceof SourceError && err.kind === 'http' && (err.status ?? 0) >= 500 && err.status !== 504;
      if (!retryable || attempt >= delays.length) throw err;
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
}

export const elevationSource: ProfileSource = {
  id: 'elevation',
  async run(ctx: SourceContext, deps: SourceDeps): Promise<SourceResult> {
    const meta = SOURCE_META.elevation;
    const base = { sourceId: meta.id, sourceName: meta.provider, docsUrl: meta.docsUrl, values: [] as ProfileValue[] };
    try {
      const points = samplePointsInside(ctx.geometry, 3, 9);
      let fetchedAt: string | undefined;
      let lastError: unknown;
      const results = await mapLimit(points, 3, async (point) => {
        const [x, y] = point.map((v) => Math.round(v * 1e6) / 1e6);
        const url = `${EPQS_URL}?x=${x}&y=${y}&wkid=4326&units=Meters&includeDate=false`;
        try {
          const res = await deps.cache.getOrFetch(`epqs:${url}`, 365 * DAY, async () => {
            const text = await fetchWithRetry(deps, url);
            parseEpqs(text); // only cache answers that parse
            return text;
          }, ctx.now);
          if (!fetchedAt || res.fetchedAt < fetchedAt) fetchedAt = res.fetchedAt;
          return { point, ...parseEpqs(res.value) } as ElevationSample;
        } catch (err) {
          lastError = err;
          return null;
        }
      });
      const samples = results.filter((s): s is ElevationSample => s !== null);
      if (samples.length === 0) {
        return { ...base, status: 'unavailable', message: lastError ? messageOf(lastError) : 'No elevation could be read for this field.' };
      }
      const missing = points.length - samples.length;
      return {
        ...base,
        status: 'ok',
        fetchedAt,
        message: missing > 0 ? `${missing} of ${points.length} elevation points could not be read; values use the remaining ${samples.length}.` : undefined,
        values: elevationValues(samples),
      };
    } catch (err) {
      return { ...base, status: 'unavailable', message: messageOf(err) };
    }
  },
};
