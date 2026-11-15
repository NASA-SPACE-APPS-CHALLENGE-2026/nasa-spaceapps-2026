import type { z } from 'zod';
import { agronomyAssumptionSchema, harvestSchema, landSchema, normalizeCrop } from './forecastAgronomy';
import { equipmentSchema, ledgerAssumptionSchema, paymentSchema, purchaseSchema } from './forecastLedger';
import type { Dataset, ForecastRecords, RawRow } from './forecastRecords';

const numeric = new Set([
  'acres', 'usableAcres', 'unavailableAcres', 'plantedAcres', 'harvestedAcres', 'season',
  'quantity', 'harvestLossQuantity', 'totalPrice', 'price', 'amount', 'value', 'widthM', 'speedKph', 'hoursPerDay',
  'efficiency', 'availableDays', 'dailyCapacityAcres', 'actualUsage', 'operatingCostPerHour', 'fuelPerHour', 'fuelPrice', 'cashReceived',
]);
const crops = new Set(['crop', 'previousCrop', 'previousCover']);
const lists = new Set(['currentRotation', 'proposedRotation', 'supportedCrops']);
const identifiers = new Set(['id', 'fieldId', 'lotId', 'transactionId', 'machineId']);
const provenance = new Set(['source', 'importSource', 'originalRecord', 'correctedAt']);

/** CSV and JSON take the same validation path. Never coerce a blank cell to numeric zero. */
export function normalizeRecord(raw: RawRow): RawRow {
  const result: RawRow = Object.create(null);
  for (const [key, cell] of Object.entries(raw)) {
    let value = typeof cell === 'string' ? cell.trim() : cell;
    if (value === '' || value == null) continue;
    if (numeric.has(key) && typeof value === 'string' && Number.isFinite(Number(value))) value = Number(value);
    if (identifiers.has(key) && typeof value === 'number') value = String(value);
    if (crops.has(key) && typeof value === 'string') value = normalizeCrop(value);
    if (lists.has(key)) {
      const items = typeof value === 'string' ? value.split(/[,|;]/) : value;
      if (Array.isArray(items) && items.every((v) => typeof v === 'string')) value = items.map(normalizeCrop);
    }
    result[key] = value;
  }
  return result;
}

/** Only a stable record id identifies a transaction. Ambiguous conflicting versions need correction. */
function readRows<T>(dataset: Dataset, rows: RawRow[], schema: z.ZodType<T, z.ZodTypeDef, unknown>, issues: string[]): T[] {
  const valid = new Map<string, { signature: string; data: T }>();
  const conflicts = new Set<string>();
  rows.forEach((raw, i) => {
    const normalized = raw && typeof raw === 'object' && !Array.isArray(raw) ? normalizeRecord(raw) : {};
    const parsed = schema.safeParse(normalized);
    const ref = `${dataset} row ${i + 1}${normalized.id ? ` (${normalized.id})` : ''}`;
    if (!parsed.success) {
      issues.push(`${ref}: ${parsed.error.issues.map((e) => `${e.path.join('.') || 'record'}: ${e.message}`).join(', ')}. Row retained for correction.`);
      return;
    }
    const id = String(normalized.id);
    const signature = JSON.stringify(Object.entries(normalized).filter(([k]) => !provenance.has(k)).sort(([a], [b]) => a.localeCompare(b)));
    const before = valid.get(id);
    if (before) {
      if (before.signature === signature) issues.push(`${ref}: duplicate id; counted once.`);
      else {
        conflicts.add(id);
        issues.push(`${ref}: conflicting records share this id. Correct the records to include it.`);
      }
    } else valid.set(id, { signature, data: parsed.data });
  });
  return [...valid].filter(([id]) => !conflicts.has(id)).map(([, record]) => record.data);
}

export function validateForecastRecords(records: ForecastRecords) {
  const issues: string[] = [];
  return {
    land: readRows('land', records.land, landSchema, issues),
    harvests: readRows('harvests', records.harvests, harvestSchema, issues),
    equipment: readRows('equipment', records.equipment, equipmentSchema, issues),
    purchases: readRows('purchases', records.purchases, purchaseSchema, issues),
    payments: readRows('payments', records.payments, paymentSchema, issues),
    agronomy: readRows('agronomy', records.agronomy, agronomyAssumptionSchema, issues),
    markets: readRows('markets', records.markets, ledgerAssumptionSchema, issues),
    issues,
  };
}
