import { SOURCE_META } from '../domain/sourceMeta';
import type { LonLat, ProfileValue, SourceResult } from '../domain/types';
import { DAY } from '../server/cache';
import { mapLimit } from '../server/http';
import { centreOrMean, checkEarthdataToken, dapSubset, devHint, EarthdataLicenceError, findGranules } from './earthdata';
import { messageOf } from './power';
import type { ProfileSource, SourceContext, SourceDeps } from './types';

/**
 * NASA GPM IMERG daily precipitation, Late run (GPM_3IMERGDL v07, 0.1°, ~1 day behind).
 * One tiny OPeNDAP subset per day; past days never change so each is cached for a year.
 */
const SHORT_NAME = 'GPM_3IMERGDL';
const VERSION = '07';
const WINDOW_DAYS = 30;
const MIN_DAYS = 25;
const LABEL = 'NASA GPM IMERG';

/** Grid indices on the IMERG 0.1° grid (lon −180…180 = 3600 columns, lat −90…90 = 1800 rows). */
export function imergIndex([lon, lat]: LonLat): { lonIdx: number; latIdx: number } {
  return {
    lonIdx: Math.min(3599, Math.max(0, Math.floor((lon + 180) / 0.1))),
    latIdx: Math.min(1799, Math.max(0, Math.floor((lat + 90) / 0.1))),
  };
}

const validMm = (v: number) => Number.isFinite(v) && v >= 0 && v < 2000;
const mmToIn = (mm: number) => Math.round((mm / 25.4) * 100) / 100;

export interface RainDay {
  date: string;
  mm: number;
}

export function imergValues(days: RainDay[]): ProfileValue[] {
  const newest = days[0].date;
  const last7 = days.filter((d) => Date.parse(d.date) > Date.parse(newest) - 7 * DAY);
  const total = days.reduce((s, d) => s + d.mm, 0);
  const wettest = days.reduce((a, b) => (b.mm > a.mm ? b : a));
  return [
    { key: 'imergRain30', label: `Rain, last ${days.length} days (satellite)`, value: mmToIn(total), unit: 'in', honesty: 'Estimated' },
    { key: 'imergRain7', label: 'Rain, last 7 days', value: mmToIn(last7.reduce((s, d) => s + d.mm, 0)), unit: 'in', honesty: 'Estimated' },
    { key: 'imergWettest', label: 'Wettest day', value: mmToIn(wettest.mm), unit: 'in', honesty: 'Estimated' },
  ];
}

export const imergSource: ProfileSource = {
  id: 'imerg',
  async run(ctx: SourceContext, deps: SourceDeps): Promise<SourceResult> {
    const meta = SOURCE_META.imerg;
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
      const { lonIdx, latIdx } = imergIndex(ctx.point);
      const ce = `/precipitation[0:0][${lonIdx - 1}:${lonIdx + 1}][${latIdx - 1}:${latIdx + 1}]`;
      const granules = (await findGranules(deps, SHORT_NAME, VERSION, new Date(ctx.now.getTime() - (WINDOW_DAYS + 4) * DAY), ctx.now, ctx.now)).slice(0, WINDOW_DAYS);
      const read = await mapLimit(granules, 6, async (g) => {
        const v = await dapSubset(deps, token, g.opendap, ce, LABEL, ctx.now);
        const mm = centreOrMean(v.precipitation, validMm);
        return mm === null ? null : { date: g.date, mm };
      });
      const days = read.filter((d): d is RainDay => d !== null);
      if (days.length < MIN_DAYS) {
        return { ...base, status: 'unavailable', fetchedAt: ctx.now.toISOString(), message: `Only ${days.length} recent days of satellite rain are available.` };
      }
      return { ...base, status: 'ok', fetchedAt: ctx.now.toISOString(), values: imergValues(days) };
    } catch (err) {
      if (err instanceof EarthdataLicenceError) {
        devHint(`IMERG is off until the "NASA GESDISC DATA ARCHIVE" licence is approved on the Earthdata account${err.approveUrl ? `: ${err.approveUrl}` : ' (Earthdata profile > Applications > Approved applications)'}.`);
        return { ...base, status: 'needs_token', message: 'Not available yet.' };
      }
      return { ...base, status: 'unavailable', message: messageOf(err) };
    }
  },
};
