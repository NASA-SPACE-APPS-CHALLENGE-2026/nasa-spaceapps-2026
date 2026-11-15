import { cropName } from '../rotation/agronomy';
import { confidenceOf, type Confidence, type Origin, type Params, type SourceRef } from './assumptions';
import { COST_LABELS, cropKeyOf, emptyCosts, OPERATING_CATS, seasonBudget, type CostCat, type CropKey, type FieldSetup, type Season, type SeasonPlan, type WeatherYear } from './budget';
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
}

export type PlanId = 'current' | 'proposed';

export interface PlanYear {
  year: number;
  acres: number;
  revenue: number;
  revenueBy: Record<string, number>;
  programs: number;
  costs: Record<CostCat, number>;
  operating: number;
  land: number;
  net: number;
  nLbs: number;
  coverAcres: number;
  /** Money in and out by season of this year (whole farm). */
  flows: Record<Season, { in: number; out: number }>;
}

const SEASONS: Season[] = ['spring', 'summer', 'fall', 'winter'];
const PRICE_IDS = ['corn.price', 'soybeans.price', 'oats.price', 'wheat.price', 'oats.strawPrice', 'rice.price', 'sorghum.price', 'cotton.price', 'cotton.seedPrice'];
const YIELD_IDS = ['corn.yield', 'corn.yieldAfterCorn', 'soybeans.yield', 'oats.yield', 'wheat.yield', 'oats.strawTons', 'rice.yield', 'sorghum.yield', 'cotton.yield', 'cotton.seedYield'];
const FERT_IDS = ['n.price', 'p.price', 'k.price', 'rice.fertilizerOther', 'sorghum.fertilizerOther', 'cotton.fertilizerOther'];

function scaled(P: Params, ids: string[], factor: number): Params {
  return P.with(Object.fromEntries(ids.map((id) => [id, P.get(id) * factor])));
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
  const rate = P.get(opts.beginningFarmer ? 'eqip.coverBeginning' : 'eqip.cover');
  const out: PlanYear[] = [];
  for (let i = 0; i < n; i++) {
    const y: PlanYear = { year: fields[0]?.[which][i]?.year ?? 0, acres: 0, revenue: 0, revenueBy: {}, programs: 0, costs: emptyCosts(), operating: 0, land: 0, net: 0, nLbs: 0, coverAcres: 0, flows: emptyFlows() };
    for (const f of fields) {
      const season = f[which][i];
      if (!season) continue;
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
      if (which === 'proposed' && eqipYears(f, P).has(season.year)) {
        const pay = rate * a;
        y.programs += pay;
        y.flows.winter.in += pay;
      }
    }
    y.operating = OPERATING_CATS.reduce((s, c) => s + y.costs[c], 0);
    y.land = y.costs.land;
    y.net = y.revenue + y.programs - y.operating - y.land;
    out.push(y);
  }
  return out;
}

const avgPerAcre = (years: PlanYear[]) => (years.length ? years.reduce((s, y) => s + (y.acres ? y.net / y.acres : 0), 0) / years.length : 0);

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
  const programs = proposed.reduce((s, y) => s + y.programs, 0) - current.reduce((s, y) => s + y.programs, 0);
  if (programs > 0.5) pb.addedRevenue.push({ label: 'Cost-share payments (EQIP)', amount: programs });
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
  unit: 'bu' | 'cwt' | 'lb';
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
  confidence: Confidence;
  note?: string;
}

export interface FarmAnalysis {
  years: number[];
  acres: number;
  current: PlanYear[];
  proposed: PlanYear[];
  headline: { low: number; mid: number; high: number; wholeFarm: number; horizon: number };
  partial: PartialBudget;
  cash: CashFlow;
  risk: { current: RiskStats; proposed: RiskStats; years: number; stressYears: Record<CropKey, number[]> } | null;
  savings: { nLbs: number; nDollars: number; costShare: number; costShareTiming: string; programs: ProgramNote[] };
  sensitivity: { rows: SensitivityRow[]; breakEven: BreakEven[] };
  transparency: TransparencyRow[];
  confidence: Record<'headline' | 'comparison' | 'partial' | 'cash' | 'risk' | 'savings' | 'sensitivity', Confidence>;
  unmodeled: string[];
}

function breakEvens(fields: FarmFieldInput[], P: Params): BreakEven[] {
  const keys = new Set<string>();
  for (const f of fields) for (const s of [...f.current, ...f.proposed]) for (const id of s.crops) if (cropKeyOf(id)) keys.add(id);
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
  const diff = (Q: Params) => avgPerAcre(projectPlan(fields, 'proposed', Q, opts)) - avgPerAcre(projectPlan(fields, 'current', Q, opts));
  const mid = avgPerAcre(proposed) - avgPerAcre(current);
  const scenarioDiffs = [mid, diff(scaled(P, PRICE_IDS, 0.9)), diff(scaled(P, PRICE_IDS, 1.1)), diff(scaled(P, YIELD_IDS, 0.9)), diff(scaled(P, YIELD_IDS, 1.1))];
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
  if (coverAcres > 0) {
    programs.push({
      name: 'EQIP cover crop cost share (NRCS)',
      text: `About $${P.get(opts.beginningFarmer ? 'eqip.coverBeginning' : 'eqip.cover').toFixed(2)} per acre per year for new cover crop acres, for up to ${P.get('eqip.years')} years. Apply at your local NRCS office before seeding; payment comes after the practice is checked.`,
      amount: costShare,
    });
  }
  programs.push({ name: 'Beginning farmer rates', text: opts.beginningFarmer ? 'Included: as a beginning farmer you qualify for the higher (historically underserved) EQIP rate and can ask for an advance payment.' : 'If you have farmed 10 years or less, NRCS pays a higher EQIP rate. Tell PlotTwist in Farm details to include it.' });
  programs.push({ name: 'FSA microloans', text: `Operating microloans up to $${P.get('fsa.microloan').toLocaleString('en-US')} can cover the up-front cost of seed and equipment for a new practice.` });

  const transparency: TransparencyRow[] = [...P.used].sort().map((id) => {
    const r = P.resolve(id);
    return { id, label: r.assumption.label, group: r.assumption.group, value: r.value, unit: r.assumption.unit, origin: r.origin, source: P.sourceOf(id), confidence: r.origin === 'default' ? r.assumption.confidence : 'high', note: r.assumption.note };
  });

  const all = [...P.used];
  const pick = (prefixes: string[]) => all.filter((id) => prefixes.some((p) => id.startsWith(p)));
  const overall = confidenceOf(P, all.filter((id) => !id.startsWith('risk.') && !id.startsWith('practice.') && !id.startsWith('fsa.')));
  const unmodeled = [...new Set(fields.flatMap((f) => [...f.current, ...f.proposed].flatMap((s) => {
    if (s.crops.length === 0) return [`${f.name}, ${s.year}: crop not entered`];
    return s.crops.filter((id) => id !== 'fallow' && !cropKeyOf(id)).map((id) => `${f.name}, ${s.year}: ${cropName(id)}`);
  })))];
  const confidence = {
    headline: overall,
    comparison: overall,
    partial: overall,
    cash: overall,
    risk: risk ? confidenceOf(P, pick(['risk.'])) : ('low' as Confidence),
    savings: confidenceOf(P, pick(['eqip.', 'n.price', 'corn.nLbs', 'cover.legumeNCredit'])),
    sensitivity: overall,
  };

  return {
    years: current.map((y) => y.year),
    acres,
    current,
    proposed,
    headline: { low: Math.min(...scenarioDiffs), mid, high: Math.max(...scenarioDiffs), wholeFarm, horizon: current.length },
    partial: partialBudget(current, proposed),
    cash: cashFlow(current, proposed),
    risk,
    savings: { nLbs: nC - nP, nDollars: (nC - nP) * P.get('n.price'), costShare, costShareTiming: costShare > 0 ? 'Paid after NRCS checks the practice, usually the winter after seeding.' : 'No new cover crop acres, so no cost share is counted.', programs },
    sensitivity: { rows, breakEven: breakEvens(fields, P) },
    transparency,
    confidence,
    unmodeled,
  };
}
