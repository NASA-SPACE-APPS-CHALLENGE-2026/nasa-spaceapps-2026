import proj4 from 'proj4';
import { z } from 'zod';
import { acresFromM2, insideGeometry } from '../acreage';
import { CROP_CATALOG } from '../crops';
import type { Field, FieldGeometry } from '../types';
import { validateGeometry } from '../validation';

const nonnegative = z.number().finite().nonnegative();
const fraction = nonnegative.max(1);
const text = z.string().trim().min(1);
const seasonNumber = z.number().int().min(1800).max(9999);
const recordBase = { id: text, source: text };
const ring = z.array(z.array(z.number().finite()).min(2)).min(4);
const polygon = z.array(ring).min(1);
const geometry = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: polygon }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(polygon).min(1) }),
]);

export const landSchema = z.object({
  ...recordBase, name: text.optional(), geometry: geometry.optional(),
  acres: nonnegative.optional(), usableAcres: nonnegative.optional(), unavailableAcres: nonnegative.optional(),
  plantedAcres: nonnegative.optional(), harvestedAcres: nonnegative.optional(),
  currentRotation: z.array(text).optional(), proposedRotation: z.array(text).optional(),
  previousCrop: text.optional(), previousCover: text.optional(), soil: z.unknown().optional(), location: z.unknown().optional(),
}).passthrough();

export const harvestSchema = z.object({
  ...recordBase, fieldId: text, crop: text, season: seasonNumber,
  plantedAcres: nonnegative.optional(), harvestedAcres: nonnegative, quantity: nonnegative, unit: text,
  previousCrop: text.optional(), previousCover: text.optional(), plannedCover: text.optional(),
  harvestLossQuantity: nonnegative.optional(), harvestDate: text.optional(),
}).passthrough();

const outlook = z.enum(['conservative', 'expected', 'optimistic']);
export const agronomyAssumptionSchema = z.object({
  ...recordBase, kind: z.enum(['yield', 'benchmark', 'rotation', 'weather', 'soil', 'management', 'recencyWeight', 'plantedAcres', 'harvestedAcres', 'harvestEfficiency', 'harvestLoss', 'soilNOpening', 'soilNChange', 'soilNResponse']),
  crop: text.optional(), fieldId: text.optional(), season: seasonNumber.optional(), scenario: outlook.optional(),
  previousCrop: text.optional(), previousCover: text.optional(), value: z.number().finite(), unit: text.optional(),
}).passthrough().superRefine((a, ctx) => {
  if (['yield', 'benchmark', 'recencyWeight', 'plantedAcres', 'harvestedAcres', 'harvestLoss', 'soilNOpening'].includes(a.kind) && a.value < 0)
    ctx.addIssue({ code: 'custom', message: 'Yields, acres and weights must be nonnegative.' });
  if (a.kind === 'harvestEfficiency' && !fraction.safeParse(a.value).success)
    ctx.addIssue({ code: 'custom', message: 'Harvest efficiency is the share of planted acres harvested (0 to 1).' });
  if (a.kind === 'recencyWeight' && a.season === undefined)
    ctx.addIssue({ code: 'custom', message: 'Identify the historical season for this weight.' });
  if (a.unit && ['plantedAcres', 'harvestedAcres'].includes(a.kind) && !['ac', 'acre', 'acres'].includes(a.unit.toLowerCase()))
    ctx.addIssue({ code: 'custom', path: ['unit'], message: 'Enter planned acreage in acres.' });
  if (a.unit && ['recencyWeight', 'harvestEfficiency'].includes(a.kind) && !['1', 'fraction', 'weight', 'ratio', 'dimensionless'].includes(a.unit.toLowerCase()))
    ctx.addIssue({ code: 'custom', path: ['unit'], message: 'Enter weights and harvested fractions as unitless values.' });
});

export type LandRecord = z.infer<typeof landSchema>;
export type HarvestRecord = z.infer<typeof harvestSchema>;
export type AgronomyAssumption = z.infer<typeof agronomyAssumptionSchema>;
type Outlook = z.infer<typeof outlook>;
type Confidence = 'high' | 'medium' | 'low';

function key(raw: string) {
  return raw.trim().toLowerCase().replace(/[\s_]+/g, '-');
}
const cropNames = new Map<string, string>();
for (const crop of CROP_CATALOG) {
  for (const name of [crop.id, crop.name, ...(crop.aliases ?? [])]) cropNames.set(key(name), crop.id);
}
// Generic wheat has no evidence of a particular variety or sowing season.
cropNames.set('wheat', 'wheat');
cropNames.set('soybean', 'soybeans');
cropNames.set('oat', 'oats');
export function normalizeCrop(raw: string): string {
  return cropNames.get(key(raw)) ?? key(raw);
}

// USDA AMS Grain Inspection Handbook, Book II, table 1.9, US trade weights.
// https://www.ams.usda.gov/sites/default/files/media/Book2.pdf
const bushelPounds = new Map(Object.entries({
  wheat: 60, 'winter-wheat': 60, 'spring-wheat': 60, 'durum-wheat': 60, soybeans: 60,
  triticale: 60, corn: 56, sorghum: 56, flaxseed: 56, rye: 56, barley: 48, oats: 32,
}));
export function canonicalUnit(crop: string): 'bu' | 'lb' {
  return bushelPounds.has(normalizeCrop(crop)) ? 'bu' : 'lb';
}
const pounds = new Map<string, number>([
  ...['lb', 'lbs', 'pound', 'pounds'].map((u): [string, number] => [u, 1]),
  ...['cwt', 'hundredweight', 'us-hundredweight'].map((u): [string, number] => [u, 100]),
  ...['ton', 'tons', 'short-ton', 'short-tons', 'us-ton'].map((u): [string, number] => [u, 2000]),
  ...['kg', 'kilogram', 'kilograms'].map((u): [string, number] => [u, 1 / 0.45359237]),
  ...['t', 'tonne', 'tonnes', 'metric-ton', 'metric-tons'].map((u): [string, number] => [u, 1000 / 0.45359237]),
]);
function poundsPerUnit(unit: string, crop: string) {
  const u = key(unit);
  if (['bushel', 'bushels', 'bu'].includes(u)) return bushelPounds.get(normalizeCrop(crop));
  return pounds.get(u);
}
export function convertQuantity(quantity: number, from: string, to: string, crop: string): number | null {
  if (!Number.isFinite(quantity)) return null;
  const bushel = (raw: string) => ['bu', 'bushel', 'bushels'].includes(key(raw));
  if (bushel(from) && bushel(to)) return quantity;
  const a = poundsPerUnit(from, crop), b = poundsPerUnit(to, crop);
  if (a === undefined || b === undefined) return null;
  const result = quantity * (a / b);
  return Number.isFinite(result) ? result : null;
}

/** WGS84 Lambert azimuthal equal-area, centred on the field. Holes subtract independently of winding. */
function projectedAcres(g: FieldGeometry): number {
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  if (!polygons.length || polygons.some(poly => !poly.length)) throw new Error('Boundary has no exterior ring.');
  for (const rings of polygons) {
    for (const r of rings) {
      if (!r.length || r[0][0] !== r.at(-1)?.[0] || r[0][1] !== r.at(-1)?.[1])
        throw new Error('Boundary rings must be closed.');
    }
    const shell = { type: 'Polygon' as const, coordinates: [rings[0]] };
    if (rings.slice(1).some(hole => !insideGeometry([hole[0][0], hole[0][1]], shell)))
      throw new Error('Boundary hole lies outside the field.');
    const holes = rings.slice(1);
    if (holes.some((hole, i) => holes.some((other, j) => i !== j &&
      insideGeometry([hole[0][0], hole[0][1]], { type: 'Polygon', coordinates: [other] }))))
      throw new Error('Boundary contains nested holes.');
  }
  const invalid = validateGeometry(g).find(i => i.level === 'error');
  if (invalid) throw new Error(invalid.message);
  if (polygons.some((rings, i) => polygons.some((other, j) => i !== j &&
    insideGeometry([rings[0][0][0], rings[0][0][1]], { type: 'Polygon', coordinates: other }))))
    throw new Error('Boundary polygons overlap.');
  const [lon, lat] = polygons[0][0][0];
  const projection = proj4('EPSG:4326', `+proj=laea +lat_0=${lat} +lon_0=${lon} +x_0=0 +y_0=0 +datum=WGS84 +units=m`);
  let area = 0;
  for (const rings of polygons) {
    rings.forEach((r, i) => {
      const xy = r.map(([x, y]) => projection.forward([x, y]));
      let twiceArea = 0;
      for (let j = 1; j < xy.length; j++) twiceArea += xy[j - 1][0] * xy[j][1] - xy[j][0] * xy[j - 1][1];
      area += (i === 0 ? 1 : -1) * Math.abs(twiceArea) / 2;
    });
  }
  if (!Number.isFinite(area) || area <= 0) throw new Error('Boundary has no measurable field area.');
  return acresFromM2(area);
}

export interface ForecastAcreage {
  acres: number | null;
  usableAcres: number | null;
  plantedAcres: number | null;
  harvestedAcres: number | null;
  trace: string[];
  issues: string[];
}
export function forecastAcreage(field?: Field, land?: LandRecord, verifiedAcres?: number): ForecastAcreage {
  const trace: string[] = [], issues: string[] = [];
  const source = land ? `${land.id} (${land.source})` : field?.name ?? 'Field';
  const g = land?.geometry ?? field?.feature.geometry;
  let mapped: number | null = null;
  if (g) {
    try { mapped = projectedAcres(g); }
    catch (err) { issues.push(`${source}: ${err instanceof Error ? err.message : 'Invalid boundary.'}`); }
  }
  const pinAcres = field?.boundary === 'approximate' ? field.pin?.acres : undefined;
  const acres = verifiedAcres ?? land?.acres ?? pinAcres ?? mapped;
  if (verifiedAcres !== undefined) trace.push(`Farmer acreage correction for ${source}: ${acres} ac.`);
  else if (land?.acres !== undefined) trace.push(`Recorded field area: ${acres} ac from ${source}.`);
  else if (pinAcres !== undefined) trace.push(`Farmer-entered area for the approximate boundary of ${source} is ${pinAcres} ac.`);
  else if (mapped !== null) trace.push(`Boundary area: ${mapped.toFixed(2)} ac, field-centred Lambert azimuthal equal-area WGS84 / 4,046.8564224 m² per acre (${land?.source ?? field?.importMeta?.fileName ?? field?.name}).`);
  else issues.push(`${source}: supply total acres or a valid boundary.`);
  let usable = land?.usableAcres ?? (acres !== null && land?.unavailableAcres !== undefined ? acres - land.unavailableAcres : null);
  if (usable !== null && (usable < 0 || (acres !== null && usable > acres))) {
    issues.push(`${source}: usable acreage is outside total acreage.`); usable = null;
  }
  if (land?.usableAcres !== undefined && land.unavailableAcres !== undefined && acres !== null &&
      Math.abs(land.usableAcres + land.unavailableAcres - acres) > 0.01)
    issues.push(`${source}: usable and unavailable acres do not sum to the total; using recorded usable acres.`);
  if (usable !== null) trace.push(`Usable land: ${usable} ac from ${source}.`);
  const planted = land?.plantedAcres ?? null, harvested = land?.harvestedAcres ?? null;
  if (planted !== null || harvested !== null) trace.push(`Planned acreage from ${source}: planted ${planted ?? 'unknown'}, harvested ${harvested ?? 'unknown'} ac.`);
  return { acres, usableAcres: usable, plantedAcres: planted, harvestedAcres: harvested, trace, issues };
}

export interface AgronomyRequest {
  fieldId: string; crop: string; previousCrop?: string; previousCover?: string; season: number; startYear: number;
  scenario: Outlook; acreage: ForecastAcreage; harvests: HarvestRecord[]; assumptions: AgronomyAssumption[];
  history?: PreparedHarvestHistory;
}
export interface AgronomyResult {
  plantedAcres: number | null; harvestedAcres: number | null; yieldPerAcre: number | null; production: number | null;
  unit: 'bu' | 'lb'; confidence: Confidence; trace: string[]; issues: string[];
}

function sourceOf(record: { id: string; source: string }) {
  return `${record.id} (${record.source})`;
}

/** A matching annual/field-specific record supersedes a general assumption of the same kind. */
function assumptionFor(req: AgronomyRequest, kind: AgronomyAssumption['kind'], issues: string[], year = req.season): AgronomyAssumption | null | undefined {
  const applicable = req.assumptions.filter(a => a.kind === kind &&
    (!a.fieldId || a.fieldId === req.fieldId) && (!a.crop || normalizeCrop(a.crop) === normalizeCrop(req.crop)) &&
    (a.season === undefined || a.season === year) && (!a.scenario || a.scenario === req.scenario) &&
    (!a.previousCrop || normalizeCrop(a.previousCrop) === normalizeCrop(req.previousCrop ?? '')) &&
    (!a.previousCover || key(a.previousCover) === key(req.previousCover ?? '')));
  const specificity = (a: AgronomyAssumption) => [a.fieldId, a.crop, a.season, a.scenario, a.previousCrop, a.previousCover].filter(Boolean).length;
  applicable.sort((a, b) => specificity(b) - specificity(a));
  if (applicable.length > 1 && specificity(applicable[0]) === specificity(applicable[1])) {
    issues.push(`Conflicting ${kind} assumptions: ${applicable.filter(a => specificity(a) === specificity(applicable[0])).map(sourceOf).join(', ')}. Resolve before forecasting.`);
    return null;
  }
  return applicable[0];
}

type HistoricalHarvest = HarvestRecord & { inferredPredecessor?: string };
export interface PreparedHarvestHistory {
  startYear: number;
  byField: Map<string, HistoricalHarvest[]>;
  byCrop: Map<string, HistoricalHarvest[]>;
  issues: string[];
}
interface Observation { record: HistoricalHarvest; production: number; weight: number }
function seasonalYields(rows: Observation[]) {
  const seasons = new Map<number, { acres: number; production: number }>();
  for (const row of rows) {
    const s = seasons.get(row.record.season) ?? { acres: 0, production: 0 };
    s.acres += row.record.harvestedAcres * row.weight;
    s.production += row.production * row.weight;
    seasons.set(row.record.season, s);
  }
  return [...seasons.values()].filter(s => s.acres > 0).map(s => s.production / s.acres);
}
function observedYield(rows: Observation[], scenario: Outlook): number | null {
  const annual = seasonalYields(rows);
  if (!annual.length) return null;
  if (scenario !== 'expected') {
    if (annual.length < 2) return null;
    return scenario === 'conservative' ? Math.min(...annual) : Math.max(...annual);
  }
  const prod = rows.reduce((sum, r) => sum + r.production * r.weight, 0);
  const acres = rows.reduce((sum, r) => sum + r.record.harvestedAcres * r.weight, 0);
  return acres > 0 ? prod / acres : null;
}

function groupHarvests(rows: HistoricalHarvest[], keyOf: (r: HistoricalHarvest) => string) {
  const groups = new Map<string, HistoricalHarvest[]>();
  for (const r of rows) {
    const key = keyOf(r);
    const group = groups.get(key);
    if (group) group.push(r);
    else groups.set(key, [r]);
  }
  return groups;
}

/** Build once for a forecast and reuse across both plans, all outlooks, fields and years. */
export function prepareHarvestHistory(harvests: HarvestRecord[], startYear: number): PreparedHarvestHistory {
  const issues: string[] = [];
  const seen = new Set<string>();
  const valid = harvests.filter(r => {
    if (r.season >= startYear) return false;
    if (seen.has(r.id)) { issues.push(`Duplicate harvest ${sourceOf(r)} counted once.`); return false; }
    seen.add(r.id);
    if (r.harvestDate && (/^\d{4}-\d{2}-\d{2}/.test(r.harvestDate) && Number(r.harvestDate.slice(0, 4)) !== r.season))
      issues.push(`Review harvest ${sourceOf(r)}: harvest date ${r.harvestDate} differs from growing season ${r.season}. Using the assigned season.`);
    if (r.plantedAcres !== undefined && r.harvestedAcres > r.plantedAcres || (r.harvestedAcres === 0 && r.quantity > 0)) {
      issues.push(`Review harvest ${sourceOf(r)}: production or harvested acreage conflicts with acreage reported.`);
      return false;
    }
    return true;
  });
  // Infer a missing previous crop only across adjacent seasons on the same field.
  // A multi-crop year alone cannot establish which predecessor occupied this area.
  const byField = new Map<string, Map<number, HarvestRecord[]>>();
  for (const r of valid) {
    const byYear = byField.get(r.fieldId) ?? new Map<number, HarvestRecord[]>();
    const rows = byYear.get(r.season) ?? [];
    rows.push(r); byYear.set(r.season, rows); byField.set(r.fieldId, byYear);
  }
  const records = valid.map(r => {
    if (r.previousCrop && r.previousCover) return r;
    const previous = byField.get(r.fieldId)?.get(r.season - 1) ?? [];
    const names = new Set(previous.map(p => normalizeCrop(p.crop)));
    if (names.size !== 1) return r;
    const previousCrop = normalizeCrop(previous[0].crop);
    if (r.previousCrop && normalizeCrop(r.previousCrop) !== previousCrop) return r;
    const covers = new Set(previous.map(p => key(p.plannedCover ?? '')));
    const previousCover = covers.size === 1 ? previous[0].plannedCover : undefined;
    if (r.previousCrop && !previousCover) return r;
    return { ...r, previousCrop: r.previousCrop ?? previousCrop, previousCover: r.previousCover ?? previousCover, inferredPredecessor: previous.map(sourceOf).join(', ') };
  });
  return { startYear, byField: groupHarvests(records, r => r.fieldId), byCrop: groupHarvests(records, r => normalizeCrop(r.crop)), issues };
}

/** A double crop uses the land sequentially. The largest crop footprint is used if multiple crops were recorded. */
function meanFootprint(rows: HarvestRecord[], metric: 'plantedAcres' | 'harvestedAcres') {
  const bySeason = new Map<number, Map<string, number>>();
  for (const r of rows) {
    const acres = r[metric];
    if (acres === undefined) continue;
    const season = bySeason.get(r.season) ?? new Map<string, number>();
    const crop = normalizeCrop(r.crop);
    season.set(crop, (season.get(crop) ?? 0) + acres);
    bySeason.set(r.season, season);
  }
  const footprints = [...bySeason.values()].map(s => Math.max(...s.values()));
  return footprints.reduce((total, ac) => total + ac, 0) / footprints.length;
}

function planting(req: AgronomyRequest, history: HarvestRecord[], trace: string[], issues: string[]) {
  const fieldHistory = history.filter(r => r.fieldId === req.fieldId && r.plantedAcres !== undefined);
  const matching = fieldHistory.filter(r => normalizeCrop(r.crop) === normalizeCrop(req.crop));
  const areaHistory = matching.length ? matching : fieldHistory;
  const upper = req.acreage.usableAcres ?? req.acreage.acres;
  const p = assumptionFor(req, 'plantedAcres', issues);
  let planted = p === null ? null : p?.value ?? req.acreage.plantedAcres;
  if (p) trace.push(`Planned planted area: ${p.value} ac from ${sourceOf(p)}.`);
  if (planted === null && p !== null && areaHistory.length) {
    const mean = meanFootprint(areaHistory, 'plantedAcres');
    planted = Math.min(mean, upper ?? Infinity);
    trace.push(`Planted area from mean historical field footprint (${mean.toFixed(2)} ac) limited by available acreage: ${planted.toFixed(2)} ac. Harvests ${areaHistory.map(sourceOf).join(', ')}.`);
  }
  let invalidPlanted = false;
  if (planted !== null && upper !== null && planted > upper + 0.000001) {
    issues.push(`Planted area ${planted} ac exceeds available land ${upper.toFixed(2)} ac.`);
    planted = null; invalidPlanted = true;
  }
  const h = assumptionFor(req, 'harvestedAcres', issues);
  let harvested = h === null ? null : h?.value ?? req.acreage.harvestedAcres;
  const efficiency = harvested === null && h === undefined ? assumptionFor(req, 'harvestEfficiency', issues) : undefined;
  if (h) trace.push(`Planned harvested area: ${h.value} ac from ${sourceOf(h)}.`);
  if (harvested === null && h !== null && planted !== null) {
    if (planted === 0) harvested = 0;
    else if (efficiency) {
      harvested = planted * efficiency.value;
      trace.push(`Expected harvested acres = ${planted} planted ac × ${efficiency.value} harvested fraction from ${sourceOf(efficiency)}.`);
    } else if (efficiency !== null && areaHistory.length) {
      const acresPlanted = areaHistory.reduce((sum, r) => sum + r.plantedAcres!, 0);
      const acresHarvested = areaHistory.reduce((sum, r) => sum + r.harvestedAcres, 0);
      if (acresPlanted > 0) {
        harvested = planted * acresHarvested / acresPlanted;
        trace.push(`Expected harvested acres = ${planted} planted ac × (${acresHarvested}/${acresPlanted} ac historically harvested). Harvests ${areaHistory.map(sourceOf).join(', ')}.`);
      }
    }
  }
  if (harvested === null && h === undefined && efficiency === undefined) {
    const records = history.filter(r => r.fieldId === req.fieldId && normalizeCrop(r.crop) === normalizeCrop(req.crop));
    if (records.length) {
      const mean = meanFootprint(records, 'harvestedAcres');
      harvested = Math.min(mean, upper ?? Infinity, planted ?? Infinity);
      trace.push(`Harvested area from mean observed ${req.crop} harvest footprint (${mean.toFixed(2)} ac), limited by planned land. Harvests ${records.map(sourceOf).join(', ')}.`);
    }
  }
  if (invalidPlanted || (harvested !== null && harvested > Math.min(planted ?? Infinity, upper ?? Infinity) + 0.000001)) {
    issues.push('Review planned acreage: harvested acres must fit both the field and the planted area.');
    harvested = null;
  }
  if (planted === null) issues.push('Supply planned planted acres or historical planted acreage for this field.');
  if (harvested === null) issues.push('Supply planned harvested acres, an evidenced harvest fraction, or paired planted and harvested acres.');
  if (harvested !== null && planted !== null && planted > harvested) trace.push(`${(planted - harvested).toFixed(2)} planted acres expected to remain unharvested.`);
  return { plantedAcres: planted, harvestedAcres: harvested };
}

function observations(req: AgronomyRequest, history: HistoricalHarvest[], trace: string[], issues: string[]) {
  const unit = canonicalUnit(req.crop);
  const all: Observation[] = [];
  const weightByYear = new Map<number, number | null>();
  for (const r of history) {
    if (normalizeCrop(r.crop) !== normalizeCrop(req.crop) || !r.harvestedAcres) continue;
    const production = convertQuantity(r.quantity, r.unit, unit, req.crop);
    if (production === null) { issues.push(`Harvest ${sourceOf(r)}: cannot convert ${r.unit} to ${unit} for ${req.crop}.`); continue; }
    if (!weightByYear.has(r.season)) {
      const entry = assumptionFor(req, 'recencyWeight', issues, r.season);
      weightByYear.set(r.season, entry === null ? null : entry?.value ?? 1);
      if (entry) trace.push(`${r.season} harvest recency weight ${entry.value} from ${sourceOf(entry)}.`);
    }
    const weight = weightByYear.get(r.season);
    if (weight != null && weight > 0) all.push({ record: r, production, weight });
  }
  const local = all.filter(o => o.record.fieldId === req.fieldId);
  const rows = local.length ? local : all;
  // Tukey's sample fences are a review signal. A flagged observation remains in all totals.
  if (rows.length >= 4) {
    const values = rows.map(o => o.production / o.record.harvestedAcres).sort((a, b) => a - b);
    const quartile = (p: number) => {
      const index = (values.length - 1) * p, lo = Math.floor(index);
      return values[lo] + (values[Math.ceil(index)] - values[lo]) * (index - lo);
    };
    const q1 = quartile(0.25), q3 = quartile(0.75), iqr = q3 - q1;
    for (const row of rows) {
      const y = row.production / row.record.harvestedAcres;
      if (y < q1 - 1.5 * iqr || y > q3 + 1.5 * iqr)
        issues.push(`Review unusual yield ${y.toFixed(2)} ${unit}/ac in ${sourceOf(row.record)} (outside 1.5 × IQR). Observation retained.`);
    }
  }
  return { rows, local: local.length > 0 };
}

/** Yield assumptions may use production units or the corresponding "unit/ac" notation. */
function yieldValue(a: AgronomyAssumption, crop: string, unit: string, issues: string[]) {
  const from = a.unit?.replace(/\s*\/\s*(ac|acre|acres)$/i, '') ?? unit;
  const value = convertQuantity(a.value, from, unit, crop);
  if (value === null) issues.push(`Review ${sourceOf(a)}: cannot express ${from} as ${unit} for ${crop}.`);
  return value;
}

function estimateYield(req: AgronomyRequest, history: HistoricalHarvest[], trace: string[], issues: string[]) {
  const unit = canonicalUnit(req.crop);
  const modeled = assumptionFor(req, 'yield', issues);
  const low = 'low' as Confidence;
  if (modeled === null) return { value: null, confidence: low };
  if (modeled) {
    const value = yieldValue(modeled, req.crop, unit, issues);
    trace.push(`Final modeled yield from ${sourceOf(modeled)}: ${value ?? 'unknown'} ${unit}/ac. The final model includes rotation, weather and management effects.`);
    if (req.scenario !== 'expected' && !modeled.scenario) {
      issues.push('A central modeled yield was supplied without a scenario-specific model interval.');
      return { value: null, confidence: low };
    }
    return { value, confidence: low };
  }
  const { rows, local } = observations(req, history, trace, issues);
  const annual = seasonalYields(rows);
  const benchmark = assumptionFor(req, 'benchmark', issues);
  const benchmarkValue = benchmark ? yieldValue(benchmark, req.crop, unit, issues) : null;
  if (benchmark && benchmarkValue !== null && annual.length < 3)
    trace.push(`Regional benchmark ${benchmarkValue.toFixed(2)} ${unit}/ac from ${sourceOf(benchmark)}${annual.length ? ' (comparison for sparse history)' : ''}.`);
  if (rows.length) {
    const weightedProduction = rows.reduce((v, r) => v + r.production * r.weight, 0);
    const weightedAcres = rows.reduce((v, r) => v + r.record.harvestedAcres * r.weight, 0);
    trace.push(`${local ? 'Field' : 'Other farm fields'}: ${weightedProduction.toFixed(2)} weighted ${unit} / ${weightedAcres.toFixed(2)} weighted harvested ac; default season weight 1. Harvests: ${rows.map(r => `${sourceOf(r.record)}, ${r.record.season}, ${r.record.quantity} ${r.record.unit} / ${r.record.harvestedAcres} ac × weight ${r.weight}`).join('; ')}.`);
    for (const { record } of rows) {
      if (record.harvestLossQuantity !== undefined)
        trace.push(`${sourceOf(record)} reports ${record.harvestLossQuantity} ${record.unit} lost before measurement. Recorded production already excludes this loss.`);
    }
    if (unit === 'bu' && rows.some(r => !['bu', 'bushel', 'bushels'].includes(key(r.record.unit))))
      trace.push(`Mass converted at ${bushelPounds.get(normalizeCrop(req.crop))} lb per US trade bushel (USDA AMS Grain Inspection Handbook, Book II, Table 1.9).`);
  }
  let confidence: Confidence = local && annual.length >= 3 ? 'medium' : 'low';
  if (annual.length < 3) issues.push(`Only ${annual.length} comparable harvest season(s). ${benchmark ? 'See regional benchmark.' : 'Supply a local benchmark or more harvest seasons.'}`);
  if (rows.length && !local) issues.push('No usable harvests for this crop on this field. Using other farm fields.');

  const rotation = assumptionFor(req, 'rotation', issues);
  let useRows = rows;
  let conditioned = false;
  if (local && req.previousCrop) {
    const matched = rows.filter(r => normalizeCrop(r.record.previousCrop ?? '') === normalizeCrop(req.previousCrop!) &&
      (!req.previousCover || key(r.record.previousCover ?? '') === key(req.previousCover)));
    const other = rows.filter(({ record }) => record.previousCrop && (
      normalizeCrop(record.previousCrop) !== normalizeCrop(req.previousCrop!) ||
      (req.previousCover && record.previousCover && key(record.previousCover) !== key(req.previousCover))));
    const matchingYears = seasonalYields(matched).length, comparisonYears = seasonalYields(other).length;
    if (matched.length === rows.length) {
      conditioned = true;
      trace.push(`Every contributing field harvest already reflects the requested preceding crop (${req.previousCrop}).`);
    } else if (matchingYears >= 3 && comparisonYears >= 3) {
      useRows = matched; conditioned = true;
      const delta = observedYield(matched, 'expected')! - observedYield(rows, 'expected')!;
      trace.push(`Observed rotation adjustment for ${req.crop} following ${req.previousCrop}${req.previousCover ? ` with ${req.previousCover} cover` : ''}: ${delta.toFixed(2)} ${unit}/ac vs the field baseline. Matching harvests ${matched.map(r => sourceOf(r.record)).join(', ')}.`);
      for (const { record } of matched) if (record.inferredPredecessor)
        trace.push(`Previous crop for ${record.id} comes from the preceding season's harvest: ${record.inferredPredecessor}.`);
    } else if (!rotation) trace.push(`Rotation comparison has ${matchingYears} matching and ${comparisonYears} other seasons. The field baseline uses all harvests until three seasons per group or a sourced adjustment are available.`);
  }
  const weather = assumptionFor(req, 'weather', issues);
  const modeledWeather = weather?.scenario === req.scenario;
  // Applying a sourced weather deviation to an already unusually dry/wet historical year
  // would include that effect twice. Start scenario-specific weather from the central yield.
  let value = observedYield(useRows, modeledWeather ? 'expected' : req.scenario);
  let usedBenchmark = false;
  if (value === null && benchmarkValue !== null && (req.scenario === 'expected' || modeledWeather || benchmark?.scenario === req.scenario)) {
    value = benchmarkValue; usedBenchmark = true; confidence = 'low';
  }
  if (value === null) {
    issues.push(req.scenario === 'expected' ? 'Missing usable crop yield or regional benchmark.' : 'Insufficient evidence for this yield outlook: supply more harvest seasons or a scenario-specific yield.');
    return { value: null, confidence: low };
  }
  if (req.scenario !== 'expected' && !usedBenchmark && !modeledWeather && seasonalYields(useRows).length >= 2)
    trace.push(`${req.scenario === 'conservative' ? 'Lowest' : 'Highest'} observed annual acreage-weighted yield: ${value.toFixed(2)} ${unit}/ac. Historical range, not a prediction interval.`);
  for (const kind of ['rotation', 'weather', 'soil', 'management', 'harvestLoss'] as const) {
    const a = kind === 'rotation' ? rotation : kind === 'weather' ? weather : assumptionFor(req, kind, issues);
    if (a === null && !(kind === 'rotation' && conditioned)) return { value: null, confidence: low };
    if (!a) continue;
    if (kind === 'weather' && usedBenchmark && benchmark?.scenario) {
      trace.push(`The regional benchmark already includes this outlook; skipped weather adjustment ${sourceOf(a)}.`); continue;
    }
    if (kind === 'rotation' && (conditioned || (usedBenchmark && (benchmark?.previousCrop || benchmark?.previousCover)))) {
      trace.push(`The baseline already includes this crop sequence; skipped rotation adjustment ${sourceOf(a)}.`); continue;
    }
    const delta = yieldValue(a, req.crop, unit, issues);
    if (delta === null) return { value: null, confidence: low };
    const signed = kind === 'harvestLoss' ? -delta : delta;
    value += signed;
    trace.push(`${kind === 'harvestLoss' ? 'Additional expected harvest loss vs baseline' : kind} adjustment: ${signed.toFixed(2)} ${unit}/ac from ${sourceOf(a)}.`);
  }
  if (value < 0) { issues.push('Sourced yield changes produce a negative yield; review the assumptions.'); return { value: null, confidence: low }; }
  return { value, confidence };
}

export function forecastAgronomy(req: AgronomyRequest): AgronomyResult {
  const trace = [...req.acreage.trace], issues = [...req.acreage.issues];
  const unit = canonicalUnit(req.crop);
  if (normalizeCrop(req.crop) === 'fallow') return {
    unit, plantedAcres: 0, harvestedAcres: 0, yieldPerAcre: null, production: 0, confidence: 'high',
    trace: [...trace, 'Fallow plan: no cash crop planted or harvested.'], issues,
  };
  const history = req.history?.startYear === req.startYear ? req.history : prepareHarvestHistory(req.harvests, req.startYear);
  issues.push(...history.issues);
  const area = planting(req, history.byField.get(req.fieldId) ?? [], trace, issues);
  const { value: yieldPerAcre, confidence } = estimateYield(req, history.byCrop.get(normalizeCrop(req.crop)) ?? [], trace, issues);
  const production = area.harvestedAcres === 0 ? 0 :
    area.harvestedAcres !== null && yieldPerAcre !== null ? area.harvestedAcres * yieldPerAcre : null;
  if (area.harvestedAcres !== null && yieldPerAcre !== null)
    trace.push(`Production = ${area.harvestedAcres.toFixed(2)} harvested ac × ${yieldPerAcre.toFixed(2)} ${unit}/ac = ${production!.toFixed(2)} ${unit}. Historical harvest quantities already include recorded harvest losses.`);
  return { ...area, unit, yieldPerAcre, production, confidence, trace, issues: [...new Set(issues)] };
}
