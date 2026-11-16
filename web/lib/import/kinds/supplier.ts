import { ASSUMPTION_BY_ID } from '../../domain/finance/assumptions';
import { buildParams } from '../../domain/finance/inputs';
import { type ImportContext, plural, r2 } from '../context';
import { text, toDate, toNumber, type ColumnMapping } from '../mapping';
import { lbsPerUnit, normUnit, pricePerNutrientLb, productInfo, seedUnitPrice } from '../products';
import type { Finding, PurchaseLine, Table } from '../types';

/** Invoice lines from a table (CSV, Excel, or a table read from a PDF or a scan). */
export function purchasesFromTable(t: Table, m: ColumnMapping, opts: { supplier?: string; date?: string } = {}): { rows: PurchaseLine[]; warnings: string[] } {
  const rows: PurchaseLine[] = [];
  const warnings: string[] = [];
  const col = (r: (string | number | null)[], role: string) => (m[role] === null || m[role] === undefined ? null : r[m[role]!]);
  let skipped = 0;
  for (const r of t.rows) {
    const product = text(col(r, 'product'));
    if (!product || /^(sub\s*total|total|tax|sales tax|amount due|balance|freight total|invoice total)\b/i.test(product)) continue;
    let qty = toNumber(col(r, 'qty'));
    let unitRaw = text(col(r, 'unit'));
    // "12 TON" or "40 BAG" in the quantity cell.
    const qCell = text(col(r, 'qty'));
    const qm = qCell.match(/^\s*([\d,.]+)\s*([A-Za-z#]+)\s*$/);
    if (qm && !unitRaw) unitRaw = qm[2];
    let unitPrice = toNumber(col(r, 'unitPrice'));
    const total = toNumber(col(r, 'total'));
    // "$612.00/TON" in the price cell.
    const pm = text(col(r, 'unitPrice')).match(/\/\s*([A-Za-z#]+)/);
    if (pm && !unitRaw) unitRaw = pm[1];
    if (unitPrice === undefined && total !== undefined && qty) unitPrice = total / qty;
    if (qty === undefined && total !== undefined && unitPrice) qty = total / unitPrice;
    if (unitPrice === undefined && total === undefined) {
      skipped++;
      continue;
    }
    const info = productInfo(product);
    const unit = normUnit(unitRaw || (info.type.startsWith('seed') ? 'unit' : ''));
    rows.push({
      date: toDate(col(r, 'date')) ?? opts.date,
      supplier: text(col(r, 'supplier')) || opts.supplier,
      product: product.slice(0, 80),
      productType: info.type,
      qty,
      unit: unit || undefined,
      unitPrice: unitPrice !== undefined ? r2(unitPrice) : undefined,
      total: total !== undefined ? r2(total) : unitPrice !== undefined && qty !== undefined ? r2(unitPrice * qty) : undefined,
      analysis: info.analysis,
      lbsPerUnit: lbsPerUnit(unit, info),
    });
  }
  if (skipped) warnings.push(`${plural(skipped, 'line')} had no price or total and ${skipped === 1 ? 'was' : 'were'} skipped.`);
  return { rows, warnings };
}

export function supplierSummary(rows: PurchaseLine[]): string {
  const total = rows.reduce((s, r) => s + (r.total ?? 0), 0);
  const suppliers = new Set(rows.map((r) => r.supplier).filter(Boolean));
  return `${plural(rows.length, 'invoice line')}${suppliers.size ? ` from ${[...suppliers].slice(0, 2).join(', ')}${suppliers.size > 2 ? ` and ${suppliers.size - 2} more` : ''}` : ''}, $${Math.round(total).toLocaleString('en-US')} in total`;
}

/** Weighted average of $/unit across lines, weighted by the quantity behind each. */
function wavg(xs: Array<{ v: number; w: number }>): number | undefined {
  const w = xs.reduce((s, x) => s + x.w, 0);
  return w > 0 ? xs.reduce((s, x) => s + x.v * x.w, 0) / w : undefined;
}

function topSupplier(rows: PurchaseLine[]): string | undefined {
  const by = new Map<string, number>();
  for (const r of rows) if (r.supplier) by.set(r.supplier, (by.get(r.supplier) ?? 0) + (r.total ?? 1));
  return [...by].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const CORN_SEEDS_PER_ACRE = 30000;

export function supplierFindings(rows: PurchaseLine[], ctx: ImportContext): { findings: Finding[]; warnings: string[] } {
  const findings: Finding[] = [];
  const warnings: string[] = [];
  const P = buildParams(ctx.finance);
  const priced = rows.filter((r) => r.unitPrice !== undefined && r.unitPrice > 0 && r.unit);

  // Nitrogen: $/lb N from every straight N source, weighted by pounds of N bought.
  const nLines = priced.filter((r) => r.productType === 'n-fertilizer');
  const n = wavg(nLines.flatMap((r) => {
    const v = pricePerNutrientLb(r.unitPrice!, r.unit!, productInfo(r.product), 0);
    return v === undefined ? [] : [{ v, w: (r.qty ?? 1) * (r.lbsPerUnit ?? 1) * (r.analysis?.[0] ?? 1) }];
  }));
  const nPrice = n ?? P.get('n.price');
  if (n !== undefined) findings.push(priceFinding('n.price', 'Nitrogen price', n, '$/lb N', nLines));

  // Phosphate: DAP/MAP/10-34-0 with their N valued at the nitrogen price.
  const pLines = priced.filter((r) => r.productType === 'p-fertilizer');
  const p = wavg(pLines.flatMap((r) => {
    const info = productInfo(r.product);
    const lbs = r.lbsPerUnit;
    if (!lbs || !info.analysis) return [];
    const nValue = (lbs * info.analysis[0] * nPrice) / 100;
    const pLbs = (lbs * info.analysis[1]) / 100;
    return pLbs > 0 ? [{ v: Math.max(0, r.unitPrice! - nValue) / pLbs, w: (r.qty ?? 1) * pLbs }] : [];
  }));
  if (p !== undefined) findings.push(priceFinding('p.price', 'Phosphate price', p, '$/lb P₂O₅', pLines, n !== undefined ? 'The nitrogen in DAP/MAP is valued at your nitrogen price.' : 'The nitrogen in DAP/MAP is valued at the default nitrogen price.'));

  const kLines = priced.filter((r) => r.productType === 'k-fertilizer');
  const k = wavg(kLines.flatMap((r) => {
    const v = pricePerNutrientLb(r.unitPrice!, r.unit!, productInfo(r.product), 2);
    return v === undefined ? [] : [{ v, w: (r.qty ?? 1) * (r.lbsPerUnit ?? 1) }];
  }));
  if (k !== undefined) findings.push(priceFinding('k.price', 'Potash price', k, '$/lb K₂O', kLines));

  // Seed: corn per 80,000-kernel bag → $/ac at 30,000 seeds; soybeans per 140,000-seed unit → $/ac.
  const cornLines = priced.filter((r) => r.productType === 'seed-corn');
  const bag = wavg(cornLines.flatMap((r) => {
    const v = seedUnitPrice('seed-corn', r.unitPrice!, r.unit!);
    return v === undefined ? [] : [{ v, w: r.qty ?? 1 }];
  }));
  if (bag !== undefined) {
    const perAc = (bag * CORN_SEEDS_PER_ACRE) / 80000;
    findings.push({ ...priceFinding('corn.seed', 'Corn seed cost', perAc, '$/ac', cornLines), evidence: `$${r2(bag)} per 80,000-kernel bag at 30,000 seeds/ac, from ${plural(cornLines.length, 'line')}` });
  }
  const soyLines = priced.filter((r) => r.productType === 'seed-soybeans');
  const unit = wavg(soyLines.flatMap((r) => {
    const v = seedUnitPrice('seed-soybeans', r.unitPrice!, r.unit!);
    return v === undefined ? [] : [{ v, w: r.qty ?? 1 }];
  }));
  if (unit !== undefined) findings.push({ ...priceFinding('soybeans.seed', 'Soybean seed cost', unit, '$/ac', soyLines), evidence: `$${r2(unit)} per 140,000-seed unit at 140,000 seeds/ac, from ${plural(soyLines.length, 'line')}` });

  const seedSupplier = topSupplier(rows.filter((r) => r.productType.startsWith('seed')));
  if (seedSupplier) findings.push({ target: 'supplier:seedSupplier', label: 'Seed supplier', group: 'Suppliers', value: seedSupplier.slice(0, 60), evidence: 'Supplier on your seed lines', suggested: true });
  const fertSupplier = topSupplier(rows.filter((r) => /fertilizer|lime|blend/.test(r.productType)));
  if (fertSupplier) findings.push({ target: 'supplier:fertilizerSupplier', label: 'Fertilizer supplier', group: 'Suppliers', value: fertSupplier.slice(0, 60), evidence: 'Supplier on your fertilizer lines', suggested: true });

  const unpriced = rows.filter((r) => /fertilizer|seed-corn|seed-soybeans/.test(r.productType) && (!r.unit || r.unitPrice === undefined));
  if (unpriced.length) warnings.push(`${plural(unpriced.length, 'fertilizer or seed line')} had no unit (ton, lb, gal, bag) PlotTwist could convert, so ${unpriced.length === 1 ? 'it' : 'they'} didn't set a price.`);
  const other = rows.filter((r) => !/fertilizer|seed-corn|seed-soybeans/.test(r.productType)).length;
  if (other) warnings.push(`${plural(other, 'line')} (herbicide, fuel, parts and other items) ${other === 1 ? 'is' : 'are'} kept in your records but don't set a per-unit price. Import your books under Finance to compare total spending.`);

  // Flag prices far from the defaults: likely a unit mix-up.
  for (const f of findings) {
    if (!f.target.startsWith('param:') || typeof f.value !== 'number') continue;
    const def = ASSUMPTION_BY_ID[f.target.slice(6)]?.value;
    if (def && (f.value > def * 3 || f.value < def / 3)) {
      f.suggested = false;
      f.evidence += `. Far from the usual ${def}; check the unit on the invoice.`;
    }
  }
  return { findings, warnings };
}

function priceFinding(id: string, label: string, value: number, unit: string, lines: PurchaseLine[], note?: string): Finding {
  const dates = lines.map((l) => l.date).filter(Boolean).sort();
  return {
    target: `param:${id}`,
    label,
    group: 'Input costs',
    value: r2(value),
    unit,
    evidence: `${plural(lines.length, 'invoice line')}${dates.length ? `, ${dates[0]}${dates.length > 1 && dates[dates.length - 1] !== dates[0] ? ` to ${dates[dates.length - 1]}` : ''}` : ''}${note ? `. ${note}` : ''}`,
    suggested: true,
  };
}
