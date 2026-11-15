import { parseFinance, type FinanceInputs } from '../../domain/finance/inputs';

const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const number = (v: unknown): number | undefined => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;

/** AP stored per-field profiles under the same key main uses for a farm object.
 * Preserve all original records. Only migrate units and concepts that map exactly.
 */
export function readCompatibleFinance(items: Record<string, unknown>, hasLegacyScenarios: boolean): FinanceInputs {
  if (items.farm) return parseFinance(items.farm);
  const result = parseFinance({});
  let migrated = 0;
  for (const raw of Object.values(items)) {
    const f = object(raw);
    if (typeof f.fieldId !== 'string' || !f.crops) continue;
    migrated++;
    const id = f.fieldId;
    const tenure = f.landTenure === 'owned' ? 'own' : f.landTenure === 'cash-rent' ? 'cash' : f.landTenure === 'share-rent' ? 'share' : undefined;
    result.fields[id] = { tenure, rentPerAcre: number(f.cashRentPerAcre), sharePct: number(f.shareRentPct) };
    const cropInputs: NonNullable<FinanceInputs['simulator'][string]['cropInputs']> = {};
    const overrides: Record<string, number> = {};
    for (const [crop, value] of Object.entries(object(f.crops))) {
      const c = object(value);
      // No implicit unit conversion or collapsing distinct crops into one budget proxy.
      if (['corn', 'soybeans', 'oats', 'winter-wheat'].includes(crop) && c.yieldUnit === 'bushel') {
        cropInputs[crop] = { yield: number(c.yieldPerAcre) };
        const key = crop === 'winter-wheat' ? 'wheat' : crop;
        const price = number(c.pricePerUnit);
        if (price !== undefined) overrides[`${key}.price`] = price;
      }
    }
    result.simulator[id] = { cropInputs, overrides };
  }
  if (migrated || hasLegacyScenarios) result.migrationNotes = [
    `${migrated} earlier AP financial profile(s) retained. Compatible grain yields/prices are available in each field’s scenario financial view; land tenure is shared. Old cost breakdowns and scenario presets remain in browser storage because they do not map exactly to the integrated model. The whole-farm baseline uses main’s Finance assumptions; review Your numbers before relying on it.`,
  ];
  return result;
}
