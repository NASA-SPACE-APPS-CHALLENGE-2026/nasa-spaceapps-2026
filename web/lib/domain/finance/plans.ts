import { cropIdsOf, OTHER_CROP_PREFIX } from '../rotation/agronomy';
import { COVER_SPECIES } from '../rotation/coverCrops';
import { detectCycle } from '../rotation/strategies';
import type { CropRef, Field, Plan, PlanSeason } from '../types';
import type { PlanCoverCrop, SeasonPlan } from './budget';

/**
 * Turn a field's crop history and its Planner plan into the season sequences the finance engine compares:
 *   - "current": the rotation the farmer has been following, carried forward
 *   - "proposed": the PlotTwist schedule from the Planner
 */

/**
 * Crop ids as finance sees them. Unlike the rotation rubric, a crop the farmer typed in counts as a real crop
 * ("other:Hemp"), so Finance can ask for its budget instead of reporting the season as empty.
 */
export function financeCropIds(ref: CropRef | null | undefined): string[] | null {
  const ids = cropIdsOf(ref);
  if (ids) return ids;
  if (ref?.kind === 'other' && ref.text.trim()) return [`${OTHER_CROP_PREFIX}${ref.text.trim()}`];
  return null;
}

export function coverOf(planCover: PlanSeason['cover']): PlanCoverCrop | undefined {
  if (!planCover) return undefined;
  const sp = COVER_SPECIES.find((c) => c.id === planCover.species);
  return { id: planCover.species, name: planCover.name, legume: sp?.family === 'legumes', winterKills: sp?.winterKills ?? false };
}

/** Known seasons oldest first, as crop-id arrays (unknown seasons skipped). */
export function knownHistory(field: Field): Array<{ year: number; ids: string[] }> {
  return [...field.crops.history]
    .reverse()
    .concat(field.crops.current)
    .map((s) => ({ year: s.year, ids: financeCropIds(s.crop) }))
    .filter((s): s is { year: number; ids: string[] } => !!s.ids && s.ids.length > 0);
}

/** The repeating pattern of the farmer's own rotation, e.g. [["corn"],["soybeans"]]. Empty if nothing is known. */
export function currentCycle(field: Field): string[][] {
  const known = knownHistory(field);
  return known.length ? detectCycle(known.map((k) => k.ids)) : [];
}

/** Carry a cycle forward from the season after `lastYear`, continuing where the known sequence left off. */
function carryForward(cycle: string[][], lastIds: string[] | undefined, years: number[]): SeasonPlan[] {
  if (!cycle.length) return years.map((year) => ({ year, crops: [] }));
  const key = (ids: string[]) => ids.join('>');
  const at = lastIds ? cycle.findIndex((c) => key(c) === key(lastIds)) : -1;
  return years.map((year, i) => ({ year, crops: cycle[(at + 1 + i) % cycle.length] }));
}

/** The first plan year: next season, or this season when the crop is not planted yet. */
export function firstPlanYear(field: Field, startThisSeason = false): number {
  return field.crops.current.year + (startThisSeason ? 0 : 1);
}

export function horizonYears(field: Field, horizon: number, startYear = firstPlanYear(field)): number[] {
  return Array.from({ length: horizon }, (_, i) => startYear + i);
}

/** The season before the plan starts (for rotation effects in the first plan year). */
export function thisSeason(field: Field, startYear = firstPlanYear(field)): SeasonPlan {
  if (startYear > field.crops.current.year) return { year: field.crops.current.year, crops: financeCropIds(field.crops.current.crop) ?? [] };
  const prev = field.crops.history.find((h) => h.year === startYear - 1);
  return { year: startYear - 1, crops: financeCropIds(prev?.crop) ?? [] };
}

function currentCropIds(field: Field): string[] | null {
  const ids = financeCropIds(field.crops.current.crop);
  return ids && ids.length ? ids : null;
}

export function currentPlanSeasons(field: Field, horizon: number, startYear = firstPlanYear(field)): SeasonPlan[] {
  const years = horizonYears(field, horizon, startYear);
  const cycle = currentCycle(field);
  const cur = currentCropIds(field);
  if (startYear <= field.crops.current.year && cur) return [{ year: years[0], crops: cur }, ...carryForward(cycle, cur, years.slice(1))];
  const known = knownHistory(field);
  return carryForward(cycle, known[known.length - 1]?.ids, years);
}

/**
 * The Planner plan for the horizon years. Years the plan does not cover continue the plan's own pattern;
 * with no plan at all the field stays on its current rotation.
 */
export function proposedPlanSeasons(field: Field, plan: Plan | undefined, horizon: number, startYear = firstPlanYear(field)): SeasonPlan[] {
  const years = horizonYears(field, horizon, startYear);
  if (!plan) return currentPlanSeasons(field, horizon, startYear);
  const planned = plan.seasons
    .filter((s) => s.year >= startYear)
    .map((s) => ({ year: s.year, crops: financeCropIds(s.crop) ?? [], cover: coverOf(s.cover) }))
    .filter((s) => s.crops.length > 0);
  if (!planned.length) return currentPlanSeasons(field, horizon, startYear);
  const byYear = new Map(planned.map((s) => [s.year, s]));
  const cycle = detectCycle(planned.map((s) => s.crops));
  const covers = new Map(planned.map((s) => [s.crops.join('>'), s.cover]));
  const lastPlanned = planned[planned.length - 1];
  const extra = carryForward(cycle, lastPlanned.crops, years.filter((y) => y > lastPlanned.year));
  const cur = currentCropIds(field);
  return years.map((year) => {
    const p = byYear.get(year);
    if (p) return p;
    const e = extra.find((x) => x.year === year);
    if (e) return { ...e, cover: covers.get(e.crops.join('>')) };
    if (year === field.crops.current.year && cur) return { year, crops: cur };
    return { year, crops: [] };
  });
}

/** Months of the year with living cover (cash crop or cover crop), counting this season's cover into next spring. */
export function coverMonths(season: SeasonPlan, plantMonth: (id: string) => number, harvestMonth: (id: string) => number): number {
  const covered = new Set<number>();
  for (const id of season.crops) {
    if (id === 'fallow') continue;
    const p = plantMonth(id);
    const h = harvestMonth(id);
    if (p <= h) for (let m = p; m <= h; m++) covered.add(m);
    else {
      for (let m = 1; m <= h; m++) covered.add(m);
      for (let m = p; m <= 12; m++) covered.add(m);
    }
  }
  if (season.cover) {
    const lastHarvest = Math.max(0, ...season.crops.map(harvestMonth));
    for (let m = Math.min(12, lastHarvest + 1); m <= 12; m++) covered.add(m);
    if (!season.cover.winterKills) for (let m = 1; m <= 4; m++) covered.add(m);
  }
  return covered.size;
}
