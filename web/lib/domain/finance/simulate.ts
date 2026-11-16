import { calendarFor, cropName } from '../rotation/agronomy';
import type { Field, Plan } from '../types';
import { cashFlow, projectPlan, type CashFlow, type FarmFieldInput, type PlanYear } from './analysis';
import type { Params } from './assumptions';
import { cropKeyOf, isBudgeted, type CropKey, type SeasonPlan, type Tillage, type WeatherYear } from './budget';
import { fieldSetup } from './farm';
import { buildParams, type FinanceInputs, type SimulatorInputs, type WeatherScenario } from './inputs';
import { coverMonths, currentPlanSeasons, firstPlanYear, proposedPlanSeasons, thisSeason } from './plans';

/**
 * Scenario Simulator: one field, "what you do now" against the suggested plan, under the farmer's own
 * field size, crop stage, tillage, nitrogen rate, yields, prices and a weather scenario.
 */

export type Erosion = 'Low' | 'Moderate' | 'High';

export interface SimSide {
  seasons: SeasonPlan[];
  years: PlanYear[];
  netPerAcre: number;
  totalProfit: number;
  coverMonths: number;
  nLbsPerAcre: number;
  nDollarsPerAcre: number;
  erosion: Erosion;
  costShare: number;
  yields: Array<{ crop: string; bu: number; unit: 'bu' | 'cwt' | 'lb' }>;
}

export interface Simulation {
  startYear: number;
  acres: number;
  current: SimSide;
  proposed: SimSide;
  cash: CashFlow;
  unmodeled: string[];
  pros: string[];
  cons: string[];
}

export const SCENARIO_TEXT: Record<WeatherScenario, string> = {
  normal: 'Normal weather every year',
  dry: 'Dry summers every year (corn and soybeans stressed, small grains fine)',
  wet: 'Wet springs every year (small grains stressed, row crops do well)',
};

function scenarioWeather(s: WeatherScenario | undefined): WeatherYear | undefined {
  if (s === 'dry') return { stressed: new Set<CropKey>(['corn', 'soybeans', 'rice', 'sorghum', 'cotton']), good: new Set<CropKey>(['oats', 'wheat']) };
  if (s === 'wet') return { stressed: new Set<CropKey>(['oats', 'wheat']), good: new Set<CropKey>(['corn', 'soybeans', 'rice', 'sorghum', 'cotton']) };
  return undefined;
}

export function erosionLevel(coverMonthsAvg: number, tillage: Tillage | undefined, slopePct: number | undefined): Erosion {
  const slope = slopePct === undefined ? 1 : slopePct < 2 ? 0.6 : slopePct < 5 ? 1 : 1.5;
  const till = tillage === 'no-till' ? 0.5 : tillage === 'reduced' ? 0.75 : 1;
  const score = ((12 - coverMonthsAvg) / 12) * slope * till;
  return score < 0.25 ? 'Low' : score < 0.45 ? 'Moderate' : 'High';
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const fmt = (v: number) => `$${Math.round(Math.abs(v)).toLocaleString('en-US')}`;

export function simulate(field: Field, plan: Plan | undefined, finance: FinanceInputs, sim: SimulatorInputs, ctx: { lat: number; slopePct?: number }): { result: Simulation; params: Params } {
  const P = buildParams(finance, sim.overrides ?? {});
  const startYear = firstPlanYear(field, sim.stage === 'pre-plant');
  const horizon = finance.horizon;
  let current = currentPlanSeasons(field, horizon, startYear);
  if (sim.currentCrops) current = current.map((s) => (sim.currentCrops![String(s.year)] ? { ...s, crops: [sim.currentCrops![String(s.year)]] } : s));
  // Growing or harvested: this season can't change, so both plans start next season.
  const proposed = proposedPlanSeasons(field, plan, horizon, startYear);
  const input: FarmFieldInput = { id: field.id, name: field.name, setup: fieldSetup(field, finance, sim), thisSeason: thisSeason(field, startYear), current, proposed };
  const weather = scenarioWeather(sim.scenario);
  const opts = { beginningFarmer: finance.beginningFarmer, forward: finance.forward };
  const yc = projectPlan([input], 'current', P, opts, () => weather);
  const yp = projectPlan([input], 'proposed', P, opts, () => weather);
  const acres = input.setup.acres;
  const months = (s: SeasonPlan) =>
    coverMonths(
      s,
      (id) => calendarFor(id, ctx.lat)?.plant ?? 5,
      (id) => calendarFor(id, ctx.lat)?.harvest ?? 10,
    );

  const side = (seasons: SeasonPlan[], years: PlanYear[]): SimSide => {
    const cm = avg(seasons.map(months));
    const byCrop = new Map<string, number[]>();
    for (const s of seasons) for (const id of s.crops) if (cropKeyOf(id)) byCrop.set(id, []);
    return {
      seasons,
      years,
      netPerAcre: avg(years.map((y) => (acres ? y.net / acres : 0))),
      totalProfit: years.reduce((s, y) => s + y.net, 0),
      coverMonths: Math.round(cm * 10) / 10,
      nLbsPerAcre: avg(years.map((y) => (acres ? y.nLbs / acres : 0))),
      nDollarsPerAcre: avg(years.map((y) => (acres ? y.nLbs / acres : 0))) * P.get('n.price'),
      erosion: erosionLevel(cm, sim.tillage, ctx.slopePct),
      costShare: years.reduce((s, y) => s + y.programs, 0),
      yields: [...byCrop.keys()].map((id) => {
        const key = cropKeyOf(id)!;
        const base = key === 'corn' ? P.get('corn.yield') : P.get(`${key}.yield`);
        const w = weather?.stressed.has(key) ? 1 - P.get(key === 'corn' ? 'risk.cornLoss' : key === 'soybeans' ? 'risk.soybeansLoss' : 'risk.smallGrainLoss') / 100 : weather?.good.has(key) ? 1 + P.get('risk.goodYearGain') / 100 : 1;
        return { crop: cropName(id), bu: Math.round(base * w), unit: key === 'rice' ? 'cwt' : key === 'cotton' ? 'lb' : 'bu' };
      }),
    };
  };
  const c = side(current, yc);
  const p = side(proposed, yp);
  const cash = cashFlow(yc, yp);
  const unmodeled = [...new Set([...current, ...proposed].flatMap((s) => {
    if (s.crops.length === 0) return [`${s.year}: crop not entered`];
    return s.crops.filter((id) => !isBudgeted(id, P)).map((id) => `${s.year}: ${cropName(id)}`);
  }))];

  const pros: string[] = [];
  const cons: string[] = [];
  const d = p.netPerAcre - c.netPerAcre;
  if (d > 1) pros.push(`Earns about ${fmt(d)} more per acre per year on average (${fmt(p.totalProfit - c.totalProfit)} on this field over ${yp.length} years).`);
  else if (d < -1) cons.push(`Earns about ${fmt(d)} less per acre per year on average (${fmt(p.totalProfit - c.totalProfit)} less over ${yp.length} years).`);
  else pros.push('Earns about the same as what you do now.');
  const y1 = yp[0] && yc[0] ? (yp[0].net - yc[0].net) / (acres || 1) : 0;
  if (y1 < -1) cons.push(`Costs about ${fmt(y1)} per acre more in ${yp[0].year}, the first year.`);
  if (cash.breakEven && cash.breakEven !== 'start') pros.push(`Catches up with what you do now by ${cash.breakEven.label}.`);
  else if (cash.breakEven === null && d < 0) cons.push(`Does not catch up within ${yp.length} years at these prices.`);
  const cm = p.coverMonths - c.coverMonths;
  if (cm >= 0.5) pros.push(`Soil is covered about ${Math.round(cm * 10) / 10} more months a year.`);
  else if (cm <= -0.5) cons.push(`Soil is bare about ${Math.round(-cm * 10) / 10} more months a year.`);
  const n = c.nLbsPerAcre - p.nLbsPerAcre;
  if (n >= 1) pros.push(`Uses about ${Math.round(n)} lb less nitrogen per acre per year (${fmt(n * P.get('n.price'))}).`);
  else if (n <= -1) cons.push(`Uses about ${Math.round(-n)} lb more nitrogen per acre per year.`);
  const rank: Record<Erosion, number> = { Low: 0, Moderate: 1, High: 2 };
  if (rank[p.erosion] < rank[c.erosion]) pros.push(`Erosion risk drops from ${c.erosion.toLowerCase()} to ${p.erosion.toLowerCase()}.`);
  else if (rank[p.erosion] > rank[c.erosion]) cons.push(`Erosion risk rises from ${c.erosion.toLowerCase()} to ${p.erosion.toLowerCase()}.`);
  if (p.costShare > 0) pros.push(`Qualifies for about ${fmt(p.costShare)} of EQIP cost share on this field.`);
  const grainsNew = proposed.some((s) => s.crops.some((id) => ['oats', 'wheat'].includes(cropKeyOf(id) ?? ''))) && !current.some((s) => s.crops.some((id) => ['oats', 'wheat'].includes(cropKeyOf(id) ?? '')));
  if (grainsNew) cons.push('Needs a buyer for the small grain and a way to harvest it (drill, combine head, straw baling).');
  if (proposed.some((s) => s.cover) && !current.some((s) => s.cover)) cons.push('Adds a fall seeding pass and, for covers that survive winter, a spring termination pass.');

  return { result: { startYear, acres, current: c, proposed: p, cash, unmodeled, pros, cons }, params: P };
}
