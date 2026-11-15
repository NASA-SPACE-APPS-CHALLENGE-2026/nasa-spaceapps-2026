import type { Field, Plan } from '../types';
import { cashFlow, projectPlan, type CashFlow, type FarmFieldInput, type PlanYear } from './analysis';
import type { Params } from './assumptions';
import type { SeasonPlan, WeatherYear } from './budget';
import { fieldSetup } from './farm';
import { buildParams, type FinanceInputs, type SimulatorInputs, type WeatherScenario } from './inputs';
import { currentPlanSeasons, firstPlanYear, proposedPlanSeasons, thisSeason } from './plans';

/** Single-field financial projection using the same budget engine as the whole-farm Finance page.
 * Ecological indicators live in ecology.ts; no independent financial or ecological scoring engine.
 */
export interface SimSide {
  seasons: SeasonPlan[];
  years: PlanYear[];
  netPerAcre: number;
  totalProfit: number;
  nLbsPerAcre: number;
  costShare: number;
}
export interface Simulation {
  startYear: number;
  acres: number;
  current: SimSide;
  proposed: SimSide;
  cash: CashFlow;
}

/** Retains main's illustrative crop/weather sensitivity rules, explicitly not a crop forecast. */
function scenarioWeather(s: WeatherScenario | undefined): WeatherYear | undefined {
  if (s === 'dry') return { stressed: new Set(['corn', 'soybeans']), good: new Set(['oats', 'wheat']) };
  if (s === 'wet') return { stressed: new Set(['oats', 'wheat']), good: new Set(['corn', 'soybeans']) };
  return undefined;
}

const avg = (xs: number[]) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;

export function simulate(field: Field, plan: Plan | undefined, finance: FinanceInputs, sim: SimulatorInputs): { result: Simulation; params: Params } {
  const P = buildParams(finance, sim.overrides ?? {});
  const startYear = firstPlanYear(field, sim.stage === 'pre-plant');
  const current = currentPlanSeasons(field, finance.horizon, startYear).map((s) => sim.currentCrops?.[s.year] ? { ...s, crops: sim.currentCrops[s.year].split('>') } : s);
  const proposed = proposedPlanSeasons(field, plan, finance.horizon, startYear);
  const input: FarmFieldInput = { id: field.id, name: field.name, setup: fieldSetup(field, finance, sim), thisSeason: thisSeason(field, startYear), current, proposed };
  const opts = { beginningFarmer: finance.beginningFarmer, forward: finance.forward };
  const weather = scenarioWeather(sim.scenario);
  const yc = projectPlan([input], 'current', P, opts, () => weather);
  const yp = projectPlan([input], 'proposed', P, opts, () => weather);
  const acres = input.setup.acres;
  const side = (seasons: SeasonPlan[], years: PlanYear[]): SimSide => ({
    seasons, years,
    netPerAcre: avg(years.map((y) => acres ? y.net / acres : 0)),
    totalProfit: years.reduce((s, y) => s + y.net, 0),
    nLbsPerAcre: avg(years.map((y) => acres ? y.nLbs / acres : 0)),
    costShare: years.reduce((s, y) => s + y.programs, 0),
  });
  return { result: { startYear, acres, current: side(current, yc), proposed: side(proposed, yp), cash: cashFlow(yc, yp) }, params: P };
}
