import type { CropKey, WeatherYear } from './budget';

/**
 * Stress and good years per crop from 40 years of NASA POWER monthly weather for the field.
 * The thresholds are PlotTwist planning rules (documented in docs/finance-defaults.md), not a crop model:
 *   corn      stress: July rain < 60% of normal, July+August < 60%, a July day ≥ 38 °C (100 °F), or June rain > 200% (flooding)
 *   soybeans  stress: August rain < 50%, July+August < 60%, an August day ≥ 38 °C, or June rain > 200%
 *   small grains stress: May+June rain < 50% or > 170% (disease, lodging), or a June day ≥ 35 °C during grain fill
 *   good year: the crop's key months had 80–140% of normal rain and no heat day for that crop.
 */

export interface MonthlyWeather {
  year: number;
  /** Rain per month, mm, January first. */
  rainMm: number[];
  /** Hottest daily high in each month, °C. */
  maxTempC: number[];
}

export interface WeatherHistory {
  years: MonthlyWeather[];
  /** Per-crop classification for each year (same order as `years`). */
  classes: WeatherYear[];
  stressYears: Record<CropKey, number[]>;
  goodYears: Record<CropKey, number[]>;
}

const JUN = 5, JUL = 6, AUG = 7, MAY = 4;

export function classifyYears(years: MonthlyWeather[]): WeatherHistory {
  const mean = (m: number) => years.reduce((s, y) => s + y.rainMm[m], 0) / Math.max(1, years.length);
  const normal = Array.from({ length: 12 }, (_, m) => mean(m));
  const pct = (y: MonthlyWeather, ...months: number[]) => {
    const n = months.reduce((s, m) => s + normal[m], 0);
    return n > 0 ? months.reduce((s, m) => s + y.rainMm[m], 0) / n : 1;
  };
  const stressYears: Record<CropKey, number[]> = { corn: [], soybeans: [], oats: [], wheat: [] };
  const goodYears: Record<CropKey, number[]> = { corn: [], soybeans: [], oats: [], wheat: [] };
  const classes = years.map((y) => {
    const stressed = new Set<CropKey>();
    const good = new Set<CropKey>();
    const flood = pct(y, JUN) > 2;
    if (pct(y, JUL) < 0.6 || pct(y, JUL, AUG) < 0.6 || y.maxTempC[JUL] >= 38 || flood) stressed.add('corn');
    else if (pct(y, JUL, AUG) >= 0.8 && pct(y, JUL, AUG) <= 1.4 && y.maxTempC[JUL] < 35) good.add('corn');
    if (pct(y, AUG) < 0.5 || pct(y, JUL, AUG) < 0.6 || y.maxTempC[AUG] >= 38 || flood) stressed.add('soybeans');
    else if (pct(y, AUG) >= 0.8 && pct(y, AUG) <= 1.4 && y.maxTempC[AUG] < 35) good.add('soybeans');
    const sg = pct(y, MAY, JUN);
    for (const k of ['oats', 'wheat'] as const) {
      if (sg < 0.5 || sg > 1.7 || y.maxTempC[JUN] >= 35) stressed.add(k);
      else if (sg >= 0.8 && sg <= 1.4) good.add(k);
    }
    for (const k of stressed) stressYears[k].push(y.year);
    for (const k of good) goodYears[k].push(y.year);
    return { stressed, good };
  });
  return { years, classes, stressYears, goodYears };
}

export interface WeatherHistoryPayload {
  years: MonthlyWeather[];
}
