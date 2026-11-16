import { SOURCE_META } from '../domain/sourceMeta';
import type { ProfileValue, SourceResult } from '../domain/types';
import { DAY } from '../server/cache';
import { mapLimit } from '../server/http';
import { centreOrMean, checkEarthdataToken, dapSubset, devHint, EarthdataLicenceError, findGranules } from './earthdata';
import { ease2M09RowCol } from './ease2';
import { messageOf } from './power';
import type { ProfileSource, SourceContext, SourceDeps } from './types';

/**
 * NASA SMAP L3 enhanced passive soil moisture (SPL3SMP_E v006, 9 km, daily, top ~5 cm).
 * One satellite pass covers a given spot only every 2–3 days, so we read the last ~10 daily files
 * and use the newest day that has a value (AM pass first, then PM).
 */
const SHORT_NAME = 'SPL3SMP_E';
const VERSION = '006';
const LOOKBACK_DAYS = 12;
const MAX_DAYS_READ = 10;
const LABEL = 'NASA SMAP';

export const validSm = (v: number) => Number.isFinite(v) && v >= 0 && v <= 0.7;

export interface SmapDay {
  date: string;
  /** Volumetric water content, m³/m³. */
  sm: number;
}

/** Plain-word condition for a surface soil moisture percentage (water by volume). */
export function moistureWord(pct: number): string {
  if (pct < 15) return 'Dry';
  if (pct < 35) return 'Good';
  return 'Wet';
}

function prettyDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function smapValues(days: SmapDay[]): ProfileValue[] {
  const latest = days[0];
  const pct = Math.round(latest.sm * 100);
  const week = days.filter((d) => Date.parse(d.date) >= Date.parse(latest.date) - 6 * DAY);
  const weekPct = Math.round((week.reduce((s, d) => s + d.sm, 0) / week.length) * 100);
  return [
    { key: 'smapLatest', label: `Topsoil moisture (${prettyDay(latest.date)})`, value: pct, unit: '%', note: 'Water by volume in the top 2 inches, 9 km satellite pixel.' },
    { key: 'smapCondition', label: 'Topsoil condition', value: moistureWord(pct) },
    { key: 'smapWeek', label: '7-day average', value: weekPct, unit: '%' },
  ];
}

export const smapSource: ProfileSource = {
  id: 'smap',
  async run(ctx: SourceContext, deps: SourceDeps): Promise<SourceResult> {
    const meta = SOURCE_META.smap;
    const base = { sourceId: meta.id, sourceName: meta.provider, docsUrl: meta.docsUrl, values: [] as ProfileValue[] };
    const token = deps.env.EARTHDATA_TOKEN?.trim();
    if (!token) {
      devHint('EARTHDATA_TOKEN is not set, so SMAP soil moisture and IMERG rainfall are off. Add it to web/.env.local (see .env.example) and restart the server.');
      return { ...base, status: 'needs_token', message: 'Not available yet.' };
    }
    try {
      if ((await checkEarthdataToken(token, deps, ctx.now)) === 'rejected') {
        devHint('NASA Earthdata rejected EARTHDATA_TOKEN (expired or invalid). Generate a new one at https://urs.earthdata.nasa.gov.');
        return { ...base, status: 'needs_token', message: 'Not available right now.' };
      }
      const { row, col } = ease2M09RowCol(ctx.point);
      // A single-cell slice comes back empty from OPeNDAP CSV, so read a 3×3 window and use its centre.
      const w = `[${row - 1}:${row + 1}][${col - 1}:${col + 1}]`;
      const ce = `/Soil_Moisture_Retrieval_Data_AM/soil_moisture${w};/Soil_Moisture_Retrieval_Data_PM/soil_moisture_pm${w}`;
      const granules = (await findGranules(deps, SHORT_NAME, VERSION, new Date(ctx.now.getTime() - LOOKBACK_DAYS * DAY), ctx.now, ctx.now)).slice(0, MAX_DAYS_READ);
      if (!granules.length) return { ...base, status: 'unavailable', message: 'No recent satellite pass yet.' };
      const read = await mapLimit(granules, 4, async (g) => {
        const v = await dapSubset(deps, token, g.opendap, ce, LABEL, ctx.now);
        const sm = centreOrMean(v.soil_moisture, validSm) ?? centreOrMean(v.soil_moisture_pm, validSm);
        return sm === null ? null : { date: g.date, sm };
      });
      const days = read.filter((d): d is SmapDay => d !== null);
      if (!days.length) return { ...base, status: 'unavailable', fetchedAt: ctx.now.toISOString(), message: 'No satellite reading in the last 10 days (frozen or snow-covered ground, or a gap between passes).' };
      return { ...base, status: 'ok', fetchedAt: ctx.now.toISOString(), values: smapValues(days) };
    } catch (err) {
      if (err instanceof EarthdataLicenceError) {
        devHint(`NASA Earthdata needs the NSIDC data licence approved for this account${err.approveUrl ? `: ${err.approveUrl}` : ''}.`);
        return { ...base, status: 'needs_token', message: 'Not available yet.' };
      }
      return { ...base, status: 'unavailable', message: messageOf(err) };
    }
  },
};
