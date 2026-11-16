import { cropName } from '../rotation/agronomy';
import type { Origin, Params, SourceRef } from './assumptions';
import type { CoverProgram } from './inputs';
import { COST_LABELS, cropKeyOf, emptyCosts, isBudgeted, OPERATING_CATS, seasonBudget, type CostCat, type CropKey, type FieldSetup, type Season, type SeasonPlan, type WeatherYear } from './budget';
import type { WeatherHistory } from './weather';

/**
 * Whole-farm comparison of the farmer's current rotation with the PlotTwist schedule (the Planner plans).
 * Pure functions: same inputs, same numbers. All money is in dollars; "per acre" divides by farm acres.
 */

export interface FarmFieldInput {
  id: string;
  name: string;
  setup: FieldSetup;
  /** This year's season (the one before the plan starts), for rotation effects in year 1. */
  thisSeason: SeasonPlan;
  current: SeasonPlan[];
  proposed: SeasonPlan[];
}

export interface AnalysisOptions {
  beginningFarmer: boolean;
  weather?: WeatherHistory;
  /** Forward contract prices for the first year, $/bu. */
  forward?: Partial<Record<CropKey, number>>;
  /** The one cover-crop program counted (default EQIP). */
  coverProgram?: CoverProgram;
}

/** Labels for program money in the partial budget and the net-return breakdown. */
export const PROGRAM_LABELS = {
  eqip: 'Cost-share payments (EQIP)',
  state: 'Iowa cover crop cost share',
  insurance: 'Crop insurance premium discount',
  csp: 'CSP payments',
} as const;

export type PlanId = 'current' | 'proposed';

export interface PlanYear {
  year: number;
  acres: number;
  revenue: number;
  revenueBy: Record<string, number>;
  /** Program money (cost share, CSP, insurance discount); always the sum of programsBy. */
  programs: number;
  programsBy: Record<string, number>;
  costs: Record<CostCat, number>;
  operating: number;
  land: number;
  net: number;
  nLbs: number;
  coverAcres: number;
  /** Money in and out by season of this year (whole farm). */
  flows: Record<Season, { in: number; out: number }>;
  /** Field-seasons left out of this year in both plans because one side has no budget or no crop. */
  skipped: SkippedSeason[];
}

/** A field-season the projection leaves out rather than filling in with rent or a placeholder. */
export interface SkippedSeason {
  fieldId: string;
  fieldName: string;
  year: number;
  reason: 'no-budget' | 'no-crop';
  /** Crop ids with no budget (empty when reason is 'no-crop'). */
  crops: string[];
}

/**
 * Why a field's season at this year index can't be compared, or null when both plans have budgeted crops.
 * Checked on both plans, so a season is never compared against nothing.
 */
function skipReason(f: FarmFieldInput, i: number, P: Params): SkippedSeason | null {
  const sides = [f.current[i], f.proposed[i]].filter((s): s is SeasonPlan => !!s);
  if (!sides.length) return null;
  const year = sides[0].year;
  const crops = [...new Set(sides.flatMap((s) => s.crops.filter((id) => !isBudgeted(id, P))))];
  if (crops.length) return { fieldId: f.id, fieldName: f.name, year, reason: 'no-budget', crops };
  if (sides.some((s) => s.crops.length === 0)) return { fieldId: f.id, fieldName: f.name, year, reason: 'no-crop', crops: [] };
  return null;
}

const SEASONS: Season[] = ['spring', 'summer', 'fall', 'winter'];
const PRICE_IDS = ['corn.price', 'soybeans.price', 'oats.price', 'wheat.price', 'oats.strawPrice', 'rice.price', 'sorghum.price', 'cotton.price', 'cotton.seedPrice'];
const YIELD_IDS = ['corn.yield', 'corn.yieldAfterCorn', 'soybeans.yield', 'oats.yield', 'wheat.yield', 'oats.strawTons', 'rice.yield', 'sorghum.yield', 'cotton.yield', 'cotton.seedYield'];
const FERT_IDS = ['n.price', 'p.price', 'k.price', 'rice.fertilizerOther', 'sorghum.fertilizerOther', 'cotton.fertilizerOther'];

/** Scale a set of values (plus the farmer's own crop prices or yields, when the set is prices or yields). */
function scaled(P: Params, ids: string[], factor: number): Params {
  const own = ids === PRICE_IDS ? P.ownIds('price') : ids === YIELD_IDS ? P.ownIds('yield') : [];
  return P.with(Object.fromEntries([...ids, ...own].map((id) => [id, P.get(id) * factor])));
}

function emptyFlows(): Record<Season, { in: number; out: number }> {
  return { spring: { in: 0, out: 0 }, summer: { in: 0, out: 0 }, fall: { in: 0, out: 0 }, winter: { in: 0, out: 0 } };
}

/** EQIP pays for new cover crop acres only: years where the plan has a cover and the current rotation does not, up to the contract length. */
function eqipYears(field: FarmFieldInput, P: Params): Set<number> {
  const out = new Set<number>();
  const max = P.get('eqip.years');
  for (let i = 0; i < field.proposed.length && out.size < max; i++) {
    if (field.proposed[i].cover && !field.current[i]?.cover) out.add(field.proposed[i].year);
  }
  return out;
}

export function projectPlan(fields: FarmFieldInput[], which: PlanId, P: Params, opts: AnalysisOptions, weatherFor?: (yearIndex: number) => WeatherYear | undefined): PlanYear[] {
  const n = Math.max(0, ...fields.map((f) => f[which].length));
  const forward = opts.forward ?? {};
  const forwardIds = Object.entries(forward).filter(([, v]) => typeof v === 'number' && v > 0) as Array<[CropKey, number]>;
  const firstYearP = forwardIds.length ? P.with(Object.fromEntries(forwardIds.map(([k, v]) => [`${k}.price`, v]))) : P;
  const program = opts.coverProgram ?? 'eqip';
  const eqipRate = program === 'eqip' ? P.get(opts.beginningFarmer ? 'eqip.coverBeginning' : 'eqip.cover') : 0;
  // Iowa cost share: first-time rate only for a farm with no cover crops today, and only in its first cover year.
  const firstTimeFarm = fields.every((f) => f.current.every((s) => !s.cover));
  const firstCoverYear = Math.min(...fields.map((f) => f[which].findIndex((s) => !!s.cover)).filter((i) => i >= 0));
  const cspYears = P.has('csp.annual') && which === 'proposed' ? (P.has('csp.years') ? P.get('csp.years') : Infinity) : 0;
  const out: PlanYear[] = [];
  const pay = (y: PlanYear, label: string, amount: number, season: Season) => {
    if (!(amount > 0)) return;
    y.programsBy[label] = (y.programsBy[label] ?? 0) + amount;
    y.programs += amount;
    y.flows[season].in += amount;
  };
  for (let i = 0; i < n; i++) {
    const y: PlanYear = { year: fields[0]?.[which][i]?.year ?? 0, acres: 0, revenue: 0, revenueBy: {}, programs: 0, programsBy: {}, costs: emptyCosts(), operating: 0, land: 0, net: 0, nLbs: 0, coverAcres: 0, flows: emptyFlows(), skipped: [] };
    /** Cover crop acres this year that could get Iowa cost share, with their rate. */
    const stateAcres: Array<{ acres: number; rate: number }> = [];
    for (const f of fields) {
      const season = f[which][i];
      if (!season) continue;
      const skip = skipReason(f, i, P);
      if (skip) {
        y.skipped.push(skip);
        continue;
      }
      const prev = i === 0 ? f.thisSeason : f[which][i - 1];
      const a = f.setup.acres;
      const b = seasonBudget(season, prev, f.setup, i === 0 ? firstYearP : P, weatherFor?.(i));
      y.acres += a;
      y.revenue += b.revenue * a;
      for (const [k, v] of Object.entries(b.revenueBy)) {
        y.revenueBy[k] = (y.revenueBy[k] ?? 0) + v * a;
        y.flows[b.revenueSeason[k] ?? 'fall'].in += v * a;
      }
      for (const it of b.items) {
        y.costs[it.cat] += it.amount * a;
        y.flows[it.season].out += it.amount * a;
      }
      y.nLbs += b.nLbs * a;
      y.coverAcres += b.coverAcres * a;
      // EQIP: new cover crop acres in the plan, up to the contract length; paid the winter after seeding.
      if (program === 'eqip' && which === 'proposed' && eqipYears(f, P).has(season.year)) pay(y, PROGRAM_LABELS.eqip, eqipRate * a, 'winter');
      if (program === 'state' && season.cover) {
        const first = firstTimeFarm && which === 'proposed' && i === firstCoverYear;
        stateAcres.push({ acres: a, rate: P.get(first ? 'state.coverFirstTime' : 'state.coverReturning') });
      }
      // Insurance discount: comes off the premium of the year after a fall cover crop, billed in summer.
      if (program === 'insurance' && prev?.cover) pay(y, PROGRAM_LABELS.insurance, P.get('insurance.coverDiscount') * a, 'summer');
    }
    if (stateAcres.length) {
      // Limited acres per farmer each year: the best-paying acres first.
      let left = P.get('state.maxAcres');
      for (const s of stateAcres.sort((p, q) => q.rate - p.rate)) {
        const paid = Math.min(s.acres, Math.max(0, left));
        left -= paid;
        pay(y, PROGRAM_LABELS.state, paid * s.rate, 'winter');
      }
    }
    // CSP: a whole-farm contract that comes with the PlotTwist plan, counted only in years with budgeted acres.
    if (i < cspYears && y.acres > 0) pay(y, PROGRAM_LABELS.csp, P.get('csp.annual'), 'winter');
    y.operating = OPERATING_CATS.reduce((s, c) => s + y.costs[c], 0);
    y.land = y.costs.land;
    y.net = y.revenue + y.programs - y.operating - y.land;
    out.push(y);
  }
  return out;
}

/** Average net per acre over the years that have budgeted acres; skipped years don't count as $0. */
const avgPerAcre = (years: PlanYear[]) => {
  const counted = years.filter((y) => y.acres > 0);
  return counted.length ? counted.reduce((s, y) => s + y.net / y.acres, 0) / counted.length : 0;
};

export interface PartialLine {
  label: string;
  amount: number;
}

export interface PartialBudget {
  addedRevenue: PartialLine[];
  reducedCosts: PartialLine[];
  addedCosts: PartialLine[];
  reducedRevenue: PartialLine[];
  net: number;
}

export function partialBudget(current: PlanYear[], proposed: PlanYear[]): PartialBudget {
  const sum = <K extends string>(ys: PlanYear[], pick: (y: PlanYear) => Record<K, number>) => {
    const acc: Record<string, number> = {};
    for (const y of ys) for (const [k, v] of Object.entries(pick(y)) as Array<[string, number]>) acc[k] = (acc[k] ?? 0) + v;
    return acc;
  };
  const revC = sum(current, (y) => y.revenueBy);
  const revP = sum(proposed, (y) => y.revenueBy);
  const costC = sum(current, (y) => y.costs);
  const costP = sum(proposed, (y) => y.costs);
  const pb: PartialBudget = { addedRevenue: [], reducedCosts: [], addedCosts: [], reducedRevenue: [], net: 0 };
  for (const k of new Set([...Object.keys(revC), ...Object.keys(revP)])) {
    const d = (revP[k] ?? 0) - (revC[k] ?? 0);
    if (d > 0.5) pb.addedRevenue.push({ label: `${k} sales`, amount: d });
    else if (d < -0.5) pb.reducedRevenue.push({ label: `${k} sales`, amount: -d });
  }
  const progC = sum(current, (y) => y.programsBy);
  const progP = sum(proposed, (y) => y.programsBy);
  for (const k of new Set([...Object.keys(progC), ...Object.keys(progP)])) {
    const d = (progP[k] ?? 0) - (progC[k] ?? 0);
    if (d > 0.5) pb.addedRevenue.push({ label: k, amount: d });
    else if (d < -0.5) pb.reducedRevenue.push({ label: k, amount: -d });
  }
  for (const k of Object.keys(COST_LABELS) as CostCat[]) {
    const d = (costP[k] ?? 0) - (costC[k] ?? 0);
    if (d > 0.5) pb.addedCosts.push({ label: COST_LABELS[k], amount: d });
    else if (d < -0.5) pb.reducedCosts.push({ label: COST_LABELS[k], amount: -d });
  }
  const tot = (l: PartialLine[]) => l.reduce((s, x) => s + x.amount, 0);
  pb.net = tot(pb.addedRevenue) + tot(pb.reducedCosts) - tot(pb.addedCosts) - tot(pb.reducedRevenue);
  for (const l of [pb.addedRevenue, pb.reducedCosts, pb.addedCosts, pb.reducedRevenue]) l.sort((a, b) => b.amount - a.amount);
  return pb;
}

export interface CashPoint {
  label: string;
  year: number;
  season: Season;
  current: { in: number; out: number; cumulative: number };
  proposed: { in: number; out: number; cumulative: number };
  /** Proposed minus current, cumulative. */
  difference: number;
}

export interface CashFlow {
  points: CashPoint[];
  /** First season from which the PlotTwist schedule stays ahead; 'start' if never behind; null if still behind at the end. */
  breakEven: { label: string; year: number } | 'start' | null;
  /** The most the farmer is behind at any point (≤ 0). */
  deepestDip: number;
  deepestDipLabel?: string;
}

const SEASON_LABEL: Record<Season, string> = { spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter' };

export function cashFlow(current: PlanYear[], proposed: PlanYear[]): CashFlow {
  const points: CashPoint[] = [];
  let cc = 0;
  let cp = 0;
  current.forEach((yc, i) => {
    const yp = proposed[i];
    for (const s of SEASONS) {
      const c = yc.flows[s];
      const p = yp?.flows[s] ?? { in: 0, out: 0 };
      cc += c.in - c.out;
      cp += p.in - p.out;
      points.push({ label: `${SEASON_LABEL[s]} ${yc.year}`, year: yc.year, season: s, current: { ...c, cumulative: cc }, proposed: { ...p, cumulative: cp }, difference: cp - cc });
    }
  });
  let lastBehind = -1;
  let dip = 0;
  let dipLabel: string | undefined;
  points.forEach((pt, i) => {
    if (pt.difference < -0.5) lastBehind = i;
    if (pt.difference < dip) {
      dip = pt.difference;
      dipLabel = pt.label;
    }
  });
  const breakEven = lastBehind === -1 ? 'start' : lastBehind === points.length - 1 ? null : { label: points[lastBehind + 1].label, year: points[lastBehind + 1].year };
  return { points, breakEven, deepestDip: dip, deepestDipLabel: dipLabel };
}

export interface RiskStats {
  typical: number;
  good: number;
  bad: number;
  losingYears: number;
  worst: number;
  worstYear: number;
  /** Average net per acre per year under each historical year's weather, oldest first. */
  byYear: Array<{ year: number; net: number }>;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function riskStats(fields: FarmFieldInput[], which: PlanId, P: Params, opts: AnalysisOptions, weather: WeatherHistory): RiskStats {
  const byYear = weather.years.map((w, h) => {
    const plan = projectPlan(fields, which, P, opts, () => weather.classes[h]);
    return { year: w.year, net: avgPerAcre(plan) };
  });
  const sorted = byYear.map((x) => x.net).sort((a, b) => a - b);
  const worst = byYear.reduce((a, b) => (b.net < a.net ? b : a), byYear[0] ?? { year: 0, net: 0 });
  return { typical: quantile(sorted, 0.5), good: quantile(sorted, 0.8), bad: quantile(sorted, 0.2), losingYears: sorted.filter((v) => v < 0).length, worst: worst.net, worstYear: worst.year, byYear };
}

export interface SensitivityRow {
  label: string;
  group: 'price' | 'yield' | 'fertilizer' | 'base';
  current: number;
  proposed: number;
  difference: number;
}

export interface BreakEven {
  crop: string;
  costPerAcre: number;
  price: number;
  breakEvenPrice: number;
  yieldBu: number;
  breakEvenYield: number;
  unit: 'bu' | 'cwt' | 'lb' | 'unit';
}

export interface ProgramNote {
  name: string;
  text: string;
  amount?: number;
}

export interface TransparencyRow {
  id: string;
  label: string;
  group: string;
  value: number;
  unit: string;
  origin: Origin;
  source: SourceRef;
  note?: string;
}

export interface FarmAnalysis {
  years: number[];
  acres: number;
  current: PlanYear[];
  proposed: PlanYear[];
  headline: { mid: number; wholeFarm: number; horizon: number };
  partial: PartialBudget;
  cash: CashFlow;
  risk: { current: RiskStats; proposed: RiskStats; years: number; stressYears: Record<CropKey, number[]> } | null;
  savings: { nLbs: number; nDollars: number; costShare: number; costShareTiming: string; programs: ProgramNote[] };
  sensitivity: { rows: SensitivityRow[]; breakEven: BreakEven[] };
  transparency: TransparencyRow[];
  /** Everything that keeps the projection from being complete, as "Field, year: what" lines. */
  unmodeled: string[];
  /** Crop ids in the rotations with no published budget and no budget from the farmer yet. */
  needsBudget: string[];
  /** "Field, year" lines for seasons with no crop entered. */
  missingSeasons: string[];
  /** Field-seasons left out of every number, in both plans. */
  skipped: SkippedSeason[];
  /** Years with at least one budgeted field; the rest show as "no budget". */
  budgetedYears: number[];
}

/** Crop ids in any rotation that have no built-in budget (whether or not the farmer has entered their own). */
export function cropsWithoutBuiltInBudget(fields: FarmFieldInput[]): string[] {
  const ids = new Set<string>();
  for (const f of fields) for (const s of [...f.current, ...f.proposed]) for (const id of s.crops) if (id !== 'fallow' && !cropKeyOf(id)) ids.add(id);
  return [...ids];
}

function breakEvens(fields: FarmFieldInput[], P: Params): BreakEven[] {
  const keys = new Set<string>();
  for (const f of fields) for (const s of [...f.current, ...f.proposed]) for (const id of s.crops) if (id !== 'fallow' && isBudgeted(id, P)) keys.add(id);
  const setup = fields[0]?.setup ?? { acres: 1, tenure: 'own' as const, irrigated: false };
  return [...keys].map((id) => {
    const prev: SeasonPlan | undefined = id === 'corn' ? { year: 0, crops: ['soybeans'] } : id === 'soybeans' ? { year: 0, crops: ['corn'] } : undefined;
    const b = seasonBudget({ year: 0, crops: [id] }, prev, { ...setup, acres: 1 }, P);
    const y = b.yields[0];
    const cropRevenueName = cropName(id);
    const secondaryRevenue = Object.entries(b.revenueBy).reduce((sum, [name, value]) => sum + (name === cropRevenueName ? 0 : value), 0);
    return {
      crop: cropName(id),
      costPerAcre: b.totalCost,
      price: y.price,
      breakEvenPrice: y.bu > 0 ? (b.totalCost - secondaryRevenue) / y.bu : 0,
      yieldBu: y.bu,
      breakEvenYield: y.price > 0 ? (b.totalCost - secondaryRevenue) / y.price : 0,
      unit: y.unit,
    };
  });
}

export function analyzeFarm(fields: FarmFieldInput[], P: Params, opts: AnalysisOptions): FarmAnalysis {
  const current = projectPlan(fields, 'current', P, opts);
  const proposed = projectPlan(fields, 'proposed', P, opts);
  const acres = fields.reduce((s, f) => s + f.setup.acres, 0);
  const mid = avgPerAcre(proposed) - avgPerAcre(current);
  const wholeFarm = proposed.reduce((s, y) => s + y.net, 0) - current.reduce((s, y) => s + y.net, 0);

  const rows: SensitivityRow[] = [];
  const row = (label: string, group: SensitivityRow['group'], Q: Params) => {
    const c = avgPerAcre(projectPlan(fields, 'current', Q, opts));
    const p = avgPerAcre(projectPlan(fields, 'proposed', Q, opts));
    rows.push({ label, group, current: c, proposed: p, difference: p - c });
  };
  row('As entered', 'base', P);
  for (const f of [0.8, 0.9, 1.1, 1.2]) row(`Crop prices ${f < 1 ? '−' : '+'}${Math.round(Math.abs(1 - f) * 100)}%`, 'price', scaled(P, PRICE_IDS, f));
  for (const f of [0.8, 0.9, 1.1, 1.2]) row(`Yields ${f < 1 ? '−' : '+'}${Math.round(Math.abs(1 - f) * 100)}%`, 'yield', scaled(P, YIELD_IDS, f));
  for (const f of [0.7, 1.3]) row(`Fertilizer prices ${f < 1 ? '−' : '+'}${Math.round(Math.abs(1 - f) * 100)}%`, 'fertilizer', scaled(P, FERT_IDS, f));

  const risk = opts.weather && opts.weather.years.length
    ? { current: riskStats(fields, 'current', P, opts, opts.weather), proposed: riskStats(fields, 'proposed', P, opts, opts.weather), years: opts.weather.years.length, stressYears: opts.weather.stressYears }
    : null;

  const nC = current.reduce((s, y) => s + y.nLbs, 0);
  const nP = proposed.reduce((s, y) => s + y.nLbs, 0);
  const costShare = proposed.reduce((s, y) => s + y.programs, 0);
  const coverAcres = Math.max(0, ...proposed.map((y) => y.coverAcres));
  const programs: ProgramNote[] = [];
  const program = opts.coverProgram ?? 'eqip';
  // Rates for notes only: resolve() doesn't count them as used by the result.
  const v = (id: string) => P.resolve(id).value;
  const programAmount = (label: string) => proposed.reduce((s, y) => s + (y.programsBy[label] ?? 0), 0);
  const COVER_NOTES: Record<Exclude<CoverProgram, 'none'>, ProgramNote> = {
    eqip: {
      name: 'EQIP cover crop cost share (NRCS)',
      text: `About $${v(opts.beginningFarmer ? 'eqip.coverBeginning' : 'eqip.cover').toFixed(2)} per acre per year for new cover crop acres, for up to ${v('eqip.years')} years. Apply at your local NRCS office before seeding; payment comes after the practice is checked.`,
    },
    state: {
      name: 'Iowa cover crop cost share (IDALS)',
      text: `$${v('state.coverFirstTime')} per acre for first-time cover crop users and $${v('state.coverReturning')} per acre for returning users, up to ${v('state.maxAcres')} acres a year (2025 rates). Sign up through your Soil and Water Conservation District.`,
    },
    insurance: {
      name: 'Iowa crop insurance discount (IDALS)',
      text: `$${v('insurance.coverDiscount')} per acre off next year’s crop insurance premium for fall-planted cover crops, with no acreage cap. Sign up with your crop insurance agent.`,
    },
  };
  if (coverAcres > 0) {
    if (program !== 'none') {
      const label = PROGRAM_LABELS[program];
      programs.push({ ...COVER_NOTES[program], name: `${COVER_NOTES[program].name}: counted`, amount: programAmount(label) });
    }
    for (const p of ['eqip', 'state', 'insurance'] as const) if (p !== program) programs.push(COVER_NOTES[p]);
    programs.push({ name: 'Only one per acre', text: 'The same cover crop acres can’t get EQIP, Iowa cost share and the insurance discount at once. Choose the one PlotTwist counts under Your numbers → Programs and savings.' });
  }
  if (P.has('csp.annual')) {
    programs.push({ name: 'CSP contract (NRCS)', text: `$${P.get('csp.annual').toLocaleString('en-US')} a year from your Conservation Stewardship Program contract, counted with the PlotTwist plan only. A contract you already have would be the same in both columns.`, amount: programAmount(PROGRAM_LABELS.csp) });
  }
  programs.push({ name: 'Beginning farmer rates', text: opts.beginningFarmer ? 'Included: as a beginning farmer you qualify for the higher (historically underserved) EQIP rate and can ask for an advance payment.' : 'If you have farmed 10 years or less, NRCS pays a higher EQIP rate. Tell PlotTwist in Farm details to include it.' });
  programs.push({ name: 'FSA microloans', text: `Operating microloans up to $${P.get('fsa.microloan').toLocaleString('en-US')} can cover the up-front cost of seed and equipment for a new practice.` });

  const transparency: TransparencyRow[] = [...P.used].sort().map((id) => {
    const r = P.resolve(id);
    return { id, label: r.assumption.label, group: r.assumption.group, value: r.value, unit: r.assumption.unit, origin: r.origin, source: P.sourceOf(id), note: r.assumption.note };
  });

  const seasons = fields.flatMap((f) => [...f.current, ...f.proposed].map((s) => ({ f, s })));
  const skipped = current.flatMap((y) => y.skipped);
  const missingSeasons = skipped.filter((s) => s.reason === 'no-crop').map((s) => `${s.fieldName}, ${s.year}`);
  const needsBudget = [...new Set(skipped.flatMap((s) => s.crops))];
  const unmodeled = [
    ...missingSeasons.map((x) => `${x}: crop not entered`),
    ...new Set(seasons.flatMap(({ f, s }) => s.crops.filter((id) => !isBudgeted(id, P)).map((id) => `${f.name}, ${s.year}: ${cropName(id)}`))),
  ];

  return {
    years: current.map((y) => y.year),
    acres,
    current,
    proposed,
    headline: { mid, wholeFarm, horizon: current.length },
    partial: partialBudget(current, proposed),
    cash: cashFlow(current, proposed),
    risk,
    savings: { nLbs: nC - nP, nDollars: (nC - nP) * P.get('n.price'), costShare, costShareTiming: costShare > 0 ? 'Cost share is paid after the practice is checked, usually the winter after seeding; an insurance discount comes off the next year’s premium.' : program === 'none' ? 'No cover crop program is counted (Your numbers → Programs and savings).' : 'No cover crop acres qualify, so no program money is counted.', programs },
    sensitivity: { rows, breakEven: breakEvens(fields, P) },
    transparency,
    unmodeled,
    needsBudget,
    missingSeasons,
    skipped,
    budgetedYears: current.filter((y) => y.acres > 0).map((y) => y.year),
  };
}
