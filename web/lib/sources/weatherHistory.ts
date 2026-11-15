import type { MonthlyWeather } from '../domain/finance/weather';
import type { LonLat } from '../domain/types';
import { DAY } from '../server/cache';
import { fetchOkText, parseJson, SourceError } from '../server/http';
import type { SourceDeps } from './types';

/**
 * 40 years of monthly weather for a point from NASA POWER (1985–2024): total rain and the hottest daily high per month.
 * Tested live 2026-11-15: ~0.6 s, 16 KB. Keys are YYYYMM, with month 13 = annual (ignored).
 */
const URL = 'https://power.larc.nasa.gov/api/temporal/monthly/point';
export const FIRST_YEAR = 1985;
export const LAST_YEAR = 2024;
const FILL = -999;

interface PowerMonthly {
  properties?: { parameter?: { PRECTOTCORR_SUM?: Record<string, number>; T2M_MAX?: Record<string, number> } };
}

export function parseMonthly(text: string): MonthlyWeather[] {
  const p = parseJson<PowerMonthly>(text, 'NASA POWER monthly').properties?.parameter;
  if (!p?.PRECTOTCORR_SUM || !p.T2M_MAX) throw new SourceError('NASA POWER monthly response did not include rain and temperature.', 'format');
  const out: MonthlyWeather[] = [];
  for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
    const rain: number[] = [];
    const tmax: number[] = [];
    let ok = true;
    for (let m = 1; m <= 12; m++) {
      const k = `${y}${String(m).padStart(2, '0')}`;
      const r = p.PRECTOTCORR_SUM[k];
      const t = p.T2M_MAX[k];
      if (typeof r !== 'number' || typeof t !== 'number' || r === FILL || t === FILL || r < 0 || r > 2000 || t < -90 || t > 65) ok = false;
      rain.push(r);
      tmax.push(t);
    }
    if (ok) out.push({ year: y, rainMm: rain, maxTempC: tmax });
  }
  if (out.length < 30) throw new SourceError(`NASA POWER returned only ${out.length} complete years of monthly weather.`, 'empty');
  return out;
}

export async function fetchWeatherHistory(point: LonLat, deps: SourceDeps, now = new Date()): Promise<{ years: MonthlyWeather[]; fetchedAt: string }> {
  const [lon, lat] = point.map((v) => Math.round(v * 100) / 100);
  const url = `${URL}?parameters=PRECTOTCORR_SUM,T2M_MAX&community=AG&longitude=${lon}&latitude=${lat}&start=${FIRST_YEAR}&end=${LAST_YEAR}&format=JSON`;
  const res = await deps.cache.getOrFetch(`power:monthly:${url}`, 30 * DAY, async () => {
    const text = await fetchOkText(deps.fetch, url, { label: 'NASA POWER', timeoutMs: 30000 });
    parseMonthly(text);
    return text;
  }, now);
  return { years: parseMonthly(res.value), fetchedAt: res.fetchedAt };
}
