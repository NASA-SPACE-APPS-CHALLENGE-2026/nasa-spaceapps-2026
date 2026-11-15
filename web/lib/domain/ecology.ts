import { calendarFor, cropName, familyOf } from './rotation/agronomy';
import { COVER_SPECIES } from './rotation/coverCrops';
import type { RotationInputs } from './rotation/inputs';
import type { Plan, PlanTask } from './types';
import { nitrogenRate, type SeasonPlan } from './finance/budget';
import type { SimulatorInputs } from './finance/inputs';
import type { Params } from './finance/assumptions';

export const ECOLOGY_SOURCES = {
  erosion: 'https://www.nrcs.usda.gov/resources/tech-tools/water-erosion-rusle2',
  soil: 'https://www.nrcs.usda.gov/conservation-basics/soil/soil-health/soil-health-on-cropland',
  nitrogen: 'https://www.udel.edu/academics/colleges/canr/cooperative-extension/fact-sheets/nitrogen-removal-delaware-crops/',
  leaching: 'https://extension.missouri.edu/publications/wq262',
  rowCrops: 'https://www.uaex.uada.edu/publications/pdf/FSA-2176.pdf',
};

/** Harvested grain N only, not whole-plant uptake. UD Table 1, Delaware 2003–2007 samples.
 * Corn: 56 lb/bu, 15.5% moisture; soybean: 60 lb/bu, 13%; wheat: 60 lb/bu, 13%; barley: 48 lb/bu, 14%.
 * Rice and grain sorghum use Arkansas FSA2176 Table 1. Other crops have no removal factor. See docs/ecology-methods.md.
 */
export const N_REMOVAL: Record<string, number> = { corn: 0.69, soybeans: 3.44, 'winter-wheat': 1.05, barley: 0.76, rice: 0.57 * 100 / 45, sorghum: 0.66 };
// Arkansas FSA2176 Table 1: rice 0.57 lb N / 45-lb bushel. The UI uses cwt (100 lb).
// Grain sorghum: 0.66 lb N/bu. No fertilizer rate or yield is inferred from these coefficients.
export const YIELD_UNITS: Record<string, string> = {
  corn: 'bu/ac', soybeans: 'bu/ac', oats: 'bu/ac', 'winter-wheat': 'bu/ac', 'spring-wheat': 'bu/ac', 'durum-wheat': 'bu/ac',
  barley: 'bu/ac', rye: 'bu/ac', triticale: 'bu/ac', sorghum: 'bu/ac', cotton: 'lb lint/ac', rice: 'cwt/ac',
  peanuts: 'lb/ac', sunflower: 'lb/ac', canola: 'lb/ac', alfalfa: 'ton dry hay/ac', 'other-hay': 'ton dry hay/ac',
};
export function expectedYield(id: string, sim: SimulatorInputs, params: Params): { value?: number; source: string } {
  const own = sim.cropInputs?.[id]?.yield;
  if (own !== undefined) return { value: own, source: 'Saved scenario assumption' };
  // Do not use Finance's oat-budget proxy for rye/barley or wheat for an unrelated crop.
  const key = ['corn', 'soybeans', 'oats'].includes(id) ? id : ['winter-wheat', 'spring-wheat', 'durum-wheat'].includes(id) ? 'wheat' : null;
  if (!key) return { source: 'Missing: enter your expected harvest' };
  const p = params.resolve(`${key}.yield`);
  return { value: p.value, source: p.origin === 'farmer' ? 'Saved Finance assumption' : p.assumption.source.name.startsWith('Iowa State') ? 'Iowa crop-budget reference' : 'Finance planning estimate' };
}

export type CoverState = 'cash' | 'cover' | 'residue' | 'gap' | 'unknown';
export interface CoverMonth { year: number; month: number; days: number; state: CoverState; detail: string }
interface Interval { start: number; end: number; state: 'cash' | 'cover'; name: string }
const index = (year: number, month: number) => year * 12 + month - 1;
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const totalKnown = (xs: Array<number | null>) => !xs.length || xs.some((n) => n === null) ? null : xs.reduce<number>((a, b) => a + (b ?? 0), 0);

/** Month-resolution planned vegetation, never satellite-observed ground cover. */
export function coverTimeline(seasons: SeasonPlan[], plan: Plan | undefined, sim: SimulatorInputs, lat?: number) {
  const intervals: Interval[] = [];
  const notes = new Set<string>();
  const uncertain = new Set<number>();
  const allTasks = (plan?.seasons ?? []).flatMap((s) => s.tasks.map((t) => ({ ...t, year: s.year, at: index(s.year, t.month) })));
  const matching = (kind: PlanTask['kind'], name: string) => allTasks.filter((t) => t.kind === kind && t.label.toLowerCase().includes(name.toLowerCase()));
  for (const s of seasons) {
    const saved = plan?.seasons.find((p) => p.year === s.year);
    if (!s.crops.length) { uncertain.add(s.year); notes.add(`No known crop in ${s.year}; cover is unknown.`); }
    for (const id of s.crops) {
      if (id === 'fallow') continue;
      const cal = calendarFor(id, lat);
      if (!cal) { uncertain.add(s.year); notes.add(`No crop calendar for ${cropName(id)}.`); continue; }
      if (cal.perennial) {
        intervals.push({ start: index(s.year, 1), end: index(s.year, 12), state: 'cash', name: `${cropName(id)}: established perennial assumed` });
        notes.add('Perennials assume an established stand; establishment and dormancy are not modeled.');
        continue;
      }
      const name = cropName(id);
      const harvests = matching('harvest', name).filter((t) => t.year === s.year);
      const localHarvest = saved?.tasks.filter((t) => t.kind === 'harvest') ?? [];
      const harvest = harvests[0] ?? (s.crops.length === 1 && localHarvest.length === 1 ? { ...localHarvest[0], at: index(s.year, localHarvest[0].month) } : undefined);
      const end = harvest?.at ?? index(s.year, cal.harvest);
      let plants = matching('plant', name).filter((t) => t.at <= end && t.at >= end - 15);
      if (!plants.length && s.crops.length === 1) {
        const localPlants = saved?.tasks.filter((t) => t.kind === 'plant') ?? [];
        if (localPlants.length === 1) plants = [{ ...localPlants[0], year: s.year, at: index(s.year, localPlants[0].month) }];
      }
      const plant = plants.sort((a, b) => b.at - a.at)[0];
      const start = plant?.at ?? index(s.year - (cal.fallSown ? 1 : 0), cal.plant);
      if (start > end) { uncertain.add(s.year); notes.add(`${s.year} ${name}: planting follows harvest; review Planner dates.`); continue; }
      if (!plant || !harvest) notes.add('Missing tasks use the existing regional crop calendar; dates are assumptions.');
      intervals.push({ start, end, state: 'cash', name: `${name}: ${plant && harvest ? 'Planner dates' : 'regional calendar estimate'}` });
    }
    if (s.cover) {
      const species = COVER_SPECIES.find((c) => c.id === s.cover!.id);
      const plant = saved?.tasks.find((t) => t.kind === 'cover-plant');
      const harvestEnds = intervals.filter((v) => v.state === 'cash' && Math.floor(v.end / 12) === s.year).map((v) => v.end);
      const last = Math.max(index(s.year, 8), ...harvestEnds);
      const start = plant ? index(s.year, plant.month) : last + 1;
      const terminate = allTasks.filter((t) => t.kind === 'cover-terminate' && t.at >= start && t.at <= start + 14).sort((a, b) => a.at - b.at)[0];
      if (!plant) notes.add('Missing cover seeding tasks assume the month after harvest.');
      if (!terminate) notes.add('Missing cover termination assumes December winter-kill or April termination; verify locally.');
      if (!species && !terminate) { uncertain.add(s.year); notes.add(`Unknown cover species ${s.cover.name}; termination date required.`); continue; }
      const end = terminate?.at ?? (species?.winterKills ? index(s.year, 12) : index(s.year + 1, 4));
      if (start <= end) intervals.push({ start, end, state: 'cover', name: `${s.cover.name}: ${plant && terminate ? 'Planner dates' : 'estimated cover period'}` });
    }
  }
  const months: CoverMonth[] = seasons.flatMap((s) => Array.from({ length: 12 }, (_, i) => {
    const at = index(s.year, i + 1);
    const active = intervals.filter((v) => v.start <= at && v.end >= at);
    const hasHarvest = intervals.some((v) => v.end < at);
    const state: CoverState = active.some((v) => v.state === 'cover') ? 'cover' : active.length ? 'cash' : uncertain.has(s.year) ? 'unknown' : sim.residue === 'retained' && hasHarvest ? 'residue' : 'gap';
    const detail = active.length ? active.map((v) => v.name).join('; ') : state === 'residue' ? 'Residue retained by assumption; surface coverage unmeasured' : state === 'unknown' ? 'Unknown crop or dates' : sim.residue === 'removed' ? 'No living crop; residue removed, potentially bare' : 'No planned living crop; residue coverage unknown';
    return { year: s.year, month: i + 1, days: new Date(Date.UTC(s.year, i + 1, 0)).getUTCDate(), state, detail };
  }));
  return { months, notes: [...notes] };
}

export interface NitrogenYear { year: number; input: number | null; removal: number | null; balance: number | null; missing: string[]; legumes: boolean; needs: Array<{ crop: string; rate: boolean; yield: boolean; coefficient: boolean }>; inputSources: string[] }
export function nitrogenYears(seasons: SeasonPlan[], sim: SimulatorInputs, params: Params, previous?: SeasonPlan): NitrogenYear[] {
  return seasons.map((season, i) => {
    const missing: string[] = [];
    const needs: NitrogenYear['needs'] = [];
    const inputSources: string[] = [];
    const prev = i ? seasons[i - 1] : previous;
    const rates: Array<number | null> = [];
    const removed: Array<number | null> = [];
    for (const id of season.crops) {
      const rate = nitrogenRate(id, prev, sim, params);
      rates.push(rate ?? null);
      const entered = sim.cropInputs?.[id]?.nitrogen !== undefined || (id === 'corn' && sim.nRateCorn !== undefined);
      if (rate !== undefined && id !== 'fallow') inputSources.push(`${cropName(id)}: ${rate} lb N/ac (${entered ? 'your entry' : 'Finance assumption'})`);
      if (rate === undefined) missing.push(`${cropName(id)} fertilizer rate`);
      if (id === 'fallow') { removed.push(0); continue; }
      const yieldValue = expectedYield(id, sim, params).value;
      const coefficient = N_REMOVAL[id];
      if (rate === undefined || yieldValue === undefined || coefficient === undefined) needs.push({ crop: id, rate: rate === undefined, yield: yieldValue === undefined, coefficient: coefficient === undefined });
      removed.push(yieldValue === undefined || coefficient === undefined ? null : yieldValue * coefficient);
      if (yieldValue === undefined) missing.push(`${cropName(id)} yield`);
      if (coefficient === undefined) missing.push(`${cropName(id)} grain N coefficient`);
    }
    if (!season.crops.length) { rates.push(null); removed.push(null); missing.push('Crop sequence'); }
    const input = totalKnown(rates);
    const removal = totalKnown(removed);
    return { year: season.year, input, removal, balance: input === null || removal === null ? null : input - removal, missing, needs, inputSources, legumes: season.crops.some((id) => familyOf(id) === 'legumes') || !!season.cover?.legume };
  });
}

export function diversity(seasons: SeasonPlan[]) {
  const cash = new Set(seasons.flatMap((s) => s.crops).filter((id) => id !== 'fallow'));
  const families = new Set([...cash].map(familyOf).filter((v) => !!v));
  const coverTypes = new Set(seasons.flatMap((s) => s.cover ? [s.cover.id] : []));
  for (const id of coverTypes) { const f = COVER_SPECIES.find((c) => c.id === id)?.family; if (f) families.add(f); }
  return {
    crops: cash.size, families: families.size,
    repeated: seasons.slice(1).filter((s, i) => s.crops.some((id) => id !== 'fallow' && seasons[i].crops.includes(id))).length,
    coverYears: seasons.filter((s) => s.cover).length,
    unknownYears: seasons.filter((s) => !s.crops.length || s.crops.some((id) => id !== 'fallow' && !familyOf(id))).length,
    names: [...cash].map(cropName), coverNames: [...coverTypes].map((id) => COVER_SPECIES.find((c) => c.id === id)?.name ?? id),
  };
}

export function assessEcology(seasons: SeasonPlan[], plan: Plan | undefined, sim: SimulatorInputs, params: Params, ctx?: RotationInputs, previous?: SeasonPlan) {
  const timeline = coverTimeline(seasons, plan, sim, ctx?.lat);
  const unknown = !seasons.length || timeline.months.some((m) => m.state === 'unknown');
  const livingDays = mean(seasons.map((s) => timeline.months.filter((m) => m.year === s.year && (m.state === 'cash' || m.state === 'cover')).reduce((n, m) => n + m.days, 0)));
  const gapDays = mean(seasons.map((s) => timeline.months.filter((m) => m.year === s.year && (m.state === 'gap' || m.state === 'residue')).reduce((n, m) => n + m.days, 0)));
  const d = diversity(seasons);
  const tillage = sim.tillage ?? 'conventional';
  const nitrogen = nitrogenYears(seasons, sim, params, previous);
  const fertilizer = totalKnown(nitrogen.map((n) => n.input));
  const removal = totalKnown(nitrogen.map((n) => n.removal));
  const balance = totalKnown(nitrogen.map((n) => n.balance));
  const residue = sim.residue ?? 'unknown';
  const erosion = unknown ? 'Insufficient information' : tillage === 'conventional' && gapDays > 0 ? 'Exposure concerns' : tillage !== 'conventional' && residue === 'retained' ? 'More protective practices' : 'Mixed protection';
  const organic = unknown ? 'Direction uncertain' : residue === 'removed' && tillage === 'conventional' ? 'Depletion pressure' : residue === 'retained' && tillage !== 'conventional' && d.coverYears > 0 ? 'Practices favor accumulation' : 'Direction uncertain';
  const surplusYears = nitrogen.filter((n) => n.balance !== null && n.balance > 0).map((n) => n.year);
  const wet = sim.scenario === 'wet';
  const coarse = /sand|coarse/i.test(ctx?.texture?.value ?? '');
  const rice = seasons.some((s) => s.crops.includes('rice'));
  const leaching = rice ? 'Review rice water management' : nitrogen.some((n) => n.balance === null) ? 'Complete nitrogen inputs first' : wet && surplusYears.length ? 'Elevated concern' : wet || surplusYears.length || coarse ? 'Review loss pathways' : 'Not quantified';
  return {
    seasons, timeline, livingDays: unknown ? null : livingDays, gapDays: unknown ? null : gapDays,
    diversity: d, erosion, organic, nitrogen, fertilizer: fertilizer === null ? null : fertilizer / Math.max(1, seasons.length),
    removal: removal === null ? null : removal / Math.max(1, seasons.length), balance: balance === null ? null : balance / Math.max(1, seasons.length),
    leaching, surplusYears,
    factors: { tillage, residue, wet, coarse, slope: ctx?.slopePct?.value },
  };
}
export type EcologicalSide = ReturnType<typeof assessEcology>;

export function ecologicalTradeoffs(current: EcologicalSide, proposed: EcologicalSide) {
  const pros: string[] = [], cons: string[] = [];
  if (current.livingDays !== null && proposed.livingDays !== null) {
    const d = Math.round(proposed.livingDays - current.livingDays);
    if (d > 0) pros.push(`About ${d} more days of planned living cover per year may improve seasonal soil protection.`);
    if (d < 0) cons.push(`About ${-d} fewer days of planned living cover per year leave longer gaps to review.`);
  }
  const diversityGain = proposed.diversity.crops - current.diversity.crops;
  if (diversityGain > 0) pros.push(`${diversityGain} additional cash-crop type${diversityGain === 1 ? '' : 's'} may help vary pest hosts; check family-specific pests.`);
  if (proposed.diversity.repeated > current.diversity.repeated) cons.push('More consecutive crop repetitions may maintain pest hosts between years.');
  if (current.fertilizer !== null && proposed.fertilizer !== null) {
    const d = Math.round(proposed.fertilizer - current.fertilizer);
    if (d < 0) pros.push(`${-d} lb N/ac/year less fertilizer on average; this alone does not establish a complete nitrogen balance.`);
    if (d > 0) cons.push(`${d} lb N/ac/year more fertilizer on average; review crop requirements and application timing.`);
  }
  if (proposed.diversity.coverYears > current.diversity.coverYears) cons.push('Additional cover crops need timely establishment and termination; dry-season water competition needs local advice.');
  if (proposed.balance === null) cons.push('Some nitrogen-removal inputs are missing; a complete comparison is unavailable.');
  if (proposed.surplusYears.length) cons.push(`Fertilizer exceeds modeled grain removal in ${proposed.surplusYears.join(', ')}; check soil nitrogen and loss pathways.`);
  if (!pros.length) pros.push('No clear advantage established by the available inputs. Review the individual indicators.');
  if (!cons.length) cons.push('No additional trade-off identified by these limited indicators; field monitoring is still needed.');
  return { pros, cons };
}
