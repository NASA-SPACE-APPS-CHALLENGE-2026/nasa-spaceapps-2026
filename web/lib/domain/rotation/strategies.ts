import { known } from '../management';
import type { StrategyId } from '../types';
import { agronomyOf, calendarFor, coldestMonthF, cropName, FALLOW, SMALL_GRAINS, LEGUME_CASH } from './agronomy';
import { pickCover, suggestCovers, type CoverContext, type CoverGoal, type CoverPick } from './coverCrops';
import type { RotationInputs } from './inputs';

/** Years planned by every strategy, counted from the season after the current one. */
export const PLAN_YEARS = 3;

export interface CropWindow {
  id: string;
  plant: number;
  /** Year the crop is planted (the year before harvest for fall-sown crops). */
  plantYear: number;
  harvest: number;
  harvestYear: number;
  perennial: boolean;
}

export interface PlannedCover {
  pick: CoverPick;
  /** Month and year the cover is seeded. */
  plantMonth: number;
  plantYear: number;
  /** Month and year it is ended (or, for a winter-killed cover, the residue is planted into). */
  endMonth: number;
  endYear: number;
}

export interface PlannedSeason {
  year: number;
  /** Cash crops this season: one, or two for a double crop. */
  ids: string[];
  label: string;
  crops: CropWindow[];
  cover?: PlannedCover;
  /** True when the strategy changed this season compared with keeping the rotation. */
  changed: boolean;
}

export interface Strategy {
  id: StrategyId | 'custom';
  title: string;
  summary: string;
  /** New practices the farmer takes on (used only to break ties). */
  practiceChanges: number;
  seasons: PlannedSeason[];
  notes: string[];
  /** Small grain used by the small-grains strategy. */
  smallGrain?: string;
}

export interface StrategySet {
  strategies: Strategy[];
  /** The farmer's own rotation pattern, as detected from their crop history (oldest first). */
  cycle: string[][];
  /** Number of known seasons the pattern was read from. */
  knownSeasons: number;
  /** Set when strategies cannot be built at all. */
  problem?: string;
}

const key = (ids: string[]) => ids.join('>');

/** The shortest repeating pattern (1–3 seasons) consistent with the most recent known seasons. */
export function detectCycle(seq: string[][]): string[][] {
  const keys = seq.map(key);
  for (let p = 1; p <= Math.min(3, keys.length - 1); p++) {
    let ok = true;
    for (let i = p; i < keys.length; i++) if (keys[i] !== keys[i - p]) ok = false;
    if (ok) return seq.slice(-p);
  }
  return seq.slice(-Math.min(3, seq.length));
}

export function seasonLabel(ids: string[]): string {
  return ids.length === 2 ? `${cropName(ids[0])} → ${cropName(ids[1])} (double crop)` : cropName(ids[0]);
}

function windows(ids: string[], year: number, inputs: RotationInputs, currentIds: string[]): CropWindow[] {
  const harvestAnswer = known(inputs.answers.harvestMonth);
  const out: CropWindow[] = [];
  ids.forEach((id, i) => {
    if (id === FALLOW) return;
    const override = harvestAnswer !== undefined && currentIds.includes(id) && i === ids.length - 1 ? harvestAnswer : undefined;
    const cal = calendarFor(id, inputs.lat, override);
    if (!cal) return;
    if (i === 1 && out[0]) {
      // Second crop of a double crop goes in right after the first comes off.
      out.push({ id, plant: out[0].harvest, plantYear: year, harvest: cal.harvest, harvestYear: year, perennial: cal.perennial });
      return;
    }
    out.push({ id, plant: cal.plant, plantYear: cal.fallSown ? year - 1 : year, harvest: cal.harvest, harvestYear: year, perennial: cal.perennial });
  });
  return out;
}

function season(ids: string[], year: number, inputs: RotationInputs, currentIds: string[], changed = false): PlannedSeason {
  return { year, ids, label: seasonLabel(ids), crops: windows(ids, year, inputs, currentIds), changed };
}

export function goalsFor(inputs: RotationInputs): CoverGoal[] {
  const goals: CoverGoal[] = ['scavenge'];
  const problems = Array.isArray(inputs.answers.problems) ? inputs.answers.problems : [];
  if (problems.includes('erosion') || (inputs.slopePct?.value ?? 0) >= 6) goals.push('erosion');
  if (problems.includes('resistant-weeds')) goals.push('weeds');
  if (problems.includes('wet-spots')) goals.push('compaction');
  if (inputs.answers.livestock === 'yes') goals.push('grazing');
  return goals;
}

/** Attach a cover between `s` and the following season when there is a real gap. */
function withCover(s: PlannedSeason, next: PlannedSeason | undefined, inputs: RotationInputs, onlyAfterSmallGrain = false): PlannedSeason {
  const last = s.crops[s.crops.length - 1];
  if (!last || last.perennial) return s;
  if (onlyAfterSmallGrain && !SMALL_GRAINS.has(last.id)) return s;
  const nextFirst = next?.crops[0];
  if (nextFirst && (nextFirst.perennial || nextFirst.plantYear === s.year)) return s; // a fall-sown or perennial crop follows: it is the cover
  const ctx: CoverContext = { prevCrop: last.id, nextCrop: nextFirst?.id, harvestMonth: last.harvest, climate: inputs.climate?.value, goals: goalsFor(inputs) };
  // After a small grain the strategy always schedules red clover (frost-seeded or underseeded).
  const pick = onlyAfterSmallGrain ? suggestCovers(ctx).find((p) => p.species.id === 'red-clover') : pickCover(ctx);
  if (!pick) return s;
  return { ...s, cover: coverWindow(pick, last, nextFirst, s.year) };
}

function coverWindow(pick: CoverPick, last: CropWindow, nextFirst: CropWindow | undefined, year: number): PlannedCover {
  const nextPlant = nextFirst?.plant ?? 5;
  const endMonth = Math.max(1, nextPlant - 1);
  if (pick.species.afterSmallGrainOnly) {
    // Frost-seeded into a fall-sown grain in March, or sown with a spring grain.
    const fallSown = last.plantYear < last.harvestYear;
    return { pick, plantMonth: fallSown ? 3 : last.plant, plantYear: year, endMonth, endYear: year + 1 };
  }
  return { pick, plantMonth: last.harvest, plantYear: year, endMonth, endYear: year + 1 };
}

/**
 * Build the three strategies from the field's crop history:
 *  keep         – the farmer's own pattern, continued
 *  cover        – the same crops, with a cover crop in every winter gap
 *  small-grains – a small grain (and a clover after it) worked into the pattern
 */
export function buildStrategies(inputs: RotationInputs): StrategySet {
  const current = inputs.seasons[inputs.seasons.length - 1];
  if (!current?.ids) {
    return { strategies: [], cycle: [], knownSeasons: 0, problem: `Enter the ${inputs.currentYear} crop on the Fields tab (a crop from the list, not free text) to compare strategies.` };
  }
  // Trailing run of seasons the rubric understands, most recent last.
  const knownSeq: string[][] = [];
  for (let i = inputs.seasons.length - 1; i >= 0 && inputs.seasons[i].ids; i--) knownSeq.unshift(inputs.seasons[i].ids!);
  const cycle = detectCycle(knownSeq);
  const currentIds = current.ids;
  const years = Array.from({ length: PLAN_YEARS + 1 }, (_, i) => inputs.currentYear + 1 + i); // one extra to see the gap after the last year
  const cont = (i: number) => cycle[(cycle.length - 1 + 1 + i) % cycle.length];

  // ---- keep ----
  const keepAll = years.map((y, i) => season(cont(i), y, inputs, currentIds));
  const keep: Strategy = {
    id: 'keep',
    title: 'Keep your rotation',
    summary: `Continue ${cycle.map(seasonLabel).join(', then ')}${cycle.length > 1 ? ' in turn' : ' every year'}, as you do now.`,
    practiceChanges: 0,
    seasons: keepAll.slice(0, PLAN_YEARS),
    notes: knownSeq.length < 2 ? ['Only one season is known, so FieldShift assumed the same crop every year.'] : [],
  };

  // ---- cover ----
  const coverAll = keepAll.map((s, i) => (i < PLAN_YEARS ? withCover(s, keepAll[i + 1], inputs) : s));
  const cover: Strategy = {
    id: 'cover',
    title: 'Add a cover crop',
    summary: 'Same cash crops, with a cover crop seeded after each harvest and ended before the next planting.',
    practiceChanges: 1,
    seasons: coverAll.slice(0, PLAN_YEARS),
    notes: [`The fall ${inputs.currentYear} seeding window has mostly passed, so covers start after the ${inputs.currentYear + 1} harvest.`],
  };

  // ---- small grains ----
  const hasSmallGrain = cycle.some((ids) => ids.some((id) => SMALL_GRAINS.has(id)));
  let sgSeasons: PlannedSeason[];
  let smallGrain: string | undefined;
  const sgNotes: string[] = [];
  if (hasSmallGrain) {
    sgSeasons = keepAll.map((s, i) => (i < PLAN_YEARS ? withCover(s, keepAll[i + 1], inputs, true) : s)).slice(0, PLAN_YEARS);
    smallGrain = cycle.flat().find((id) => SMALL_GRAINS.has(id));
    sgNotes.push('Your rotation already includes a small grain. This strategy adds a clover after it, the step that gives the most soil and nitrogen benefit.');
  } else {
    const keepIds = keepAll.map((s) => s.ids);
    const prevOf = (i: number) => (i === 0 ? currentIds : keepIds[i - 1]);
    let k = keepIds.findIndex((_, i) => prevOf(i).some((id) => LEGUME_CASH.has(id)));
    if (k < 0) k = keepIds.findIndex((ids, i) => key(ids) === key(prevOf(i)));
    if (k < 0) k = 1;
    const coldest = inputs.climate ? coldestMonthF(inputs.climate.value.monthlyMeanTempF) : undefined;
    const prevHarvest = agronomyOf(prevOf(k)[prevOf(k).length - 1])?.harvest ?? 10;
    const wheatOk = k > 0 && coldest !== undefined && coldest >= 15 && prevHarvest <= 10;
    smallGrain = wheatOk ? 'winter-wheat' : 'oats';
    if (k === 0) sgNotes.push(`It is past the usual fall seeding time for ${inputs.currentYear + 1} winter wheat, so the first small grain is spring oats.`);
    else if (!wheatOk && coldest === undefined) sgNotes.push('Climate data is missing, so FieldShift chose spring oats, which avoid any winter-survival risk.');
    else if (!wheatOk) sgNotes.push('Winters here are cold for winter wheat after this crop, so the small grain is spring oats.');
    const ids = [...keepIds.slice(0, k), [smallGrain], ...keepIds.slice(k)].slice(0, PLAN_YEARS + 1);
    const all = ids.map((s, i) => season(s, years[i], inputs, currentIds, i === k));
    sgSeasons = all.map((s, i) => (i < PLAN_YEARS ? withCover(s, all[i + 1], inputs, true) : s)).slice(0, PLAN_YEARS);
  }
  const smallGrains: Strategy = {
    id: 'small-grains',
    title: 'Bring in small grains',
    summary: hasSmallGrain
      ? `Keep your ${cropName(smallGrain!).toLowerCase()} and follow it with red clover.`
      : `Add ${cropName(smallGrain!).toLowerCase()} to the rotation, with red clover sown into it to grow on after harvest.`,
    practiceChanges: hasSmallGrain ? 1 : 2,
    seasons: sgSeasons,
    notes: sgNotes,
    smallGrain,
  };

  return { strategies: [keep, cover, smallGrains], cycle, knownSeasons: knownSeq.length };
}
