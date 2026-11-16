import { SOURCE_META } from '../domain/sourceMeta';
import type { ClimateNormals, ProfileValue, SourceResult } from '../domain/types';
import { DAY, HOUR } from '../server/cache';
import { fetchOkText, parseJson, SourceError } from '../server/http';
import type { ProfileSource, SourceContext, SourceDeps } from './types';

const DAILY_URL = 'https://power.larc.nasa.gov/api/temporal/daily/point';
const CLIMATOLOGY_URL = 'https://power.larc.nasa.gov/api/temporal/climatology/point';
const FILL = -999;
const WINDOW_DAYS = 30;
const REQUEST_DAYS = 45; // POWER lags a few days; request extra and keep the latest 30 complete days.
const MIN_VALID_DAYS = 20;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

/** Physical plausibility ranges (ported from the prototype's NASA POWER validation). */
const VALID: Record<string, (v: number) => boolean> = {
  T2M_MAX: (v) => v >= -90 && v <= 65,
  T2M_MIN: (v) => v >= -90 && v <= 65,
  T2M: (v) => v >= -90 && v <= 65,
  PRECTOTCORR: (v) => v >= 0 && v <= 1000,
};

interface PowerResponse {
  properties?: { parameter?: Record<string, Record<string, number>> };
  messages?: string[];
}

export interface DailyRow {
  date: string; // YYYYMMDD
  tmax: number;
  tmin: number;
  precip: number;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replaceAll('-', '');
}

function clean(param: string, v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v === FILL) return null;
  return VALID[param]?.(v) === false ? null : v;
}

export function parseDaily(json: PowerResponse): DailyRow[] {
  const p = json.properties?.parameter;
  if (!p?.T2M_MAX || !p.T2M_MIN || !p.PRECTOTCORR) {
    throw new SourceError('NASA POWER response did not include the expected daily parameters.', 'format');
  }
  const rows: DailyRow[] = [];
  for (const date of Object.keys(p.T2M_MAX).sort()) {
    const tmax = clean('T2M_MAX', p.T2M_MAX[date]);
    const tmin = clean('T2M_MIN', p.T2M_MIN[date]);
    const precip = clean('PRECTOTCORR', p.PRECTOTCORR[date]);
    if (tmax !== null && tmin !== null && precip !== null) rows.push({ date, tmax, tmin, precip });
  }
  return rows;
}

export interface MonthlyNormals {
  t2m: Record<string, number>;
  precipPerDay: Record<string, number>;
}

export function parseClimatology(json: PowerResponse): MonthlyNormals {
  const p = json.properties?.parameter;
  if (!p?.T2M || !p.PRECTOTCORR) {
    throw new SourceError('NASA POWER climatology did not include T2M and PRECTOTCORR.', 'format');
  }
  const t2m: Record<string, number> = {};
  const precipPerDay: Record<string, number> = {};
  for (const m of MONTHS) {
    const t = clean('T2M', p.T2M[m]);
    const r = clean('PRECTOTCORR', p.PRECTOTCORR[m]);
    if (t === null || r === null) throw new SourceError(`NASA POWER climatology is missing ${m}.`, 'format');
    t2m[m] = t;
    precipPerDay[m] = r;
  }
  return { t2m, precipPerDay };
}

const cToF = (c: number) => (c * 9) / 5 + 32;
const mmToIn = (mm: number) => mm / 25.4;
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Growing degree days, °F, base 50 with the standard 86 °F cap (modified method). */
export function gddF(tmaxC: number, tminC: number): number {
  const hi = Math.min(Math.max(cToF(tmaxC), 50), 86);
  const lo = Math.min(Math.max(cToF(tminC), 50), 86);
  return Math.max(0, (hi + lo) / 2 - 50);
}

export interface PowerSummary {
  start: string;
  end: string;
  days: number;
  rainIn: number;
  normalRainIn: number;
  avgHighF: number;
  avgLowF: number;
  meanTempF: number;
  normalMeanTempF: number;
  gdd: number;
}

export function summarize(rows: DailyRow[], normals: MonthlyNormals): PowerSummary {
  const window = rows.slice(-WINDOW_DAYS);
  if (window.length < MIN_VALID_DAYS) {
    throw new SourceError(`NASA POWER returned only ${window.length} complete recent days (need ${MIN_VALID_DAYS}).`, 'empty');
  }
  let rain = 0, hi = 0, lo = 0, gdd = 0, normalRain = 0, normalT = 0;
  for (const r of window) {
    const month = MONTHS[Number(r.date.slice(4, 6)) - 1];
    rain += r.precip;
    hi += r.tmax;
    lo += r.tmin;
    gdd += gddF(r.tmax, r.tmin);
    normalRain += normals.precipPerDay[month];
    normalT += normals.t2m[month];
  }
  const n = window.length;
  return {
    start: window[0].date,
    end: window[n - 1].date,
    days: n,
    rainIn: r2(mmToIn(rain)),
    normalRainIn: r2(mmToIn(normalRain)),
    avgHighF: r1(cToF(hi / n)),
    avgLowF: r1(cToF(lo / n)),
    meanTempF: r1(cToF((hi + lo) / 2 / n)),
    normalMeanTempF: r1(cToF(normalT / n)),
    gdd: Math.round(gdd),
  };
}

function prettyDate(yyyymmdd: string): string {
  const d = new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const DAYS_IN_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Monthly normals in farmer units (°F, inches per month), January first. */
export function climateNormals(n: MonthlyNormals): ClimateNormals {
  return {
    monthlyMeanTempF: MONTHS.map((m) => r1(cToF(n.t2m[m]))),
    monthlyRainIn: MONTHS.map((m, i) => r2(mmToIn(n.precipPerDay[m] * DAYS_IN_MONTH[i]))),
  };
}

export function summaryValues(s: PowerSummary): ProfileValue[] {
  const grid = 'NASA POWER model grid cell (about 50 km across), not a gauge on your field.';
  const diff = r1(s.meanTempF - s.normalMeanTempF);
  return [
    { key: 'rain30', label: `Rain, last ${s.days} days`, value: s.rainIn, unit: 'in', note: `Bias-corrected precipitation. ${grid}` },
    { key: 'rainNormal', label: 'Normal rain for these dates', value: s.normalRainIn, unit: 'in', note: '1991–2020 POWER climatology.' },
    { key: 'avgHigh', label: 'Average daily high', value: s.avgHighF, unit: '°F', note: grid },
    { key: 'avgLow', label: 'Average daily low', value: s.avgLowF, unit: '°F', note: grid },
    { key: 'tempVsNormal', label: 'Temperature vs normal', value: `${diff > 0 ? '+' : ''}${diff}`, unit: '°F', note: `Mean ${s.meanTempF} °F vs 1991–2020 normal ${s.normalMeanTempF} °F.` },
    { key: 'gdd30', label: `Growing degree days, last ${s.days} days`, value: s.gdd, unit: 'GDD (°F, base 50)', note: 'Modified method, 86 °F cap.' },
  ];
}

export const powerSource: ProfileSource = {
  id: 'power',
  async run(ctx: SourceContext, deps: SourceDeps): Promise<SourceResult> {
    const meta = SOURCE_META.power;
    const base = { sourceId: meta.id, sourceName: meta.provider, docsUrl: meta.docsUrl, values: [] as ProfileValue[] };
    const [lon, lat] = ctx.point.map((v) => Math.round(v * 100) / 100);
    const end = new Date(ctx.now.getTime() - DAY);
    const start = new Date(end.getTime() - (REQUEST_DAYS - 1) * DAY);
    const dailyUrl = `${DAILY_URL}?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR&community=AG&longitude=${lon}&latitude=${lat}&start=${ymd(start)}&end=${ymd(end)}&format=JSON`;
    const climUrl = `${CLIMATOLOGY_URL}?parameters=T2M,PRECTOTCORR&community=AG&longitude=${lon}&latitude=${lat}&start=1991&end=2020&format=JSON`;
    try {
      const [daily, clim] = await Promise.all([
        deps.cache.getOrFetch(`power:daily:${dailyUrl}`, 6 * HOUR, () => fetchOkText(deps.fetch, dailyUrl, { label: 'NASA POWER', timeoutMs: 30000 }), ctx.now),
        deps.cache.getOrFetch(`power:clim:${climUrl}`, 30 * DAY, () => fetchOkText(deps.fetch, climUrl, { label: 'NASA POWER climatology', timeoutMs: 30000 }), ctx.now),
      ]);
      const normals = parseClimatology(parseJson(clim.value, 'NASA POWER climatology'));
      const summary = summarize(parseDaily(parseJson(daily.value, 'NASA POWER')), normals);
      return {
        ...base,
        status: 'ok',
        climate: climateNormals(normals),
        fetchedAt: daily.fetchedAt,
        message: `${prettyDate(summary.start)} – ${prettyDate(summary.end)} (latest complete days POWER has published).`,
        values: summaryValues(summary),
      };
    } catch (err) {
      return { ...base, status: 'unavailable', message: messageOf(err) };
    }
  },
};

export function messageOf(err: unknown): string {
  if (err instanceof SourceError) return err.message;
  return `Unexpected error: ${(err as Error)?.message ?? String(err)}`;
}
