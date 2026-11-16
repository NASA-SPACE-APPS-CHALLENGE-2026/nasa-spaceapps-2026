import { insideGeometry } from '../domain/acreage';
import { SOURCE_META } from '../domain/sourceMeta';
import type { FieldGeometry, LonLat, ProfileValue, SourceResult } from '../domain/types';
import { DAY } from '../server/cache';
import { fetchOkText, parseJson, SourceError } from '../server/http';
import { messageOf } from './power';
import type { ProfileSource, SourceContext, SourceDeps } from './types';

/**
 * NASA MODIS Terra vegetation index (MOD13Q1, 250 m, 16-day composites) via the ORNL DAAC MODIS web service.
 * No login needed. Tested live 2026-11-14: each subset call takes 30–60 s, so calls run in parallel and are cached.
 * https://modis.ornl.gov/data/modis_webservice.html
 */
const BASE = 'https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset';
const NDVI_BAND = '250m_16_days_NDVI';
const QA_BAND = '250m_16_days_pixel_reliability';
const FILL = -3000;
const SCALE = 0.0001;
/** MODIS sinusoidal sphere radius (m). */
const R = 6371007.181;

interface Subset {
  xllcorner: string;
  yllcorner: string;
  cellsize: number;
  nrows: number;
  ncols: number;
  subset?: Array<{ modis_date: string; calendar_date: string; data: number[] }>;
}

export function sinusoidalToLonLat(x: number, y: number): LonLat {
  const lat = y / R;
  return [((x / (R * Math.cos(lat))) * 180) / Math.PI, (lat * 180) / Math.PI];
}

/** "A2026289" for a date: the 16-day composite (day of year 1, 17, 33, …) that contains it. */
export function compositeCode(d: Date): string {
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const doy = Math.floor((d.getTime() - start) / DAY) + 1;
  const compositeDoy = 1 + Math.floor((doy - 1) / 16) * 16;
  return `A${d.getUTCFullYear()}${String(compositeDoy).padStart(3, '0')}`;
}

export interface NdviReading {
  date: string;
  /** Mean NDVI over usable pixels (0–1 scale). */
  ndvi: number;
  pixels: number;
  insideField: boolean;
}

/**
 * Mean NDVI over pixels whose centre is inside the field and whose reliability is good (0) or marginal (1).
 * Small fields with no pixel centre inside fall back to the nearest usable pixel and are marked as such.
 */
export function readNdvi(ndvi: Subset, qa: Subset | null, geometry: FieldGeometry, point: LonLat, wantedCode?: string): NdviReading | null {
  const composites = (ndvi.subset ?? []).filter((s) => !wantedCode || s.modis_date === wantedCode);
  for (const comp of [...composites].reverse()) {
    const qaData = qa?.subset?.find((s) => s.modis_date === comp.modis_date)?.data;
    const x0 = Number(ndvi.xllcorner);
    const y0 = Number(ndvi.yllcorner);
    const inside: number[] = [];
    let nearest: { d: number; v: number } | null = null;
    comp.data.forEach((raw, i) => {
      if (raw === FILL || raw < -2000 || raw > 10000) return;
      const rel = qaData?.[i];
      if (rel !== undefined && rel !== 0 && rel !== 1) return; // 2 = snow/ice, 3 = cloudy, -1 = no data
      const row = Math.floor(i / ndvi.ncols);
      const col = i % ndvi.ncols;
      const center = sinusoidalToLonLat(x0 + (col + 0.5) * ndvi.cellsize, y0 + (ndvi.nrows - row - 0.5) * ndvi.cellsize);
      if (insideGeometry(center, geometry)) inside.push(raw);
      const d = Math.hypot(center[0] - point[0], center[1] - point[1]);
      if (!nearest || d < nearest.d) nearest = { d, v: raw };
    });
    if (inside.length) {
      return { date: comp.calendar_date, ndvi: (inside.reduce((s, v) => s + v, 0) / inside.length) * SCALE, pixels: inside.length, insideField: true };
    }
    const n = nearest as { d: number; v: number } | null;
    if (n) return { date: comp.calendar_date, ndvi: n.v * SCALE, pixels: 1, insideField: false };
  }
  return null;
}

function describe(v: number): string {
  if (v < 0.2) return 'bare soil or residue';
  if (v < 0.4) return 'sparse green cover';
  if (v < 0.6) return 'moderate green cover';
  return 'dense green canopy';
}

function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function ndviValues(now: NdviReading, lastYear: NdviReading | null): ProfileValue[] {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const pixelNote = (r: NdviReading) =>
    r.insideField ? `Average of ${r.pixels} MODIS 250 m pixel${r.pixels === 1 ? '' : 's'} inside the field (clear-sky only).` : 'No 250 m pixel centre falls inside this field, so the nearest pixel is used.';
  const values: ProfileValue[] = [
    { key: 'ndviLatest', label: `Crop greenness (NDVI), ${prettyDate(now.date)}`, value: r2(now.ndvi), note: `${describe(now.ndvi)}. 16-day satellite composite starting ${prettyDate(now.date)}. ${pixelNote(now)} 0 ≈ bare soil, 0.8+ ≈ dense green crop.` },
  ];
  if (lastYear) {
    values.push({ key: 'ndviLastYear', label: `Same time last year (${prettyDate(lastYear.date)})`, value: r2(lastYear.ndvi), note: `${describe(lastYear.ndvi)}. ${pixelNote(lastYear)}` });
  }
  return values;
}

async function subset(deps: SourceDeps, ctx: SourceContext, band: string, start: string, end: string): Promise<{ data: Subset; fetchedAt: string }> {
  const [lon, lat] = ctx.point.map((v) => Math.round(v * 1e4) / 1e4);
  const url = `${BASE}?latitude=${lat}&longitude=${lon}&band=${band}&startDate=${start}&endDate=${end}&kmAboveBelow=1&kmLeftRight=1`;
  const res = await deps.cache.getOrFetch(`ndvi:${url}`, 7 * DAY, async () => {
    const text = await fetchOkText(deps.fetch, url, { label: 'NASA MODIS (ORNL DAAC)', timeoutMs: 120000, headers: { Accept: 'application/json' } });
    const j = parseJson<Subset>(text, 'NASA MODIS (ORNL DAAC)');
    if (!Array.isArray(j.subset) || !j.nrows || !j.ncols) throw new SourceError('NASA MODIS (ORNL DAAC) sent an unexpected response.', 'format');
    return text;
  }, ctx.now);
  return { data: JSON.parse(res.value) as Subset, fetchedAt: res.fetchedAt };
}

export const ndviSource: ProfileSource = {
  id: 'ndvi',
  async run(ctx: SourceContext, deps: SourceDeps): Promise<SourceResult> {
    const meta = SOURCE_META.ndvi;
    const base = { sourceId: meta.id, sourceName: meta.provider, docsUrl: meta.docsUrl, values: [] as ProfileValue[] };
    try {
      // Composites appear ~2–3 weeks after they start, so look back over the last ~64 days.
      const end = compositeCode(ctx.now);
      const start = compositeCode(new Date(ctx.now.getTime() - 64 * DAY));
      const yearBack = (code: string) => `A${Number(code.slice(1, 5)) - 1}${code.slice(5)}`;
      // All three requests in parallel: each takes 30–60 s on this service.
      const [ndvi, qa, ly] = await Promise.all([
        subset(deps, ctx, NDVI_BAND, start, end),
        subset(deps, ctx, QA_BAND, start, end).catch(() => null),
        subset(deps, ctx, NDVI_BAND, yearBack(start), yearBack(end)).catch(() => null),
      ]);
      const latest = readNdvi(ndvi.data, qa?.data ?? null, ctx.geometry, ctx.point);
      if (!latest) return { ...base, status: 'unavailable', fetchedAt: ndvi.fetchedAt, message: 'No clear-sky satellite reading for this field in the last two months (clouds or snow).' };

      // Same composite one year earlier.
      const code = (ndvi.data.subset ?? []).find((s) => s.calendar_date === latest.date)!.modis_date;
      const lastYear = ly ? readNdvi(ly.data, null, ctx.geometry, ctx.point, yearBack(code)) : null;
      return { ...base, status: 'ok', fetchedAt: ndvi.fetchedAt, values: ndviValues(latest, lastYear) };
    } catch (err) {
      return { ...base, status: 'unavailable', message: messageOf(err) };
    }
  },
};
