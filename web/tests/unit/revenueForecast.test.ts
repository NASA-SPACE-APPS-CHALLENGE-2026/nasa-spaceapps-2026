import { describe, expect, it } from 'vitest';
import { forecastRevenue } from '@/lib/domain/finance/forecast';
import { emptyForecastRecords } from '@/lib/domain/finance/forecastRecords';
import { DEFAULT_FINANCE } from '@/lib/domain/finance/inputs';
import type { Plan } from '@/lib/domain/types';
import { createLocalRepositories } from '@/lib/repo/local';
import { MemoryStorage } from '@/lib/repo/local/storage';
import { FarmStore } from '@/lib/client/store';

/** Quantities in this synthetic farm are deliberately unequal to exercise quantity weighting. */
function farm() {
  const records = emptyForecastRecords();
  records.land = [
    { id: 'N', source: 'Acreage certification', acres: '100', unavailableAcres: '10', plantedAcres: '80', harvestedAcres: '72', previousCrop: 'corn', currentRotation: 'corn', proposedRotation: 'soybean,corn' },
    { id: 'E', source: 'Survey', acres: 50, usableAcres: 45, plantedAcres: 44, harvestedAcres: 40, currentRotation: ['soybeans'], proposedRotation: ['corn', 'soybeans'] },
  ];
  records.harvests = [
    { id: 'H1', fieldId: 'N', crop: 'Corn', season: 2025, harvestedAcres: 50, plantedAcres: 55, quantity: 10000, unit: 'bu', source: 'Scale tickets' },
    { id: 'H2', fieldId: 'N', crop: 'Corn', season: 2026, harvestedAcres: 30, plantedAcres: 35, quantity: 168000, unit: 'lb', source: 'Grain cart' },
    { id: 'H3', fieldId: 'E', crop: 'Soybeans', season: 2025, harvestedAcres: 40, plantedAcres: 42, quantity: 2000, unit: 'bu', source: 'Weighbridge' },
    { id: 'H4', fieldId: 'E', crop: 'Soybean', season: 2026, harvestedAcres: 20, plantedAcres: 20, quantity: 900, unit: 'bu', source: 'Weighbridge' },
  ];
  const sale = { id: 'T1', kind: 'sale', crop: 'corn', season: 2025, quantity: 100, unit: 'bu', amount: 600, status: 'paid', source: 'Elevator 1' };
  records.payments = [sale, { ...sale, source: 'Reimported same sale', importSource: 'second.csv' },
    { ...sale, id: 'T2', season: 2026, quantity: 900, amount: 4400, status: 'receivable' },
    { ...sale, id: 'T3', kind: 'contract', season: 2027, quantity: 1000, price: 7, status: 'confirmed' },
    { id: 'F', kind: 'financing', amount: 20000, source: 'Bank' },
  ];
  records.equipment = [{ id: 'P', source: 'Equipment record', operation: 'plant', widthM: 6, speedKph: 6, hoursPerDay: 8, efficiency: 0.8, availableDays: 1, supportedCrops: ['corn', 'soybeans'] }];
  records.purchases = [
    { id: 'U', kind: 'purchase', product: 'Urea', quantity: 5000, totalPrice: 1500, unit: 'lb', category: 'fertilizer', source: 'Supplier' },
    { id: 'A', kind: 'application', lotId: 'U', quantity: 1000, unit: 'lb', fieldId: 'N', crop: 'corn', season: 2026, source: 'Application log' },
  ];
  records.markets = [
    { id: 'B1', kind: 'operating-rate', crop: 'corn', value: 320, unit: 'USD/acre', source: 'Farm budget' },
    { id: 'B2', kind: 'operating-rate', crop: 'soybeans', value: 210, unit: 'USD/acre', source: 'Farm budget' },
    { id: 'Q', kind: 'market-price', crop: 'soybeans', value: 12, unit: 'bu', source: 'Delivery quote' },
    { id: 'Q2', kind: 'market-price', crop: 'soybeans', season: 2028, value: 13, unit: 'bu', source: 'Next delivery quote' },
  ];
  return records;
}

describe('whole-farm rotation forecast', () => {
  it('balances field, commodity and annual dollars for two independent rotations and all horizons', () => {
    for (const horizon of [3, 5, 10] as const) {
      const f = forecastRevenue({ records: farm(), startYear: 2027, horizon });
      expect(f.landAcres).toBe(150); expect(f.usableAcres).toBe(135);
      expect(f.financials).toMatchObject({ cropSales: 5000, cashReceived: 600, receivable: 4400, financing: 20000 });
      expect(f.inventory[0]).toMatchObject({ used: 1000, ending: 4000, endingValue: 1200 });
      expect(f.issues.join(' ')).toMatch(/duplicate/i);
      const s = f.scenarios.expected, [one, two] = s.years;
      const soyYield = 2900 / 60;
      const currentGross = 1000 * 7 + (11700 - 1000) * 5 + 40 * soyYield * 12;
      const proposedGross = 1000 * 7 + (40 * 162.5 - 1000) * 5 + 72 * soyYield * 12;
      expect(one.current.fields[0]).toMatchObject({ yieldPerAcre: 162.5, production: 11700, grossRevenue: 60500, expenses: 25600, netReturn: 34900 });
      expect(one.current.totals.grossRevenue).toBeCloseTo(currentGross);
      expect(one.proposed.totals.grossRevenue).toBeCloseTo(proposedGross);
      expect(one.delta.grossRevenue).toBeCloseTo(proposedGross - currentGross);
      expect(one.delta.netReturn).toBeCloseTo(proposedGross - currentGross - ((80 * 210 + 44 * 320) - (80 * 320 + 44 * 210)));
      for (const breakdown of [one.fieldChanges, one.cropChanges]) expect(breakdown.reduce((n, r) => n + r.grossRevenue!, 0)).toBeCloseTo(one.delta.grossRevenue!);
      expect(two.proposed.fields[0]).toMatchObject({ crop: 'corn', previousCrop: 'soybeans', contractedQuantity: 0 });
      expect(two.current.crops.find(c => c.crop === 'soybeans')?.grossRevenue).toBeCloseTo(40 * soyYield * 13);
      expect(s.years).toHaveLength(horizon);
      expect(s.current.grossRevenue).toBeCloseTo(s.years.reduce((n, y) => n + y.current.totals.grossRevenue!, 0));
      expect(f.scenarios.optimistic.years[0].current.totals.grossRevenue!).toBeGreaterThan(f.scenarios.conservative.years[0].current.totals.grossRevenue!);
      expect(one.current.fields.flatMap(r => r.issues).join(' ')).toMatch(/available equipment/);
    }
  });

  it('propagates field, rotation, yield and price corrections while keeping copied records intact', () => {
    const records = farm();
    const next = () => forecastRevenue({ records, startYear: 2027, horizon: 3 }).scenarios.expected.years[0].proposed.fields[0];
    expect(next().crop).toBe('soybeans');
    records.land[0].proposedRotation = 'corn';
    records.land[0].harvestedAcres = 60;
    records.agronomy.push({ id: 'M', source: 'Local rotation trial', kind: 'rotation', fieldId: 'N', crop: 'corn', previousCrop: 'soybeans', value: 3, unit: 'bu/ac' });
    expect(next().production).toBe(60 * 162.5);
    records.land[0].previousCrop = 'soybeans';
    expect(next().production).toBe(60 * 165.5);
    records.agronomy.push({ id: 'Y', source: 'Calibrated model', kind: 'yield', fieldId: 'N', crop: 'corn', value: 170, unit: 'bu/ac' });
    records.markets.push({ id: 'P', kind: 'farmer-price', crop: 'corn', value: 6, unit: 'bu', source: 'Marketing plan' });
    const row = next();
    expect(row.production).toBe(10200);
    expect(row.grossRevenue).toBeCloseTo(row.contractedQuantity * 7 + row.uncontractedQuantity! * 6);
    expect(records.harvests[0].crop).toBe('Corn');
  });

  it('carries evidenced nitrogen changes forward separately for each plan', () => {
    const records = farm();
    const assumptions = [
      { kind: 'soilNOpening', value: 30, unit: 'lb N/ac', season: 2027 },
      { kind: 'soilNChange', value: 8, unit: 'lb N/ac', crop: 'soybeans' },
      { kind: 'soilNChange', value: -2, unit: 'lb N/ac', crop: 'corn' },
      { kind: 'soilNResponse', value: 0.5, unit: 'bu/lb N', crop: 'corn' },
    ];
    records.agronomy = assumptions.map((a, i) => ({ ...a, fieldId: 'N', id: String(i), source: 'Synthetic calibrated field nitrogen model' }));
    const [, second] = forecastRevenue({ records, startYear: 2027, horizon: 3 }).scenarios.expected.years;
    expect(second.proposed.fields[0].yieldPerAcre).toBe(166.5);
    expect(second.current.fields[0].yieldPerAcre).toBe(161.5);
    expect(second.proposed.fields[0].trace.join(' ')).toContain('38 lb N/ac');
  });

  it('reprices a saved Planner sequence, carries its cover into the following season and repeats the plan', () => {
    const records = farm();
    const plan: Plan = { id: 'rotation', name: 'Cover trial', strategyId: 'custom', fieldId: 'N', createdAt: '2026-10-20', updatedAt: '2026-11-01',
      seasons: [
        { year: 2027, crop: { kind: 'catalog', id: 'corn' }, cover: { species: 'rye', name: 'Cereal rye' }, tasks: [] },
        { year: 2028, crop: { kind: 'catalog', id: 'soybeans' }, tasks: [] },
      ] };
    const next = () => forecastRevenue({ records, plans: [plan], startYear: 2027, horizon: 3 }).scenarios.expected.years;
    expect(next()[0].proposed.fields[0]).toMatchObject({ crop: 'corn', plannedCover: 'rye', expenses: null, knownExpenses: 25600 });
    records.markets.push({ id: 'rye-cost', source: 'Seed and custom drilling quote', kind: 'cover-rate', crop: 'corn', plannedCover: 'rye', value: 25, unit: 'USD/acre' });
    const [first, second, third] = next();
    expect(first.proposed.fields[0].expenses).toBe(27600);
    expect(second.proposed.fields[0]).toMatchObject({ crop: 'soybeans', previousCrop: 'corn', previousCover: 'rye' });
    expect(third.proposed.fields[0]).toMatchObject({ crop: 'corn', plannedCover: 'rye' });
    expect(first.current.fields[0].expenses).toBe(25600);
  });

  it('preserves unknown costs, unidentified records and a zero-base percentage', () => {
    const records = farm();
    for (const f of records.land) f.currentRotation = 'fallow';
    records.markets = records.markets.filter(a => a.kind !== 'operating-rate');
    records.harvests.push({ id: 'bad', crop: 'corn', source: 'Raw import' });
    const first = forecastRevenue({ records, startYear: 2027, horizon: 3 });
    expect(first.issues.join(' ')).toMatch(/bad.*fieldId/);
    const year = first.scenarios.expected.years[0];
    expect(year.current.totals.grossRevenue).toBe(0);
    expect(year.delta.revenueChangePct).toBeNull();
    expect(year.delta.grossRevenue).toEqual(year.proposed.totals.grossRevenue);
    expect(year.proposed.totals.netReturn).toBeNull();
  });

  it('persists corrections and all seven input groups with an older empty farm', async () => {
    const storage = new MemoryStorage();
    const store = new FarmStore(createLocalRepositories(storage));
    await store.load();
    expect(store.getSnapshot().forecastRecords).toEqual(emptyForecastRecords());
    const records = farm();
    await store.saveForecastRows('land', records.land);
    await store.saveForecastRows('payments', records.payments);
    await store.saveFinance({ ...DEFAULT_FINANCE, horizon: 10 });
    const reload = new FarmStore(createLocalRepositories(storage));
    await reload.load();
    expect(reload.getSnapshot().forecastRecords.land).toEqual(records.land);
    expect(reload.getSnapshot().finance.horizon).toBe(10);
    expect(reload.getSnapshot().forecastRecords.payments).toHaveLength(5);
  });
});
