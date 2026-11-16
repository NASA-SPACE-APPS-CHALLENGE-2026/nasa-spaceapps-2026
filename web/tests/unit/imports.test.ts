import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDemoFarm } from '@/lib/demo/demoFarm';
import { setSeasonCrop } from '@/lib/domain/cropHistory';
import { analyzeFarm } from '@/lib/domain/finance/analysis';
import { farmFieldInputs } from '@/lib/domain/finance/farm';
import { buildParams, DEFAULT_FINANCE, effectiveLastYear, withImports } from '@/lib/domain/finance/inputs';
import { derivedFromImports } from '@/lib/import/derive';
import { categorize, scrub } from '@/lib/import/kinds/finance';
import { cropFromText, detectMapping, toDate, toNumber } from '@/lib/import/mapping';
import { evaluate, readFile, toRecord, type ReadEnv } from '@/lib/import/process';
import { lbsPerUnit, nLbsPerAcre, pricePerNutrientLb, productInfo, seedUnitPrice } from '@/lib/import/products';
import { ocrImages } from '@/lib/import/readers/ocr';
import type { Finding, ImportKind, ImportRecord } from '@/lib/import/types';

const NOW = new Date('2026-11-14T00:00:00Z');
const fields = buildDemoFarm(NOW);
const ctx = { fields, currentYear: 2026, finance: DEFAULT_FINANCE };
const env: ReadEnv = { pdfjs: async () => (await import('pdfjs-dist/legacy/build/pdf.mjs')) as never };
const sample = (n: string) => new Uint8Array(readFileSync(path.join(__dirname, '..', '..', 'samples', n)));

async function run(name: string, kind: ImportKind, e: ReadEnv = env, c = ctx) {
  const bytes = sample(name);
  const d = await readFile({ name, size: bytes.length, bytes }, kind, c, e);
  return { d, ev: evaluate(d, c) };
}
const find = (fs: Finding[], target: string) => fs.find((f) => f.target === target);

describe('cell parsing and mapping', () => {
  it('reads money, negatives and units', () => {
    expect(toNumber('$1,234.50')).toBe(1234.5);
    expect(toNumber('(12.00)')).toBe(-12);
    expect(toNumber('12.5 bu/ac')).toBe(12.5);
    expect(toNumber('')).toBeUndefined();
    expect(toNumber('n/a')).toBeUndefined();
  });

  it('reads US, ISO, written and Excel-serial dates', () => {
    expect(toDate('11/12/2025')).toBe('2025-11-12');
    expect(toDate('2025-04-08 10:00')).toBe('2025-04-08');
    expect(toDate('Nov 3, 2025')).toBe('2025-11-03');
    expect(toDate(45970)).toBe('2025-11-09');
    expect(toDate('13/45/2025')).toBeUndefined();
  });

  it('recognises crops in free text', () => {
    expect(cropFromText('CORN #2 YEL')).toBe('corn');
    expect(cropFromText('Soybeans - RR2X')).toBe('soybeans');
    expect(cropFromText('HRW Wheat')).toBe('winter-wheat');
    expect(cropFromText('Sweet corn')).toBe('sweet-corn');
    expect(cropFromText('Fuel')).toBeNull();
  });

  it('maps QuickBooks headers to roles, one column per role', () => {
    const m = detectMapping(['Date', 'Transaction Type', 'Num', 'Name', 'Memo/Description', 'Account', 'Split', 'Amount'], 'finance');
    expect(m).toMatchObject({ date: 0, name: 3, memo: 4, account: 5, amount: 7 });
  });
});

describe('products and unit math', () => {
  it('prices nutrients per pound', () => {
    const nh3 = productInfo('Anhydrous Ammonia 82-0-0');
    expect(pricePerNutrientLb(820, 'ton', nh3, 0)).toBeCloseTo(0.5, 5); // $820/ton ÷ 1,640 lb N
    const uan = productInfo('UAN 28% Solution');
    expect(lbsPerUnit('gal', uan)).toBe(10.67);
    expect(nLbsPerAcre(10, 'gal/ac', uan)).toBeCloseTo(29.9, 1);
    expect(nLbsPerAcre(185, 'lb/ac', nh3)).toBeCloseTo(151.7, 1);
    expect(nLbsPerAcre(150, 'lb N/ac', productInfo('anything'))).toBe(150);
    expect(productInfo('11-52-0 MAP').type).toBe('p-fertilizer');
    expect(productInfo('Custom blend 10-20-30').analysis).toEqual([10, 20, 30]);
  });

  it('prices seed per standard unit', () => {
    expect(seedUnitPrice('seed-corn', 3.9, 'kseeds')).toBeCloseTo(312, 5);
    expect(seedUnitPrice('seed-soybeans', 62, 'unit')).toBe(62);
    expect(seedUnitPrice('seed-soybeans', 1.2, 'lb')).toBeCloseTo(60, 5);
  });
});

describe('yield and harvest records', () => {
  it('CSV: acre-weighted yields of the latest year, corn split by the crop before', async () => {
    const { d, ev } = await run('yield-2023-2025.csv', 'yield');
    expect(d.format).toBe('csv');
    expect(find(ev.findings, 'param:corn.yield')).toMatchObject({ value: 204.9, suggested: true });
    expect(find(ev.findings, 'param:corn.yieldAfterCorn')?.value).toBe(194.6);
    expect(find(ev.findings, 'param:soybeans.yield')?.value).toBe(60.1);
    // The demo farm's crops are already confirmed and match, so there is nothing to confirm.
    expect(ev.findings.some((f) => f.group === 'Crop history')).toBe(false);
  });

  it('CSV: offers to fill an empty season on Fields, and flags a conflict without ticking it', async () => {
    const north = fields[0];
    const emptied = { ...north, crops: setSeasonCrop(north.crops, 2025, null) };
    const conflicting = { ...fields[5], crops: setSeasonCrop(fields[5].crops, 2025, { kind: 'catalog', id: 'soybeans' }) };
    const c = { ...ctx, fields: [emptied, ...fields.slice(1, 5), conflicting] };
    const { ev } = await run('yield-2023-2025.csv', 'yield', env, c);
    expect(find(ev.findings, `crop:${north.id}:2025`)).toMatchObject({ value: 'corn', suggested: true });
    expect(find(ev.findings, `crop:${conflicting.id}:2025`)).toMatchObject({ value: 'corn', suggested: false });
  });

  it('shapefile yield map: mean of the points inside each field', async () => {
    const { d, ev } = await run('yield-map-2025.zip', 'yield');
    expect(d.format).toBe('shapefile');
    const f = find(ev.findings, 'param:corn.yield')!;
    expect(f.value as number).toBeGreaterThan(200);
    expect(f.value as number).toBeLessThan(222);
    expect(ev.summary).toMatch(/2 fields/);
  });

  it('ISOXML: decodes the binary time logs and converts mass yield to bushels', async () => {
    const { d, ev } = await run('TASKDATA-2025.zip', 'yield');
    expect(d.format).toBe('isoxml');
    expect(ev.warnings).toEqual([]);
    const y = find(ev.findings, 'param:corn.yield')!.value as number;
    expect(y).toBeGreaterThan(205);
    expect(y).toBeLessThan(219);
  });
});

describe('machine and equipment records', () => {
  it('CSV: nitrogen from anhydrous plus UAN, seeding rates, and tillage', async () => {
    const { ev } = await run('as-applied-2025.csv', 'machine');
    const north = fields[0];
    // 185 lb/ac anhydrous (151.7 lb N) + 9 gal/ac UAN 28% (26.9 lb N)
    expect(find(ev.findings, `field:${north.id}:nRateCorn`)?.value).toBe(179);
    expect(find(ev.findings, 'param:corn.nLbs')?.value).toBe(179);
    expect(find(ev.findings, `field:${north.id}:tillage`)?.value).toBe('conventional');
    const seed = find(ev.findings, 'param:corn.seed')!;
    expect(seed.value).toBeCloseTo((113.7 * 34000) / 30000, 0);
  });

  it('ISOXML: application and planting rates from the time logs', async () => {
    const { ev } = await run('TASKDATA-2025.zip', 'machine');
    expect(find(ev.findings, `field:${fields[0].id}:nRateCorn`)?.value).toBe(151);
    expect(ev.findings.find((f) => f.target === 'param:corn.seed')?.evidence).toMatch(/3[34],\d{3} seeds\/ac/);
  });
});

describe('finance and payments', () => {
  it('QuickBooks: totals, prices received, rent, and opt-in actual-cost scaling', async () => {
    const { ev, d } = await run('quickbooks-2025.csv', 'finance');
    const rows = (ev.data.kind === 'finance' ? ev.data.rows : []);
    expect(rows.find((r) => r.category === 'transfer')).toBeTruthy();
    expect(find(ev.findings, 'lastYear:totalRevenue')).toMatchObject({ value: 510309, suggested: true });
    expect(find(ev.findings, 'lastYear:totalCosts')).toMatchObject({ value: 430551, suggested: true });
    expect(find(ev.findings, 'param:corn.price')?.value).toBe(4.2);
    expect(find(ev.findings, 'param:soybeans.price')?.value).toBe(10.45);
    expect(find(ev.findings, 'param:rent')?.value).toBe(285);
    expect(find(ev.findings, 'supplier:grainBuyer')?.value).toBe('ADM Des Moines');
    const seed = find(ev.findings, 'param:actual.seed')!;
    expect(seed.suggested).toBe(false);
    expect(seed.value as number).toBeGreaterThan(1);
    expect(d.mapping?.memo).toBe(4);
  });

  it('Stripe: failed payments left out, refunds and fees counted, emails removed, partial year not ticked', async () => {
    const { ev } = await run('stripe-payments-2025.csv', 'finance');
    const rows = ev.data.kind === 'finance' ? ev.data.rows : [];
    expect(rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0)).toBeCloseTo(1440 + 2600 + 980 - 80, 2);
    expect(rows.some((r) => r.description === 'Stripe processing fee' && r.amount < 0)).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/@example\.com/);
    expect(find(ev.findings, 'lastYear:totalRevenue')?.suggested).toBe(false);
    expect(ev.warnings.join(' ')).toMatch(/did not go through/);
  });

  it('categorises by account first, then description', () => {
    expect(categorize('Seeds and Plants', 'Prairie Valley', -1)).toBe('seed');
    expect(categorize('', 'Casey’s diesel', -1)).toBe('machinery');
    expect(categorize('', 'Soybean seed from Beck’s', -1)).toBe('seed');
    expect(categorize('', 'Heartland Co-op settlement corn', 1)).toBe('grain-sale');
    expect(categorize('Owner’s Draw', 'x', -1)).toBe('transfer');
    expect(scrub('Paid by jane@farm.com card 4111 1111 1111 1111')).toBe('Paid by [email] card [number]');
  });
});

describe('supplier and purchase records', () => {
  const expectInvoice = (fs: Finding[]) => {
    expect(find(fs, 'param:n.price')?.value).toBe(0.48);
    expect(find(fs, 'param:p.price')?.value).toBe(0.78);
    expect(find(fs, 'param:k.price')?.value).toBe(0.43);
    expect(find(fs, 'param:corn.seed')?.value).toBe(118.13);
    expect(find(fs, 'param:soybeans.seed')?.value).toBe(62.5);
  };

  it('Excel invoice: nutrient prices and seed costs', async () => {
    const { ev } = await run('coop-invoice-2026.xlsx', 'supplier');
    expectInvoice(ev.findings);
  });

  it('PDF invoice with a text layer: same numbers, plus the supplier and date from the header', async () => {
    const { d, ev } = await run('coop-invoice-2026.pdf', 'supplier');
    expect(d.format).toBe('pdf');
    expect(d.meta).toEqual({ supplier: 'Prairie Valley Cooperative', date: '2026-02-11' });
    expectInvoice(ev.findings);
    expect(find(ev.findings, 'supplier:fertilizerSupplier')?.value).toBe('Prairie Valley Cooperative');
  });

  it('photo of an invoice: read with OCR on this computer', async () => {
    const langPath = path.join(__dirname, '..', '..', 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int');
    const { d, ev } = await run('coop-invoice-2026-photo.png', 'supplier', { ocr: (imgs, onProgress) => ocrImages(imgs as Uint8Array[], { paths: { langPath, cacheMethod: 'none' }, onProgress }) });
    expect(d.format).toBe('image');
    expectInvoice(ev.findings);
  }, 60000);

  it('a scanned PDF without a text layer is reported, not guessed, when OCR is unavailable', async () => {
    await expect(run('coop-invoice-2026-scan.pdf', 'supplier')).rejects.toThrow(/No table/);
  });
});

describe('applying findings (review, then apply)', () => {
  const rec = (id: string, findings: Finding[], applied: string[], importedAt: string): ImportRecord => ({ id, kind: 'yield', fileName: `${id}.csv`, size: 1, format: 'csv', importedAt, summary: '', warnings: [], data: { kind: 'yield', rows: [] }, findings, applied });
  const f = (target: string, value: number): Finding => ({ target, label: target, group: 'Yields', value, evidence: '', suggested: true });

  it('only applied findings count; the latest file wins; a typed value beats any file', () => {
    const a = rec('a', [f('param:corn.yield', 200), f('param:soybeans.yield', 55)], ['param:corn.yield'], '2026-11-01T00:00:00Z');
    const b = rec('b', [f('param:corn.yield', 210)], ['param:corn.yield'], '2026-11-02T00:00:00Z');
    const imported = derivedFromImports([b, a]);
    expect(imported.overrides).toEqual({ 'corn.yield': 210 });
    const P = buildParams(withImports(DEFAULT_FINANCE, imported));
    expect(P.resolve('corn.yield')).toMatchObject({ value: 210, origin: 'import' });
    expect(P.sourceOf('corn.yield').name).toBe('Your records: b.csv');
    const typed = buildParams(withImports({ ...DEFAULT_FINANCE, overrides: { 'corn.yield': 190 } }, imported));
    expect(typed.resolve('corn.yield')).toMatchObject({ value: 190, origin: 'farmer' });
    // Removing the files undoes everything.
    expect(buildParams(withImports(DEFAULT_FINANCE, derivedFromImports([]))).resolve('corn.yield').origin).toBe('default');
  });

  it('last year totals: typed first, then imported books', () => {
    const r = rec('books', [{ ...f('lastYear:totalRevenue', 500000), group: 'Totals' }], ['lastYear:totalRevenue'], '2026-11-01T00:00:00Z');
    const eff = withImports(DEFAULT_FINANCE, derivedFromImports([r]));
    expect(effectiveLastYear(eff)).toMatchObject({ totalRevenue: 500000, fromRecords: { revenue: true } });
    expect(effectiveLastYear({ ...eff, lastYear: { crops: {}, totalRevenue: 1 } }).totalRevenue).toBe(1);
  });

  it('imported yields, prices and actual costs move the projections and the partial budget', async () => {
    const plans: never[] = [];
    const base = analyzeFarm(farmFieldInputs(fields, plans, DEFAULT_FINANCE), buildParams(DEFAULT_FINANCE), { beginningFarmer: false });
    const { d, ev } = await run('quickbooks-2025.csv', 'finance');
    const all = ev.findings.map((x) => x.target);
    const record = toRecord(d, ev, all, 'qb', NOW);
    const eff = withImports(DEFAULT_FINANCE, derivedFromImports([record]));
    const after = analyzeFarm(farmFieldInputs(fields, plans, eff), buildParams(eff), { beginningFarmer: false });
    const cost = (a: typeof base, cat: 'seed' | 'machinery') => a.current.reduce((s, y) => s + y.costs[cat], 0);
    expect(cost(after, 'seed')).toBeGreaterThan(cost(base, 'seed') * 1.2);
    expect(cost(after, 'machinery')).toBeLessThan(cost(base, 'machinery'));
    expect(after.current[0].revenue).not.toBeCloseTo(base.current[0].revenue, 0);
    expect(after.transparency.find((t) => t.id === 'actual.seed')?.source.name).toBe('Your records: quickbooks-2025.csv');
    expect(base.transparency.some((t) => t.id.startsWith('actual.'))).toBe(false);
  });

  it('per-field nitrogen from machine records reaches the field setup', async () => {
    const { d, ev } = await run('as-applied-2025.csv', 'machine');
    const record = toRecord(d, ev, ev.findings.map((x) => x.target), 'm', NOW);
    const eff = withImports(DEFAULT_FINANCE, derivedFromImports([record]));
    const input = farmFieldInputs(fields, [], eff).find((x) => x.id === fields[0].id)!;
    expect(input.setup).toMatchObject({ nRateCorn: 179, tillage: 'conventional' });
  });
});
