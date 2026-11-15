import { z } from 'zod';
import { canonicalUnit, convertQuantity, normalizeCrop } from './forecastAgronomy';

const text = z.string().trim().min(1);
const nonnegative = z.number().finite().nonnegative();
const year = z.number().int().positive();
const record = z.object({ id: text, source: text, transactionId: text.optional() });
const assigned = { fieldId: text.optional(), crop: text.optional(), season: year.optional() };
const scenarioEnum = z.enum(['conservative', 'expected', 'optimistic']);
export type LedgerScenario = z.infer<typeof scenarioEnum>;
const category = z.enum(['seed', 'fertilizer', 'chemicals', 'fuel', 'labor', 'irrigation', 'machinery', 'cover', 'other']);
type Category = z.infer<typeof category>;

export const equipmentSchema = record.extend({
  operation: z.enum(['plant', 'harvest']), machineId: text.optional(), season: year.optional(), widthM: nonnegative.positive().optional(),
  speedKph: nonnegative.positive().optional(), hoursPerDay: nonnegative.positive().max(24).optional(),
  efficiency: nonnegative.positive().max(1).optional(), dailyCapacityAcres: nonnegative.positive().optional(),
  availableDays: nonnegative.optional(), supportedCrops: z.union([z.array(text), text]).optional(),
  operatingCostPerHour: nonnegative.optional(), fuelPerHour: nonnegative.optional(), fuelPrice: nonnegative.optional(),
}).passthrough();

export const purchaseSchema = record.extend({
  ...assigned, kind: z.enum(['purchase', 'opening', 'application']), quantity: nonnegative, unit: text,
  product: text.optional(), category: category.optional(), totalPrice: nonnegative.optional(),
  actualUsage: nonnegative.optional(), lotId: text.optional(), supplier: text.optional(), date: text.optional(),
}).passthrough();

export const paymentSchema = record.extend({
  ...assigned, kind: z.enum(['sale', 'contract', 'operating', 'supplier-payment', 'government', 'insurance', 'financing', 'transfer', 'interest', 'depreciation', 'tax', 'rent', 'capital']),
  amount: nonnegative.optional(), price: nonnegative.optional(), quantity: nonnegative.optional(), unit: text.optional(),
  category: category.optional(), lotId: text.optional(), buyer: text.optional(), date: text.optional(), paymentDate: text.optional(),
  status: z.enum(['paid', 'receivable', 'confirmed', 'pending', 'cancelled']).optional(), cashReceived: nonnegative.optional(),
}).passthrough();

export const ledgerAssumptionSchema = record.extend({
  ...assigned, crop: text, kind: z.enum(['farmer-price', 'market-price', 'historical-price', 'basis', 'delivery', 'marketing', 'operating-rate', 'expense-coverage', 'input-rate', 'cover-rate']),
  value: z.number().finite(), unit: text, scenario: scenarioEnum.optional(), previousCrop: text.optional(), previousCover: text.optional(), plannedCover: text.optional(), lotId: text.optional(),
}).passthrough().superRefine((a, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (a.kind !== 'basis' && a.value < 0) issue('Only a basis differential may be negative.');
  if (a.kind === 'expense-coverage' && (!a.season || a.unit.toLowerCase() !== 'complete' || a.value !== 1))
    issue('To verify all operating costs, identify the historical growing season and enter value 1 with unit complete.');
  if (a.kind === 'input-rate' && !a.lotId) issue('An input application rate requires a source purchase lot ID.');
  if (a.kind === 'cover-rate' && !a.plannedCover) issue('Identify the planned cover crop covered by this operating cost.');
});

export type EquipmentRecord = z.infer<typeof equipmentSchema>;
export type PurchaseRecord = z.infer<typeof purchaseSchema>;
export type PaymentRecord = z.infer<typeof paymentSchema>;
export type LedgerAssumption = z.infer<typeof ledgerAssumptionSchema>;

interface HistoricalField {
  id?: string; source?: string; fieldId: string; crop: string; season: number; plantedAcres?: number; previousCrop?: string; previousCover?: string; plannedCover?: string;
}
export interface LedgerInput {
  equipment: EquipmentRecord[]; purchases: PurchaseRecord[]; payments: PaymentRecord[]; assumptions: LedgerAssumption[];
  harvests: HistoricalField[]; startYear: number;
}
export interface LedgerRow {
  fieldId: string; crop: string; previousCrop?: string | null; previousCover?: string | null; plannedCover?: string | null; plantedAcres: number | null;
  harvestedAcres: number | null; production: number | null; unit: string;
}
type Costs = Partial<Record<Category, number>>;
interface CostHistory extends HistoricalField { plantedAcres: number; amounts: Costs; sources: string[]; complete: boolean; invalid: boolean }
interface Lot { id: string; product: string; unit: string; category?: Category; source: string; beginning: number; purchased: number; used: number; ending: number; unitCost: number | null; endingValue: number | null }
interface Sale { id: string; source: string; crop: string; season: number; amount: number; quantity: number }
interface SaleHistory { proceeds: number; quantity: number; seasons: number; low: number; high: number; sourceTrace: string }

function financialTotals() {
  return { cropSales: 0, cashReceived: 0, receivable: 0, unsettled: 0, government: 0, insurance: 0, financing: 0, transfers: 0,
    operating: 0, supplierPayments: 0, interest: 0, depreciation: 0, tax: 0, rent: 0, capital: 0 };
}
type Totals = ReturnType<typeof financialTotals>;
export interface PreparedLedger {
  inventory: Lot[]; financials: Totals; bySeason: Record<string, Totals>; issues: string[];
  sales: Sale[]; saleHistory: Map<string, SaleHistory>; contracts: PaymentRecord[]; equipment: EquipmentRecord[]; assumptions: LedgerAssumption[]; history: CostHistory[];
}
const ref = (r: { id: string; source: string }) => `${r.id} (${r.source})`;
const cropIs = (a: string | undefined, b: string | null | undefined) => !!a && !!b && normalizeCrop(a) === normalizeCrop(b);
function unique<T extends { id: string; transactionId?: string; source: string }>(rows: T[], issues: string[]): T[] {
  const ids = new Set<string>(), references = new Set<string>();
  return rows.filter(row => {
    if (ids.has(row.id) || (row.transactionId && references.has(row.transactionId))) {
      issues.push(`Repeated ID or transaction reference on ${ref(row)}; counted once.`); return false;
    }
    ids.add(row.id);
    if (row.transactionId) references.add(row.transactionId);
    return true;
  });
}

function recordedBeforeForecast(date: string | undefined, season: number | undefined, start: number, label: string, issues: string[]) {
  if (!date) return season === undefined || season < start;
  const match = /^(\d{4})(?:-|$)/.exec(date) ?? /^\d{1,2}\/\d{1,2}\/(\d{4})$/.exec(date);
  if (!match) { issues.push(`Unrecognized transaction date on ${label}; use an ISO date to establish the forecast cutoff.`); return false; }
  return Number(match[1]) < start;
}

function inventory(purchases: PurchaseRecord[], history: CostHistory[], start: number, issues: string[]) {
  const lots = new Map<string, Lot>();
  const usedOn = new Map<string, Set<CostHistory>>();
  const fieldYears = new Map(history.map(h => [JSON.stringify([h.fieldId, h.season, normalizeCrop(h.crop)]), h]));
  for (const p of purchases.filter(p => p.kind !== 'application')) {
    if (!recordedBeforeForecast(p.date, p.season, start, ref(p), issues)) {
      issues.push(`Lot ${ref(p)} is outside opening inventory at the start of ${start}.`); continue;
    }
    const opening = p.kind === 'opening';
    const cost = p.totalPrice !== undefined && p.quantity > 0 ? p.totalPrice / p.quantity : null;
    lots.set(p.id, { id: p.id, product: p.product ?? p.id, unit: p.unit, category: p.category, source: p.source,
      beginning: opening ? p.quantity : 0, purchased: opening ? 0 : p.quantity, used: 0, ending: p.quantity,
      unitCost: cost, endingValue: cost === null ? null : cost * p.quantity });
    if (cost === null) issues.push(`${ref(p)} has no computable unit purchase cost.`);
  }
  for (const p of purchases) {
    const applied = p.kind === 'application' ? p.quantity : p.actualUsage;
    if (applied === undefined || applied === 0) continue;
    if (!recordedBeforeForecast(p.date, p.season, start, ref(p), issues)) continue;
    const h = p.crop && p.fieldId && p.season ? fieldYears.get(JSON.stringify([p.fieldId, p.season, normalizeCrop(p.crop)])) : undefined;
    const lot = lots.get((p.kind === 'application' ? p.lotId : p.id) ?? '');
    if (!lot) {
      if (h) h.invalid = true;
      issues.push(`Application ${ref(p)} has no matching inventory lot.`); continue;
    }
    const q = p.unit.trim().toLowerCase() === lot.unit.trim().toLowerCase() ? applied : convertQuantity(applied, p.unit, lot.unit, '');
    if (q === null || q < 0) {
      if (h) h.invalid = true;
      issues.push(`Incompatible application and inventory units on ${ref(p)}.`); continue;
    }
    lot.used += q; lot.ending -= q;
    lot.endingValue = lot.unitCost === null ? null : lot.ending * lot.unitCost;
    if (!h) { issues.push(`Usage on ${ref(p)} lacks a matching field, crop and season with planted acres; no expense allocation.`); continue; }
    const targets = usedOn.get(lot.id) ?? new Set<CostHistory>();
    targets.add(h); usedOn.set(lot.id, targets);
    if (!lot.category || lot.unitCost === null || lot.ending < -1e-8) {
      h.invalid = true; issues.push(`Cannot cost ${ref(p)}: review lot quantity, category and unit cost.`); continue;
    }
    h.amounts[lot.category] = (h.amounts[lot.category] ?? 0) + q * lot.unitCost;
    h.sources.push(`${ref(p)}: ${q} ${lot.unit} × $${lot.unitCost} from lot ${lot.id} (${lot.source})`);
  }
  for (const lot of lots.values()) {
    if (lot.ending < -1e-8) {
      issues.push(`Lot ${ref(lot)} reports more used than purchased or held at opening.`);
      usedOn.get(lot.id)?.forEach(h => { h.invalid = true; });
    }
    else if (lot.ending > 0) issues.push(`Lot ${ref(lot)}: ${Number(lot.ending.toFixed(3))} ${lot.unit} remains in inventory.`);
  }
  return [...lots.values()];
}

function summarizeSales(sales: Sale[]) {
  const groups = new Map<string, Sale[]>();
  for (const s of sales) {
    const crop = normalizeCrop(s.crop);
    const entries = groups.get(crop) ?? [];
    entries.push(s); groups.set(crop, entries);
  }
  const summaries = new Map<string, SaleHistory>();
  for (const [crop, records] of groups) {
    const byYear = new Map<number, { amount: number; quantity: number }>();
    let proceeds = 0, quantity = 0;
    for (const s of records) {
      const sum = byYear.get(s.season) ?? { amount: 0, quantity: 0 };
      sum.amount += s.amount; sum.quantity += s.quantity; byYear.set(s.season, sum);
      proceeds += s.amount; quantity += s.quantity;
    }
    const annual = [...byYear.values()].map(o => o.amount / o.quantity);
    const sourceTrace = `Weighted realized baseline: $${proceeds} net proceeds / ${quantity} ${canonicalUnit(crop)}. Sales: ${records.map(ref).join(', ')}.`;
    summaries.set(crop, { proceeds, quantity, seasons: byYear.size, low: Math.min(...annual), high: Math.max(...annual), sourceTrace });
  }
  return summaries;
}

function historicalFields(harvests: HistoricalField[], startYear: number, issues: string[]) {
  const groups = new Map<string, CostHistory>();
  for (const h of harvests) {
    if (h.season >= startYear || !h.plantedAcres || h.plantedAcres <= 0) continue;
    const key = JSON.stringify([h.fieldId, normalizeCrop(h.crop), h.season]);
    const prior = groups.get(key);
    const origin = `${h.plantedAcres} planted acres from ${h.id ?? h.fieldId} (${h.source ?? 'harvest records'})`;
    if (prior) {
      // Harvest rows describe disjoint acreage observations, including subdivisions.
      prior.plantedAcres += h.plantedAcres;
      if (prior.previousCrop !== h.previousCrop) prior.previousCrop = undefined;
      if (prior.previousCover !== h.previousCover) prior.previousCover = undefined;
      if (prior.plannedCover !== h.plannedCover) prior.plannedCover = undefined;
      prior.sources.push(origin);
    } else groups.set(key, { ...h, plantedAcres: h.plantedAcres, amounts: {}, sources: [origin], complete: false, invalid: false });
  }
  if (harvests.some(h => h.season < startYear && h.plantedAcres === undefined))
    issues.push('Some harvests lack planted acres for estimating historical operating cost per planted acre.');
  const fields = [...groups.values()];
  for (const h of fields) {
    if (h.previousCrop) continue;
    const prior = fields.filter(r => r.fieldId === h.fieldId && r.season === h.season - 1);
    if (prior.length === 1) h.previousCrop = prior[0].crop;
  }
  return fields;
}

export function prepareLedger(input: LedgerInput): PreparedLedger {
  const issues: string[] = [];
  const history = historicalFields(input.harvests, input.startYear, issues);
  const lots = inventory(unique(input.purchases, issues), history, input.startYear, issues);
  const sales: Sale[] = [], contracts: PaymentRecord[] = [];
  const financials = financialTotals(), bySeason: Record<string, Totals> = {};
  for (const p of unique(input.payments, issues)) {
    if (p.status === 'cancelled' || p.status === 'pending') continue;
    if (p.kind === 'contract') {
      if (p.status === 'confirmed' && p.season && p.crop && p.quantity && p.unit && p.price !== undefined) contracts.push(p);
      else issues.push(`Contract ${ref(p)} requires confirmation, crop, production season, quantity, unit and price.`);
      continue;
    }
    if (p.amount === undefined) { issues.push(`Missing amount on ${ref(p)}.`); continue; }
    const seasonKey = p.season === undefined ? 'unassigned' : String(p.season);
    const totals = bySeason[seasonKey] ??= financialTotals();
    const add = (key: keyof Totals, value: number) => { financials[key] += value; totals[key] += value; };
    const amount = p.amount;
    if (p.kind === 'sale') {
      add('cropSales', amount);
      const cash = p.cashReceived ?? (p.status === 'receivable' ? 0 : p.paymentDate || p.status === 'paid' ? amount : undefined);
      if (cash === undefined || cash > amount) { add('unsettled', amount); issues.push(`Verify settlement of ${ref(p)}.`); }
      else { add('cashReceived', cash); add('receivable', amount - cash); }
      const q = p.crop && p.unit && p.quantity ? convertQuantity(p.quantity, p.unit, canonicalUnit(p.crop), p.crop) : null;
      if (q === null || q <= 0 || !p.crop || !p.season) issues.push(`Sale ${ref(p)} needs a growing season, commodity and compatible sale quantity for pricing.`);
      else if (p.season < input.startYear && recordedBeforeForecast(p.date, p.season, input.startYear, ref(p), issues))
        sales.push({ ...p, amount, crop: p.crop, season: p.season, quantity: q });
    } else if (p.kind === 'supplier-payment' || (p.kind === 'operating' && p.lotId)) {
      add('supplierPayments', amount);
      if (!lots.some(lot => lot.id === p.lotId)) issues.push(`Supplier payment ${ref(p)} is unmatched. Attribute the purchase and actual application to cost production.`);
    } else if (p.kind === 'operating') {
      add('operating', amount);
      if (!recordedBeforeForecast(p.date, p.season, input.startYear, ref(p), issues)) continue;
      const targets = history.filter(h => h.season === p.season && (!p.crop || cropIs(p.crop, h.crop)) && (!p.fieldId || p.fieldId === h.fieldId));
      if (!p.category || (!p.fieldId && !p.crop) || !targets.length || (!p.crop && targets.length > 1)) {
        issues.push(`Operating transaction ${ref(p)} lacks a unique field/crop assignment or planted-acre denominator.`);
        for (const h of targets) h.invalid = true;
        continue;
      }
      const acres = targets.reduce((sum, h) => sum + h.plantedAcres, 0);
      for (const h of targets) {
        h.amounts[p.category] = (h.amounts[p.category] ?? 0) + amount * h.plantedAcres / acres;
        h.sources.push(`${ref(p)}: $${amount} allocated across ${acres} planted acres`);
      }
    } else add(p.kind === 'transfer' ? 'transfers' : p.kind, amount);
  }
  const assumptions = unique(input.assumptions, issues);
  for (const h of history) {
    const declarations = assumptions.filter(a => a.kind === 'expense-coverage' && a.season === h.season && cropIs(a.crop, h.crop) &&
      (!a.fieldId || a.fieldId === h.fieldId) && (!a.plannedCover || cropIs(a.plannedCover, h.plannedCover)) && a.unit.toLowerCase() === 'complete' && a.value === 1);
    h.complete = declarations.length > 0 && !h.invalid;
    declarations.forEach(a => h.sources.push(`Complete expense records declared by ${ref(a)}`));
  }
  return { inventory: lots, financials, bySeason, sales, saleHistory: summarizeSales(sales), contracts, equipment: unique(input.equipment, issues), assumptions, history, issues };
}

export interface LedgerResult {
  grossRevenue: number | null; expenses: number | null; netReturn: number | null;
  knownExpenses: number | null; expenseBreakdown: Costs & { budget?: number };
  contractedQuantity: number; uncontractedQuantity: number | null; pricePerUnit: number | null;
  priceConfidence: 'low' | 'medium' | 'high'; trace: string[]; issues: string[];
}
function newResult(row: LedgerRow): LedgerResult {
  return { grossRevenue: null, expenses: null, netReturn: null, knownExpenses: null, expenseBreakdown: {},
    contractedQuantity: 0, uncontractedQuantity: row.production, pricePerUnit: null, priceConfidence: 'low', trace: [], issues: [] };
}

function inScope(a: LedgerAssumption, row: LedgerRow, season: number, scenario: LedgerScenario) {
  return cropIs(a.crop, row.crop) &&
    (a.season === undefined || a.season === season) && (!a.fieldId || a.fieldId === row.fieldId) &&
    (!a.previousCrop || cropIs(a.previousCrop, row.previousCrop)) && (!a.previousCover || cropIs(a.previousCover, row.previousCover)) &&
    (!a.plannedCover || cropIs(a.plannedCover, row.plannedCover)) &&
    (!a.scenario || a.scenario === scenario || a.scenario === 'expected');
}
// An explicit season wins over a continuing assumption, then field/rotation and the requested scenario.
const priority = (a: LedgerAssumption, scenario: LedgerScenario) => (a.season ? 64 : 0) + (a.fieldId ? 32 : 0) + (a.plannedCover ? 16 : 0) +
  (a.previousCrop ? 8 : 0) + (a.previousCover ? 4 : 0) + (a.scenario === scenario ? 2 : a.scenario === 'expected' ? 1 : 0);

function matchingAssumption(ledger: PreparedLedger, row: LedgerRow, season: number, scenario: LedgerScenario,
  kind: LedgerAssumption['kind'], issues: string[]) {
  const matches = ledger.assumptions.filter(a => a.kind === kind && inScope(a, row, season, scenario));
  const score = (a: LedgerAssumption) => priority(a, scenario);
  matches.sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
  if (matches.length > 1 && score(matches[0]) === score(matches[1])) {
    issues.push(`Conflicting ${kind} assumptions ${ref(matches[0])} and ${ref(matches[1])}; resolve before use.`); return null;
  }
  return matches[0];
}

function priceFor(ledger: PreparedLedger, row: LedgerRow, season: number, scenario: LedgerScenario, result: LedgerResult) {
  const priceFactor = (unit: string) => convertQuantity(1, unit.replace(/^(?:USD|\$)\s*\/\s*/i, ''), row.unit, row.crop);
  let price: number | undefined;
  let sourceKind: 'realized' | 'market-price' | 'farmer-price' = 'realized';
  for (const kind of ['farmer-price', 'market-price'] as const) {
    const quote = matchingAssumption(ledger, row, season, scenario, kind, result.issues);
    if (quote === null) return null;
    if (!quote) continue;
    const factor = priceFactor(quote.unit);
    if (!factor || quote.value < 0) { result.issues.push(`Invalid price or unit on ${ref(quote)}.`); return null; }
    price = quote.value / factor; sourceKind = kind;
    result.priceConfidence = 'medium';
    result.trace.push(`${kind} ${ref(quote)}: $${quote.value}/${quote.unit}; ${quote.season ?? 'all unspecified seasons'}, ${quote.scenario ?? 'all scenarios'}.`);
    if (scenario !== 'expected' && quote.scenario !== scenario) result.trace.push('Holding the quoted price fixed for this outlook; no scenario-specific quote supplied.');
    break;
  }
  if (price === undefined) {
    const history = ledger.saleHistory.get(normalizeCrop(row.crop));
    const factor = convertQuantity(1, canonicalUnit(row.crop), row.unit, row.crop);
    if (!history) {
      const estimate = matchingAssumption(ledger, row, season, scenario, 'historical-price', result.issues);
      const units = estimate && priceFactor(estimate.unit);
      if (estimate && units && estimate.value >= 0) {
        result.trace.push(`Historical price reported in ${ref(estimate)}: $${estimate.value}/${estimate.unit}. Sale quantities unavailable for weighting.`);
        if (scenario === 'expected' || estimate.scenario === scenario) return estimate.value / units;
        result.issues.push('No observed price range or scenario-specific price for this outlook.');
      } else result.issues.push(`Missing uncontracted sale price for ${row.crop}.`);
      return null;
    }
    if (!factor) { result.issues.push(`Unsupported production unit ${row.unit} for ${row.crop} sale prices.`); return null; }
    price = history.proceeds / history.quantity / factor;
    result.priceConfidence = history.seasons >= 3 ? 'medium' : 'low';
    if (scenario !== 'expected' && history.seasons > 1) price = (scenario === 'conservative' ? history.low : history.high) / factor;
    result.trace.push(history.sourceTrace);
    if (history.seasons < 2) {
      result.issues.push('One sale season; between-season price variability is unknown.');
      if (scenario !== 'expected') return null;
    }
    result.trace.push(`Realized ${scenario} price $${price.toFixed(3)}/${row.unit}. Range uses observed production-season weighted prices.`);
  }
  // Realized sale proceeds and farmer-entered selling prices are already farm-gate values.
  // Basis, delivery and marketing assumptions describe the conversion of a quoted market price to farm-gate terms.
  if (sourceKind === 'market-price') for (const kind of ['basis', 'delivery', 'marketing'] as const) {
    const adjustment = matchingAssumption(ledger, row, season, scenario, kind, result.issues);
    if (adjustment === null) return null;
    if (!adjustment) continue;
    const factor = priceFactor(adjustment.unit);
    if (!factor || (kind !== 'basis' && adjustment.value < 0)) {
      result.issues.push(`Invalid ${kind} value or commodity unit on ${ref(adjustment)}.`); return null;
    }
    price += adjustment.value / factor * (kind === 'basis' ? 1 : -1);
    result.trace.push(`${kind}: $${adjustment.value}/${adjustment.unit} from ${ref(adjustment)}.`);
  }
  return price;
}

function calculateRevenue(ledger: PreparedLedger, rows: LedgerRow[], season: number, scenario: LedgerScenario, results: LedgerResult[]) {
  const revenue = rows.map(() => 0), uncertain = new Set<number>();
  const contracts = ledger.contracts.filter(p => p.season === season).sort((a, b) =>
    Number(!!b.fieldId) - Number(!!a.fieldId) || (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id));
  for (const c of contracts) {
    const targets = rows.map((r, i) => ({ r, i })).filter(({ r }) => cropIs(c.crop, r.crop) && (!c.fieldId || c.fieldId === r.fieldId));
    if (!targets.length) {
      if (results[0]) results[0].issues.push(`No ${c.crop} production for contract ${ref(c)} in ${season}.`);
      continue;
    }
    const factors = targets.map(({ r }) => convertQuantity(1, r.unit, c.unit!, r.crop));
    if (factors.some(f => !f) || targets.some(({ i }) => results[i].uncontractedQuantity === null || uncertain.has(i))) {
      for (const { i } of targets) {
        if (results[i].uncontractedQuantity === 0) continue;
        uncertain.add(i); results[i].issues.push(`Cannot allocate contract ${ref(c)} until compatible production is known for every eligible field.`);
      }
      continue;
    }
    const remaining = targets.map(({ i }, j) => results[i].uncontractedQuantity! * factors[j]!);
    const eligible = remaining.reduce((s, q) => s + q, 0);
    const fraction = eligible === 0 ? 0 : Math.min(c.quantity!, eligible) / eligible;
    for (const [j, { i, r }] of targets.entries()) {
      const q = fraction * remaining[j], rowQuantity = q / factors[j]!;
      const result = results[i];
      result.contractedQuantity += rowQuantity;
      result.uncontractedQuantity = Math.max(0, r.production! - result.contractedQuantity);
      revenue[i] += q * c.price!;
      if (q > 0) result.trace.push(`Contract ${ref(c)}: ${q.toFixed(3)} ${c.unit} × $${c.price}; proportional to remaining eligible production, field contracts first, then contract date and ID.`);
      if (eligible < c.quantity!) result.issues.push(`Contract ${ref(c)} short by ${(c.quantity! - eligible).toFixed(3)} ${c.unit} across eligible fields.`);
    }
  }
  rows.forEach((r, i) => {
    const out = results[i];
    if (r.production === null || uncertain.has(i)) return;
    if (out.uncontractedQuantity! > 1e-9) {
      const price = priceFor(ledger, r, season, scenario, out);
      if (price === null) { out.priceConfidence = 'low'; return; }
      revenue[i] += out.uncontractedQuantity! * price;
      out.trace.push(`Uncontracted: ${out.uncontractedQuantity!.toFixed(3)} ${r.unit} × $${price.toFixed(3)}/${r.unit}.`);
    }
    if (out.contractedQuantity > 0 && out.uncontractedQuantity! < 1e-9) out.priceConfidence = 'high';
    out.grossRevenue = revenue[i]; out.pricePerUnit = r.production > 0 ? revenue[i] / r.production : null;
  });
}

const ACRES_PER_HECTARE = 10000 / 4046.8564224;
function capacityPerDay(e: EquipmentRecord) {
  if (e.dailyCapacityAcres) return e.dailyCapacityAcres;
  if (!e.widthM || !e.speedKph || !e.hoursPerDay || !e.efficiency) return null;
  return e.widthM * e.speedKph * e.hoursPerDay * e.efficiency / 10 * ACRES_PER_HECTARE;
}
function supports(e: EquipmentRecord, crop: string) {
  const crops = typeof e.supportedCrops === 'string' ? e.supportedCrops.split(/[,|;]/) : e.supportedCrops;
  return !!crops?.some(c => c.trim() === '*' || cropIs(c, crop));
}
interface FlowEdge { to: number; residual: number; back: number }
/** Bipartite maximum flow avoids declaring a conflict just because a flexible machine was booked before a specialized one. */
function assignFleet(demands: number[], fleet: EquipmentRecord[], capacities: number[], rows: LedgerRow[]) {
  const sink = demands.length + fleet.length + 1;
  const graph: FlowEdge[][] = Array.from({ length: sink + 1 }, () => []);
  const connect = (from: number, to: number, limit: number) => {
    const edge = { to, residual: limit, back: graph[to].length };
    graph[to].push({ to: from, residual: 0, back: graph[from].length });
    graph[from].push(edge);
    return edge;
  };
  const total = demands.reduce((s, v) => s + v, 0);
  const allocations: { i: number; j: number; edge: FlowEdge }[] = [];
  demands.forEach((d, i) => {
    connect(0, i + 1, d);
    if (!d) return;
    fleet.forEach((m, j) => {
      if (supports(m, rows[i].crop)) allocations.push({ i, j, edge: connect(i + 1, 1 + rows.length + j, d) });
    });
  });
  fleet.forEach((machine, j) => connect(1 + rows.length + j, sink,
    machine.availableDays === undefined ? total : capacities[j] * machine.availableDays));
  for (;;) {
    const parents = new Map<number, { node: number; edge: FlowEdge }>();
    const queue = [0];
    for (let k = 0; k < queue.length && !parents.has(sink); k++) {
      const node = queue[k];
      for (const edge of graph[node]) if (edge.to !== 0 && edge.residual > 1e-9 && !parents.has(edge.to)) {
        parents.set(edge.to, { node, edge }); queue.push(edge.to);
      }
    }
    if (!parents.has(sink)) break;
    let delta = total;
    for (let at = sink; at !== 0;) {
      const step = parents.get(at)!; delta = Math.min(delta, step.edge.residual); at = step.node;
    }
    for (let at = sink; at !== 0;) {
      const step = parents.get(at)!; step.edge.residual -= delta; graph[at][step.edge.back].residual += delta; at = step.node;
    }
  }
  return allocations.map(({ i, j, edge }) => ({ i, j, acres: graph[edge.to][edge.back].residual }));
}

function machinery(ledger: PreparedLedger, rows: LedgerRow[], season: number, results: LedgerResult[]) {
  const machineCosts: Costs[] = rows.map(() => ({}));
  for (const operation of ['plant', 'harvest'] as const) {
    const records = ledger.equipment.filter(e => e.operation === operation && (e.season === undefined || e.season === season));
    const versions = new Map<string, EquipmentRecord[]>();
    for (const e of records) {
      const id = e.machineId ?? e.id;
      const entries = versions.get(id) ?? [];
      entries.push(e); versions.set(id, entries);
    }
    const fleet: EquipmentRecord[] = [];
    for (const [machine, entries] of versions) {
      const seasonal = entries.filter(e => e.season === season), usable = seasonal.length ? seasonal : entries;
      if (usable.length > 1) {
        for (const result of results) result.issues.push(`Conflicting ${operation} specifications for machine ${machine}: ${usable.map(ref).join(', ')}.`);
      } else if (capacityPerDay(usable[0]) !== null && usable[0].supportedCrops) fleet.push(usable[0]);
    }
    const capacities = fleet.map(e => capacityPerDay(e)!);
    const demands = rows.map(r => (operation === 'plant' ? r.plantedAcres : r.harvestedAcres) ?? 0);
    const allocations = assignFleet(demands, fleet, capacities, rows), booked = rows.map(() => 0);
    for (const { i, j, acres } of allocations) {
      if (acres <= 1e-9) continue;
      booked[i] += acres;
      const machine = fleet[j], daily = capacities[j], days = acres / daily;
      results[i].trace.push(`${operation} with ${ref(machine)}: ${acres.toFixed(2)} ac / ${daily.toFixed(2)} ac/day = ${days.toFixed(2)} machine-days. ${machine.dailyCapacityAcres ? 'Declared effective daily capacity.' : `Width ${machine.widthM} m × ${machine.speedKph} km/h × ${machine.hoursPerDay} h/day × ${machine.efficiency} efficiency / 10, converted from hectares.`}`);
      if (machine.availableDays === undefined) results[i].issues.push(`Available ${operation} days unknown for ${ref(machine)}; schedule is unverified.`);
      if (machine.hoursPerDay === undefined) continue;
      const hours = days * machine.hoursPerDay;
      const add = (cat: 'fuel' | 'machinery', rate: number) => {
        machineCosts[i][cat] = (machineCosts[i][cat] ?? 0) + hours * rate;
        results[i].trace.push(`${cat} on ${ref(machine)}: ${hours.toFixed(2)} operating hours × $${rate.toFixed(2)}/h, when this category lacks an imported budget.`);
      };
      if (machine.operatingCostPerHour !== undefined) add('machinery', machine.operatingCostPerHour);
      if (machine.fuelPerHour !== undefined && machine.fuelPrice !== undefined) add('fuel', machine.fuelPerHour * machine.fuelPrice);
    }
    rows.forEach((r, i) => {
      const missing = demands[i] - booked[i];
      if (missing <= 1e-8) return;
      const eligible = fleet.filter(e => supports(e, r.crop));
      if (eligible.length) {
        const fastest = Math.max(...eligible.map(e => capacityPerDay(e)!));
        results[i].issues.push(`Shared ${operation} window exceeds available equipment by ${missing.toFixed(2)} ac on ${r.fieldId}; at least ${(missing / fastest).toFixed(2)} extra machine-days at the fastest compatible rate. No yield penalty applied.`);
      } else results[i].issues.push(records.length ? `No documented ${operation} capacity supporting ${r.crop}; check crop support and machine specifications.` :
        `No ${operation} equipment reported for ${season}; capacity unknown.`);
    });
  }
  return machineCosts;
}

/** Evaluate one farm, rotation, season and outlook together so no shared contract or machine is reused across fields. */
export function applyLedger(ledger: PreparedLedger, rows: LedgerRow[], season: number, scenario: LedgerScenario): LedgerResult[] {
  const results = rows.map(newResult);
  calculateRevenue(ledger, rows, season, scenario, results);
  const machines = machinery(ledger, rows, season, results);
  rows.forEach((row, i) => {
    resourceCost(ledger, row, season, scenario, results[i], machines[i]);
    const { grossRevenue, expenses } = results[i];
    if (grossRevenue !== null && expenses !== null) results[i].netReturn = grossRevenue - expenses;
  });
  return results;
}

function resourceCost(ledger: PreparedLedger, row: LedgerRow, season: number, scenario: LedgerScenario, out: LedgerResult, machine: Costs) {
  if (row.plantedAcres === null) return;
  const perAcre = (a: LedgerAssumption) => ['usd/acre', '$/ac', '$/acre', 'usd/ac'].includes(a.unit.toLowerCase()) && a.value >= 0;
  const includeCover = (alreadyIncluded: boolean) => {
    if (!row.plannedCover || alreadyIncluded) return true;
    const cover = matchingAssumption(ledger, row, season, scenario, 'cover-rate', out.issues);
    if (!cover || !perAcre(cover)) {
      out.issues.push(`Enter a complete operating cost for planned ${row.plannedCover} cover (cover-rate in USD/acre), or a budget covering that crop sequence.`);
      return false;
    }
    out.expenseBreakdown.cover = row.plantedAcres! * cover.value;
    out.trace.push(`Planned ${row.plannedCover} establishment and termination: ${row.plantedAcres} acres × $${cover.value}/acre from ${ref(cover)}.`);
    return true;
  };
  const budget = matchingAssumption(ledger, row, season, scenario, 'operating-rate', out.issues);
  if (budget === null) return;
  if (budget) {
    if (!perAcre(budget)) {
      out.issues.push(`Invalid operating budget on ${ref(budget)}; use a complete nonnegative USD/acre rate.`); return;
    }
    out.expenseBreakdown.budget = row.plantedAcres * budget.value;
    out.trace.push(`Complete ${budget.plannedCover ? `cash crop and ${budget.plannedCover} cover` : 'cash crop'} operating budget ${ref(budget)}: ${row.plantedAcres} planted acres × $${budget.value}/acre.`);
    const coversPlan = includeCover(!!budget.plannedCover);
    out.knownExpenses = out.expenseBreakdown.budget + (out.expenseBreakdown.cover ?? 0);
    if (coversPlan) out.expenses = out.knownExpenses;
    return;
  }
  const eligible = ledger.history.filter(h => cropIs(h.crop, row.crop) && !h.invalid && (h.complete || Object.keys(h.amounts).length));
  const matchedCover = eligible.filter(h => cropIs(h.plannedCover, row.plannedCover) && h.complete);
  const cropRecords = matchedCover.length ? matchedCover : eligible.filter(h => !h.plannedCover);
  const fieldRecords = cropRecords.filter(h => h.fieldId === row.fieldId);
  let records = fieldRecords.length ? fieldRecords : cropRecords;
  const complete = records.filter(h => h.complete);
  if (complete.length) records = complete;
  // Requiring two distinct seasons avoids treating a single prior-crop comparison as a repeatable effect.
  const comparable = records.filter(h => cropIs(h.previousCrop, row.previousCrop) &&
    (row.previousCover ? cropIs(h.previousCover, row.previousCover) : !h.previousCover));
  if (new Set(comparable.map(h => h.season)).size >= 2) records = comparable;
  const acres = records.reduce((s, h) => s + h.plantedAcres, 0);
  if (acres) {
    const categories = new Set(records.flatMap(h => Object.keys(h.amounts) as Category[]));
    for (const cat of categories) {
      // An absent category on an incomplete field-year is unknown; a signed-off zero is a valid denominator.
      const usable = records.filter(h => h.complete || h.amounts[cat] !== undefined);
      const expense = usable.reduce((s, h) => s + (h.amounts[cat] ?? 0), 0);
      const planted = usable.reduce((s, h) => s + h.plantedAcres, 0);
      out.expenseBreakdown[cat] = expense / planted * row.plantedAcres;
      out.trace.push(`${cat}: $${expense.toFixed(2)} / ${planted} historical planted acres × ${row.plantedAcres} forecast planted acres.`);
    }
    out.trace.push(`${records === comparable ? 'Rotation-matched' : 'Crop'} operating costs from ${records.map(h => `${h.fieldId}/${h.season} (${h.sources.join(', ')})`).join('; ')}.`);
  }
  const rates = ledger.assumptions.filter(a => a.kind === 'input-rate' && inScope(a, row, season, scenario));
  const grouped = new Map<Category, { a: LedgerAssumption; lot: Lot }[]>();
  let ratesValid = true;
  for (const a of rates) {
    const lot = ledger.inventory.find(l => l.id === a.lotId);
    if (!lot?.category) { out.issues.push(`Input rate ${ref(a)} needs a matching lot with a cost category.`); ratesValid = false; continue; }
    const rows = grouped.get(lot.category) ?? [];
    rows.push({ a, lot }); grouped.set(lot.category, rows);
  }
  for (const [cat, entries] of grouped) {
    const best = Math.max(...entries.map(({ a }) => priority(a, scenario)));
    const seen = new Set<string>();
    let amount = 0, valid = true;
    for (const { a, lot } of entries.filter(e => priority(e.a, scenario) === best)) {
      const unit = a.unit.replace(/\s*\/\s*(?:ac|acre)$/i, '');
      const quantity = unit.toLowerCase() === lot.unit.toLowerCase() ? a.value : convertQuantity(a.value, unit, lot.unit, '');
      if (seen.has(lot.id) || quantity === null || quantity < 0 || lot.unitCost === null) {
        out.issues.push(`Review duplicated lot, missing price or incompatible input units on ${ref(a)}.`); valid = false; continue;
      }
      seen.add(lot.id);
      amount += quantity * lot.unitCost * row.plantedAcres;
      out.trace.push(`${cat} requirement ${ref(a)}: ${quantity} ${lot.unit}/ac × $${lot.unitCost}/${lot.unit} from ${ref(lot)} × ${row.plantedAcres} planted acres.`);
    }
    if (valid) {
      const historical = out.expenseBreakdown[cat];
      if (historical !== undefined) out.trace.push(`${cat} savings against the historical budget: $${(historical - amount).toFixed(2)} ($${historical.toFixed(2)} − $${amount.toFixed(2)}).`);
      out.expenseBreakdown[cat] = amount;
    } else ratesValid = false;
  }
  if (!complete.length) for (const [k, value] of Object.entries(machine)) {
    const cat = k as Category;
    if (out.expenseBreakdown[cat] === undefined) out.expenseBreakdown[cat] = value;
    else out.trace.push(`Imported ${cat} expense already covers this category; machine estimate excluded.`);
  }
  const coversPlan = includeCover(matchedCover.length > 0);
  if (Object.keys(out.expenseBreakdown).length || complete.length)
    out.knownExpenses = Object.values(out.expenseBreakdown).reduce((sum, value) => sum + value, 0);
  if (complete.length && ratesValid && coversPlan) out.expenses = out.knownExpenses;
  else out.issues.push('Operating cost coverage is incomplete. Add a complete operating-rate or verify historical expense coverage to calculate net return.');
}
