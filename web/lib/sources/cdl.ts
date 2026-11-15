import proj4 from 'proj4';
import { bboxOf, insideGeometry, interiorPoint, samplePointsInside } from '../domain/acreage';
import { CDL_CLASS_NAMES, CDL_NO_DATA, isCdlNonCrop } from '../domain/crops';
import type { CdlDetection, CdlMethod, FieldGeometry, LonLat } from '../domain/types';
import { isInConus } from '../domain/validation';
import { DAY } from '../server/cache';
import { fetchOkText, mapLimit, SourceError } from '../server/http';
import { messageOf } from './power';
import type { SourceDeps } from './types';

/**
 * USDA NASS Cropland Data Layer via CropScape (https://nassgeodata.gmu.edu/CropScape/).
 * Tested live 2026-11-14:
 *  - GetCDLValue (point, Albers x/y) works, 3–7 s per call.
 *  - GetCDLStat and GetCDLFile (area queries) timed out after 90–110 s.
 * So: try a polygon-masked raster clip first (short timeout + circuit breaker), then fall back to sampling points.
 */
const BASE = 'https://nassgeodata.gmu.edu/axis2/services/CDLService';
const ZONAL_TIMEOUT_MS = 20000;
const BREAKER_MS = 10 * 60 * 1000;
const SAMPLE_POINTS = 5;

proj4.defs('EPSG:5070', '+proj=aea +lat_0=23 +lon_0=-96 +lat_1=29.5 +lat_2=45.5 +x_0=0 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
const toAlbers = proj4('EPSG:4326', 'EPSG:5070');

export function lonLatToAlbers(p: LonLat): [number, number] {
  return toAlbers.forward(p) as [number, number];
}
export function albersToLonLat(p: [number, number]): LonLat {
  return toAlbers.inverse(p) as LonLat;
}

/** `<Result>{x: 186047.0, y: 2114021.0, value: 5, category: "Soybeans", color: "#267300"}</Result>` */
export function parseCdlValue(text: string): { code: number; name: string } {
  if (/faultstring/i.test(text)) {
    const msg = text.match(/<faultstring>([\s\S]*?)<\/faultstring>/i)?.[1]?.trim() ?? 'unknown error';
    throw new SourceError(`CropScape could not read this point (${msg}).`, 'http');
  }
  const value = text.match(/value:\s*(-?\d+)/)?.[1];
  const category = text.match(/category:\s*"([^"]*)"/)?.[1];
  if (value === undefined) throw new SourceError('CropScape sent a response that was not the expected format.', 'format');
  const code = Number(value);
  return { code, name: category || CDL_CLASS_NAMES[code] || `CDL class ${code}` };
}

export function parseReturnUrl(text: string): string {
  const url = text.match(/<returnURL>\s*([^<\s]+)\s*<\/returnURL>/i)?.[1];
  if (!url || !/^https?:\/\//.test(url)) throw new SourceError('CropScape did not return a file link.', 'format');
  return url;
}

export type ClassCounts = Map<number, number>;

/** Dominant class and its share, ignoring background / clouds / no-data pixels. */
export function dominantClass(counts: ClassCounts): { code: number; share: number; total: number } | null {
  let total = 0;
  let best: [number, number] | null = null;
  for (const [code, n] of counts) {
    if (CDL_NO_DATA.has(code)) continue;
    total += n;
    if (!best || n > best[1]) best = [code, n];
  }
  if (!best || total === 0) return null;
  return { code: best[0], share: best[1] / total, total };
}

export interface RasterWindow {
  width: number;
  height: number;
  /** Top-left corner of the top-left pixel, EPSG:5070 metres. */
  originX: number;
  originY: number;
  resX: number;
  /** Negative for north-up rasters. */
  resY: number;
  data: ArrayLike<number>;
}

/** Count CDL classes of the pixels whose centre falls inside the field. */
export function zonalHistogram(raster: RasterWindow, geometry: FieldGeometry): ClassCounts {
  const counts: ClassCounts = new Map();
  for (let row = 0; row < raster.height; row++) {
    for (let col = 0; col < raster.width; col++) {
      const x = raster.originX + (col + 0.5) * raster.resX;
      const y = raster.originY + (row + 0.5) * raster.resY;
      if (!insideGeometry(albersToLonLat([x, y]), geometry)) continue;
      const code = raster.data[row * raster.width + col];
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return counts;
}

export function albersBbox(geometry: FieldGeometry, padM = 60): [number, number, number, number] {
  const [minX, minY, maxX, maxY] = bboxOf(geometry);
  const corners = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]].map((p) => lonLatToAlbers(p as LonLat));
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return [Math.floor(Math.min(...xs) - padM), Math.floor(Math.min(...ys) - padM), Math.ceil(Math.max(...xs) + padM), Math.ceil(Math.max(...ys) + padM)];
}

let zonalDownUntil = 0;
export function resetCdlBreaker(): void {
  zonalDownUntil = 0;
}

async function zonalYear(geometry: FieldGeometry, year: number, deps: SourceDeps, now: Date): Promise<{ counts: ClassCounts; fetchedAt: string }> {
  const bbox = albersBbox(geometry).join(',');
  const res = await deps.cache.getOrFetch(`cdl:zonal:${year}:${bbox}`, 30 * DAY, async () => {
    const xml = await fetchOkText(deps.fetch, `${BASE}/GetCDLFile?year=${year}&bbox=${bbox}`, { label: 'CropScape (area clip)', timeoutMs: ZONAL_TIMEOUT_MS });
    const tifUrl = parseReturnUrl(xml);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ZONAL_TIMEOUT_MS);
    try {
      const tifRes = await deps.fetch(tifUrl, { signal: ctl.signal });
      if (!tifRes.ok) throw new SourceError(`CropScape file download failed (HTTP ${tifRes.status}).`, 'http', tifRes.status);
      const { fromArrayBuffer } = await import('geotiff');
      const image = await (await fromArrayBuffer(await tifRes.arrayBuffer())).getImage();
      const [originX, originY] = image.getOrigin();
      const [resX, resY] = image.getResolution();
      const [band] = (await image.readRasters({ interleave: false })) as unknown as ArrayLike<number>[];
      const raster: RasterWindow = { width: image.getWidth(), height: image.getHeight(), originX, originY, resX, resY, data: band };
      return [...zonalHistogram(raster, geometry).entries()];
    } finally {
      clearTimeout(timer);
    }
  }, now);
  return { counts: new Map(res.value), fetchedAt: res.fetchedAt };
}

async function sampledYear(points: LonLat[], year: number, deps: SourceDeps, now: Date): Promise<{ counts: ClassCounts; names: Map<number, string>; fetchedAt: string; failures: number; lastError?: unknown }> {
  const counts: ClassCounts = new Map();
  const names = new Map<number, string>();
  let fetchedAt = now.toISOString();
  let failures = 0;
  let lastError: unknown;
  await mapLimit(points, 4, async (p) => {
    const [x, y] = lonLatToAlbers(p).map((v) => Math.round(v));
    const url = `${BASE}/GetCDLValue?year=${year}&x=${x}&y=${y}`;
    try {
      const res = await deps.cache.getOrFetch(`cdl:value:${url}`, 30 * DAY, async () => {
        const text = await fetchOkText(deps.fetch, url, { label: 'CropScape', timeoutMs: 25000 });
        parseCdlValue(text);
        return text;
      }, now);
      const { code, name } = parseCdlValue(res.value);
      counts.set(code, (counts.get(code) ?? 0) + 1);
      names.set(code, name);
      if (res.fetchedAt < fetchedAt) fetchedAt = res.fetchedAt;
    } catch (err) {
      failures++;
      lastError = err;
    }
  });
  return { counts, names, fetchedAt, failures, lastError };
}

export interface CdlYearResult {
  year: number;
  detection: CdlDetection | null;
  message?: string;
}

export interface CdlResponse {
  status: 'ok' | 'partial' | 'unavailable';
  message?: string;
  years: CdlYearResult[];
}

function toDetection(counts: ClassCounts, names: Map<number, string>, method: CdlMethod, fetchedAt: string): CdlDetection | null {
  const dom = dominantClass(counts);
  if (!dom) return null;
  return {
    cdlCode: dom.code,
    cdlName: names.get(dom.code) ?? CDL_CLASS_NAMES[dom.code] ?? `CDL class ${dom.code}`,
    sharePct: Math.round(dom.share * 100),
    method,
    sampleCount: dom.total,
    nonCrop: isCdlNonCrop(dom.code),
    fetchedAt,
  };
}

export async function detectCdl(geometry: FieldGeometry, years: number[], deps: SourceDeps, now = new Date()): Promise<CdlResponse> {
  if (years.length === 0) return { status: 'ok', years: [] };
  if (!isInConus(interiorPoint(geometry))) {
    return { status: 'unavailable', message: 'The Cropland Data Layer covers the lower 48 states only, so crop history could not be detected here. Enter it by hand.', years: years.map((year) => ({ year, detection: null })) };
  }
  const points = samplePointsInside(geometry, 3, SAMPLE_POINTS);
  const results = await mapLimit(years, 3, async (year): Promise<CdlYearResult> => {
    if (now.getTime() >= zonalDownUntil) {
      try {
        const z = await zonalYear(geometry, year, deps, now);
        const d = toDetection(z.counts, new Map(), 'zonal', z.fetchedAt);
        if (d) return { year, detection: d };
      } catch {
        zonalDownUntil = now.getTime() + BREAKER_MS;
      }
    }
    const s = await sampledYear(points, year, deps, now);
    const d = toDetection(s.counts, s.names, 'sampled', s.fetchedAt);
    if (d) return { year, detection: d };
    return { year, detection: null, message: s.lastError ? messageOf(s.lastError) : 'CropScape has no crop data for this field in this year.' };
  });
  const ok = results.filter((r) => r.detection).length;
  if (ok === results.length) return { status: 'ok', years: results };
  if (ok === 0) {
    return { status: 'unavailable', message: `USDA CropScape is not responding right now (${results[0]?.message ?? 'no data'}). Please enter past crops by hand; you can retry detection later.`, years: results };
  }
  return { status: 'partial', message: `Crop history was detected for ${ok} of ${results.length} years; enter the rest by hand.`, years: results };
}
