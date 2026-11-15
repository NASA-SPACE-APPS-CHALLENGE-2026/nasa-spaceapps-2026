import type { Field, Plan } from '../types';
import { ASSUMPTION_BY_ID } from './assumptions';
import { activePlan } from './farm';
import { forecastAcreage, forecastAgronomy, prepareHarvestHistory, landSchema, canonicalUnit, type AgronomyAssumption, type AgronomyResult } from './forecastAgronomy';
import { normalizeRecord, validateForecastRecords } from './forecastImport';
import { applyLedger, prepareLedger, type LedgerResult, type LedgerScenario, type PreparedLedger } from './forecastLedger';
import type { ForecastRecords } from './forecastRecords';
import { fieldSchedule } from './forecastRotation';
import { DEFAULT_FINANCE, type FinanceInputs } from './inputs';

type Amount = number | null;
export interface Totals { grossRevenue: Amount; expenses: Amount; netReturn: Amount }
export interface Difference extends Totals { revenueChangePct: Amount }
export interface ForecastRow extends AgronomyResult, LedgerResult {
  fieldId: string; name: string; crop: string; previousCrop?: string; previousCover?: string; plannedCover?: string; revenuePerAcre: Amount;
}
export interface CropSummary extends Totals { crop: string; unit: string; production: Amount }
export interface Projection { fields: ForecastRow[]; crops: CropSummary[]; totals: Totals }
export interface Contribution extends Difference { id: string; name: string; current: Totals; proposed: Totals }
interface Comparison { current: Totals; proposed: Totals; delta: Difference }
export interface ForecastYear {
  year: number; current: Projection; proposed: Projection; delta: Difference; cumulative: Comparison;
  fieldChanges: Contribution[]; cropChanges: Contribution[];
}
export interface ScenarioForecast extends Comparison { years: ForecastYear[]; fieldChanges: Contribution[]; cropChanges: Contribution[] }
export interface RevenueForecast {
  startYear: number; horizon: FinanceInputs['horizon']; landAcres: Amount; usableAcres: Amount;
  scenarios: Record<LedgerScenario, ScenarioForecast>; issues: string[];
  inventory: PreparedLedger['inventory']; financials: PreparedLedger['financials']; bySeason: PreparedLedger['bySeason'];
}
interface ForecastInput {
  records: ForecastRecords; startYear: number; horizon: FinanceInputs['horizon']; fields?: Field[]; plans?: Plan[]; finance?: FinanceInputs;
}
type Validated = ReturnType<typeof validateForecastRecords>;
type Context = ReturnType<typeof prepare>;

function sum(values: Amount[]): Amount {
  return values.some(v => v === null) ? null : (values as number[]).reduce((total, v) => total + v, 0);
}
function totals(rows: Totals[]): Totals {
  return { grossRevenue: sum(rows.map(r => r.grossRevenue)), expenses: sum(rows.map(r => r.expenses)), netReturn: sum(rows.map(r => r.netReturn)) };
}
function difference(current: Totals, proposed: Totals): Difference {
  const change = (key: keyof Totals) => current[key] === null || proposed[key] === null ? null : proposed[key]! - current[key]!;
  const grossRevenue = change('grossRevenue');
  return { grossRevenue, expenses: change('expenses'), netReturn: change('netReturn'),
    revenueChangePct: current.grossRevenue && grossRevenue !== null ? grossRevenue / current.grossRevenue * 100 : null };
}
function groups(rows: ForecastRow[], key: 'fieldId' | 'crop') {
  const grouped = new Map<string, ForecastRow[]>();
  for (const row of rows) {
    const group = grouped.get(row[key]);
    if (group) group.push(row);
    else grouped.set(row[key], [row]);
  }
  return grouped;
}
function contributions(current: ForecastRow[], proposed: ForecastRow[], key: 'fieldId' | 'crop'): Contribution[] {
  const a = groups(current, key), b = groups(proposed, key);
  return [...new Set([...a.keys(), ...b.keys()])].map(id => {
    const current = totals(a.get(id) ?? []), proposed = totals(b.get(id) ?? []);
    return { id, name: key === 'fieldId' ? (a.get(id) ?? b.get(id))![0].name : id,
      current, proposed, ...difference(current, proposed) };
  }).sort((x, y) => Math.abs(y.grossRevenue ?? 0) - Math.abs(x.grossRevenue ?? 0));
}

function addLegacyInputs(data: Validated, finance: FinanceInputs) {
  for (const crop of ['corn', 'soybeans', 'wheat', 'oats'] as const) {
    // Price-only forward quotes cannot identify a contracted volume.
    if (finance.forward[crop] !== undefined) data.issues.push(`Enter a confirmed ${crop} contract with its growing season and contracted quantity to use the saved forward quote.`);
    const yieldValue = finance.overrides[`${crop}.yield`];
    const price = finance.overrides[`${crop}.price`];
    const previous = finance.lastYear.crops[crop];
    if (previous?.price !== undefined && previous.price >= 0 && !data.markets.some(a => a.kind === 'historical-price' && a.crop === crop)) {
      data.markets.push({ id: `saved-last-price-${crop}`, source: 'Farmer-entered last-year selling price; sale volume unavailable', kind: 'historical-price', crop, value: previous.price, unit: 'bu' });
    }
    if (previous?.yield !== undefined && previous.yield >= 0 && !data.harvests.some(h => h.crop === crop) && !data.agronomy.some(a => a.kind === 'yield' && a.crop === crop) && !(yieldValue >= 0)) {
      data.agronomy.push({ id: `saved-last-yield-${crop}`, source: 'Last-year yield entered by the farmer as their expected yield; acreage unavailable', kind: 'yield', crop, value: previous.yield, unit: 'bu/ac' });
    }
    if (yieldValue >= 0 && !data.agronomy.some(r => r.kind === 'yield' && r.crop === crop && !r.fieldId && !r.season)) {
      data.agronomy.push({ id: `saved-yield-${crop}`, source: 'Farmer-entered expected yield in Finance', kind: 'yield', crop, value: yieldValue, unit: 'bu/ac' });
    }
    if (price >= 0 && !data.markets.some(r => r.kind === 'farmer-price' && r.crop === crop && !r.fieldId && !r.season)) {
      data.markets.push({ id: `saved-price-${crop}`, source: 'Farmer-entered expected selling price in Finance', kind: 'farmer-price', crop, value: price, unit: 'bu' });
    }
  }
}

function prepare(input: ForecastInput) {
  const { records, startYear, horizon, fields = [], plans = [], finance = DEFAULT_FINANCE } = input;
  const data = validateForecastRecords(records);
  addLegacyInputs(data, finance);
  const ids = new Set([...fields.map(f => f.id), ...data.land.map(f => f.id)]);
  // Keep an identifiable rejected field in the farm as an unknown rather than silently dropping its acres.
  for (const raw of records.land) if (raw?.id != null && String(raw.id).trim()) ids.add(String(raw.id).trim());
  const fieldData = [...ids].map(id => {
    const field = fields.find(f => f.id === id);
    const imported = data.land.find(f => f.id === id);
    const properties = field?.feature.properties;
    const parsed = field && properties && landSchema.safeParse(normalizeRecord({
      ...properties, id, source: field.importMeta?.fileName ?? 'Saved field boundary',
    }));
    if (parsed && !parsed.success) data.issues.push(`${id}: review boundary attributes: ${parsed.error.issues.map(i => i.path.join('.')).join(', ')}.`);
    const mapped = parsed?.success ? parsed.data : undefined;
    const land = imported ? { ...mapped, ...imported } : mapped;
    const name = land?.name ?? field?.name ?? id;
    const savedAcres = finance.fields[id]?.acres;
    const newerCorrection = imported?.acres !== undefined && typeof imported.correctedAt === 'string';
    const acreage = forecastAcreage(field, land, newerCorrection ? undefined : savedAcres);
    if (imported && mapped) acreage.trace.push(`Field attributes: ${mapped.source}. Land table: ${imported.source} overrides matching boundary columns.`);
    const history = data.harvests.filter(h => h.fieldId === id && h.season < startYear);
    const plan = activePlan(plans, id);
    if (land?.soil) acreage.trace.push(`Soil description from ${land.source}: ${typeof land.soil === 'string' ? land.soil : JSON.stringify(land.soil)}. Yield effects require a sourced response.`);
    // Only use the regional budgets when the field's recorded location identifies Iowa.
    if (typeof land?.location === 'string' && /(?:^|[,\s])(iowa|ia)(?:$|[,\s])/i.test(land.location)) {
      for (const [crop, prev, key] of [['corn', 'soybeans', 'corn.yield'], ['corn', 'corn', 'corn.yieldAfterCorn'], ['soybeans', 'corn', 'soybeans.yield']]) {
        const existing = data.agronomy.some(a => a.kind === 'benchmark' && a.crop === crop && (!a.fieldId || a.fieldId === id) && (!a.previousCrop || a.previousCrop === prev));
        if (existing) continue;
        const item = ASSUMPTION_BY_ID[key];
        data.agronomy.push({ id: `isu-${id}-${key}`, kind: 'benchmark', fieldId: id, crop, previousCrop: prev,
          value: item.value, unit: 'bu/ac', source: `${item.source.name}, ${item.source.date}, ${item.label}; ${item.source.url}` });
      }
    }
    return { id, name, acreage, current: fieldSchedule(field, land, history, plan, startYear, horizon, false),
      proposed: fieldSchedule(field, land, history, plan, startYear, horizon, true) };
  });
  for (const group of [data.harvests, data.purchases, data.payments, data.agronomy, data.markets]) {
    for (const row of group) if (row.fieldId && !ids.has(row.fieldId)) data.issues.push(`${row.id} (${row.source}): field ${row.fieldId} has no land record.`);
  }
  const harvests = data.harvests.filter(h => ids.has(h.fieldId) && h.season < startYear);
  const ledger = prepareLedger({ ...data, harvests, assumptions: data.markets, startYear });
  const history = prepareHarvestHistory(harvests, startYear);
  return { fieldData, ledger, harvests, history, assumptions: data.agronomy, issues: [...data.issues, ...ledger.issues, ...history.issues], startYear, horizon };
}

function project(ctx: Context, rotation: 'current' | 'proposed', scenario: LedgerScenario): Projection[] {
  type ProductionRow = AgronomyResult & Pick<ForecastRow, 'fieldId' | 'name' | 'crop' | 'previousCrop' | 'previousCover' | 'plannedCover'>;
  const seasons = Array.from({ length: ctx.horizon }, (): ProductionRow[] => []);
  for (const field of ctx.fieldData) {
    const schedule = field[rotation];
    let { previousCrop, previousCover } = schedule;
    const soil: SoilState = { change: null, trace: [] };
    schedule.seasons.forEach((season, i) => {
      const crops = season.crops.length ? season.crops : ['unknown'];
      for (const [index, crop] of crops.entries()) {
        const args = { fieldId: field.id, crop, previousCrop, previousCover, season: season.year, startYear: ctx.startYear,
          scenario, acreage: field.acreage, harvests: ctx.harvests, history: ctx.history, assumptions: ctx.assumptions };
        const soilInputs = soilForSeason(args, soil);
        const r = forecastAgronomy({ ...args, assumptions: soilInputs.assumptions });
        if (crop === 'unknown') {
          r.production = r.yieldPerAcre = null;
          r.confidence = 'low';
          r.issues.push('Crop assignment is missing for this growing season.');
        }
        r.trace.unshift(schedule.source, ...soilInputs.trace);
        r.issues.push(...soilInputs.issues);
        seasons[i].push({ ...r, fieldId: field.id, name: field.name, crop, previousCrop, previousCover, plannedCover: index === crops.length - 1 ? season.cover : undefined });
        previousCrop = crop === 'unknown' ? undefined : crop;
        previousCover = undefined;
      }
      previousCover = season.cover;
    });
  }
  return seasons.map((rows, i) => {
    const result = applyLedger(ctx.ledger, rows, ctx.startYear + i, scenario);
    const fields = rows.map((row, j) => {
      const money = result[j];
      return { ...row, ...money, trace: [...row.trace, ...money.trace], issues: [...row.issues, ...money.issues],
        revenuePerAcre: money.grossRevenue !== null && row.harvestedAcres ? money.grossRevenue / row.harvestedAcres : null };
    });
    const crops = [...groups(fields, 'crop')].map(([crop, entries]) => ({
      crop, unit: entries[0].unit, production: sum(entries.map(r => r.production)), ...totals(entries),
    }));
    return { fields, crops, totals: fields.length ? totals(fields) : { grossRevenue: null, expenses: null, netReturn: null } };
  });
}

interface SoilState { opening?: number; lastOpening?: number; change: Amount; trace: string[] }
/** The response is relative to a measured reference N level. Never infer mineralization or a crop credit. */
function soilForSeason(req: Parameters<typeof forecastAgronomy>[0], state: SoilState) {
  const trace: string[] = [], issues: string[] = [];
  let assumptions = req.assumptions;
  const eligible = assumptions.filter(a => a.kind.startsWith('soilN') && (!a.fieldId || a.fieldId === req.fieldId)
    && (!a.season || a.season === req.season) && (!a.scenario || a.scenario === req.scenario)
    && (!a.crop || a.crop === req.crop) && (!a.previousCrop || a.previousCrop === req.previousCrop) && (!a.previousCover || a.previousCover === req.previousCover));
  if (!eligible.length && state.change === null) return { trace, issues, assumptions };
  function pick(kind: AgronomyAssumption['kind'], unit: string) {
    const rank = (a: AgronomyAssumption) => [a.fieldId, a.season, a.scenario, a.crop, a.previousCrop, a.previousCover].filter(Boolean).length;
    const items = eligible.filter(a => a.kind === kind).sort((a, b) => rank(b) - rank(a));
    if (items.length > 1 && rank(items[0]) === rank(items[1])) { issues.push(`Conflicting ${kind} assumptions. Check ${items[0].id} and ${items[1].id}.`); return; }
    if (items.length && items[0].unit !== unit) { issues.push(`${items[0].id}: ${kind} requires ${unit}.`); return; }
    return items[0];
  }
  const opening = pick('soilNOpening', 'lb N/ac');
  if (opening && (state.opening === undefined || (opening.season !== undefined && state.lastOpening !== req.season))) {
    state.opening = opening.value; state.lastOpening = req.season; state.change = 0; state.trace = [`${opening.id} (${opening.source})`];
  }
  const response = pick('soilNResponse', `${canonicalUnit(req.crop)}/lb N`);
  if (state.change !== null && state.opening !== undefined) {
    trace.push(`Opening plant-available nitrogen: ${state.opening + state.change} lb N/ac. Sources: ${state.trace.join(', ')}.`);
    if (response && state.change !== 0) {
      const source = `${response.id} (${response.source}): ${state.change} lb N/ac change × ${response.value} ${response.unit}; ${state.trace.join(', ')}`;
      assumptions = [...assumptions, { ...response, id: `soil-change-${response.id}`, source, kind: 'soil', season: req.season,
        fieldId: req.fieldId, scenario: req.scenario, crop: req.crop, value: state.change * response.value, unit: canonicalUnit(req.crop) }];
    }
    const change = pick('soilNChange', 'lb N/ac');
    if (change && state.opening + state.change + change.value >= 0) {
      state.change += change.value;
      state.trace.push(`${req.season}: ${change.id} (${change.source}), ${change.value} lb N/ac`);
      trace.push(`Closing plant-available nitrogen: ${state.opening + state.change} lb N/ac using ${change.id} (${change.source}).`);
    } else {
      issues.push('Nitrogen carryover needs a sourced seasonal balance with nonnegative closing nitrogen.'); state.change = null;
    }
  } else if (response) issues.push('No usable opening nitrogen balance for the sourced soil response.');
  return { trace, issues, assumptions };
}

function compare(ctx: Context, scenario: LedgerScenario): ScenarioForecast {
  const a = project(ctx, 'current', scenario), b = project(ctx, 'proposed', scenario);
  const allA = a.flatMap(y => y.fields), allB = b.flatMap(y => y.fields);
  const years = a.map((current, i) => {
    const proposed = b[i], ca = totals(a.slice(0, i + 1).map(p => p.totals)), cb = totals(b.slice(0, i + 1).map(p => p.totals));
    return { year: ctx.startYear + i, current, proposed, delta: difference(current.totals, proposed.totals),
      cumulative: { current: ca, proposed: cb, delta: difference(ca, cb) },
      fieldChanges: contributions(current.fields, proposed.fields, 'fieldId'), cropChanges: contributions(current.fields, proposed.fields, 'crop') };
  });
  return { years, ...years[years.length - 1].cumulative, fieldChanges: contributions(allA, allB, 'fieldId'), cropChanges: contributions(allA, allB, 'crop') };
}

export function forecastRevenue(input: ForecastInput): RevenueForecast {
  const ctx = prepare(input);
  return { startYear: ctx.startYear, horizon: ctx.horizon,
    landAcres: ctx.fieldData.length ? sum(ctx.fieldData.map(f => f.acreage.acres)) : null,
    usableAcres: ctx.fieldData.length ? sum(ctx.fieldData.map(f => f.acreage.usableAcres)) : null,
    scenarios: { expected: compare(ctx, 'expected'), conservative: compare(ctx, 'conservative'), optimistic: compare(ctx, 'optimistic') },
    issues: [...new Set(ctx.issues)], inventory: ctx.ledger.inventory, financials: ctx.ledger.financials, bySeason: ctx.ledger.bySeason };
}
