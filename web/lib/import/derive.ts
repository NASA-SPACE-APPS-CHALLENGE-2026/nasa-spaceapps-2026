import { ASSUMPTION_BY_ID } from '../domain/finance/assumptions';
import type { Tillage } from '../domain/finance/budget';
import type { ImportedFinance } from '../domain/finance/inputs';
import type { Finding, ImportRecord } from './types';

/**
 * What the farmer's applied imports change. Pure: recomputed from the stored records every time,
 * so unticking a finding or removing a file undoes it with nothing left behind.
 * When two files set the same value, the most recently imported one wins.
 */
export function derivedFromImports(imports: ImportRecord[]): ImportedFinance {
  const out: ImportedFinance = { overrides: {}, sources: {}, lastYear: {}, suppliers: {}, fields: {} };
  const ordered = [...imports].sort((a, b) => a.importedAt.localeCompare(b.importedAt));
  for (const rec of ordered) {
    const applied = new Set(rec.applied);
    for (const f of rec.findings) {
      if (!applied.has(f.target)) continue;
      applyFinding(out, f, rec);
    }
  }
  return out;
}

function applyFinding(out: ImportedFinance, f: Finding, rec: ImportRecord) {
  const [kind, ...rest] = f.target.split(':');
  const source = { name: `Your records: ${rec.fileName}`, date: `imported ${rec.importedAt.slice(0, 10)}` };
  if (kind === 'param') {
    const id = rest.join(':');
    if (!ASSUMPTION_BY_ID[id] || typeof f.value !== 'number' || !Number.isFinite(f.value)) return;
    out.overrides[id] = f.value;
    out.sources[id] = source;
    return;
  }
  if (kind === 'lastYear' && typeof f.value === 'number') {
    if (rest[0] === 'totalRevenue') out.lastYear.totalRevenue = f.value;
    if (rest[0] === 'totalCosts') out.lastYear.totalCosts = f.value;
    return;
  }
  if (kind === 'supplier' && typeof f.value === 'string') {
    const key = rest[0] as keyof ImportedFinance['suppliers'];
    if (key === 'seedSupplier' || key === 'fertilizerSupplier' || key === 'grainBuyer') out.suppliers[key] = f.value;
    return;
  }
  if (kind === 'field') {
    const [fieldId, what] = rest;
    const cur = (out.fields[fieldId] ??= {});
    if (what === 'nRateCorn' && typeof f.value === 'number') cur.nRateCorn = f.value;
    if (what === 'tillage' && (f.value === 'no-till' || f.value === 'reduced' || f.value === 'conventional')) cur.tillage = f.value as Tillage;
  }
  // crop:<fieldId>:<year> findings change Fields directly when applied (see applyCropFindings), not finance.
}

/** Crop-history findings the farmer ticked: fieldId → year → catalog crop id. */
export function cropConfirmations(rec: ImportRecord): Array<{ fieldId: string; year: number; crop: string }> {
  const applied = new Set(rec.applied);
  return rec.findings
    .filter((f) => f.target.startsWith('crop:') && applied.has(f.target) && typeof f.value === 'string')
    .map((f) => {
      const [, fieldId, year] = f.target.split(':');
      return { fieldId, year: Number(year), crop: f.value as string };
    });
}
