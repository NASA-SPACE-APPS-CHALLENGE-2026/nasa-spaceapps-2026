import { describe, expect, it } from 'vitest';
import {
  applyLedger, prepareLedger, type EquipmentRecord, type LedgerAssumption, type LedgerInput, type LedgerRow,
  type PaymentRecord, type PurchaseRecord,
} from '@/lib/domain/finance/forecastLedger';

const blank = (): LedgerInput => ({ startYear: 2027, harvests: [], payments: [], purchases: [], equipment: [], assumptions: [] });
const row = (fieldId = 'a', production: number | null = 100): LedgerRow =>
  ({ fieldId, crop: 'corn', previousCrop: 'soybeans', plantedAcres: 10, harvestedAcres: 9, production, unit: 'bu' });
const quote = (id: string, kind: LedgerAssumption['kind'], value: number, extra: Partial<LedgerAssumption> = {}): LedgerAssumption =>
  ({ id, source: 'grower budget', crop: 'corn', kind, value, unit: 'bu', ...extra });
const payment = (id: string, kind: PaymentRecord['kind'], amount: number, extra: Partial<PaymentRecord> = {}): PaymentRecord =>
  ({ id, source: 'accounting register', crop: 'corn', season: 2025, kind, amount, ...extra });
const purchase = (id: string, kind: PurchaseRecord['kind'], quantity: number, extra: Partial<PurchaseRecord> = {}): PurchaseRecord =>
  ({ id, source: 'supplier invoice', product: 'UAN', category: 'fertilizer', kind, quantity, unit: 'lb', ...extra });
const compute = (data: Partial<LedgerInput>, rows: LedgerRow[] = [row()], scenario: 'expected' | 'conservative' | 'optimistic' = 'expected') =>
  applyLedger(prepareLedger({ ...blank(), ...data }), rows, 2027, scenario);

describe('farm financial ledger', () => {
  it('weights net sale proceeds by normalized quantity and growing season, segregating cash, non-crop receipts and transfers', () => {
    const sale = payment('sale-a', 'sale', 40, { quantity: 10, unit: 'bu', paymentDate: '2026-01-03' });
    const payments = [
      sale, sale, payment('sale-b', 'sale', 450, { season: 2026, quantity: 5040, unit: 'lb', cashReceived: 300 }),
      payment('gov', 'government', 400), payment('claim', 'insurance', 600), payment('loan', 'financing', 85000),
      payment('wire', 'transfer', 1250), payment('rent', 'rent', 200), payment('pending', 'sale', 2000, { status: 'pending' }),
    ];
    const ledger = prepareLedger({ ...blank(), payments });
    expect(ledger.financials).toMatchObject({ cropSales: 490, cashReceived: 340, receivable: 150, financing: 85000, transfers: 1250, rent: 200 });
    expect(ledger.bySeason['2025'].cropSales).toBe(40);
    expect(ledger.issues.join(' ')).toMatch(/counted once/);
    const expected = compute({ payments })[0];
    expect(expected.pricePerUnit).toBeCloseTo(4.9);
    expect(expected.grossRevenue).toBeCloseTo(490);
    expect(expected.expenses).toBeNull(); expect(expected.netReturn).toBeNull();
    expect(compute({ payments }, [row()], 'conservative')[0].pricePerUnit).toBe(4);
    expect(compute({ payments }, [row()], 'optimistic')[0].pricePerUnit).toBe(5);
  });

  it('uses only actual applications to estimate historical cost per planted acre and leaves unused purchases in inventory', () => {
    const data: LedgerInput = { ...blank(), purchases: [
      purchase('f', 'purchase', 1000, { totalPrice: 300 }), purchase('old', 'opening', 200, { totalPrice: 50 }),
      purchase('app', 'application', 2, { lotId: 'f', fieldId: 'a', crop: 'corn', season: 2026, unit: 'cwt' }),
    ], payments: [
      payment('p', 'supplier-payment', 300, { lotId: 'f' }), payment('l', 'operating', 160, { category: 'labor', fieldId: 'a', season: 2026 }),
      payment('tx', 'tax', 20), payment('interest', 'interest', 100),
    ], harvests: [{ fieldId: 'a', crop: 'corn', plantedAcres: 20, season: 2026 }], assumptions: [
      quote('complete', 'expense-coverage', 1, { fieldId: 'a', season: 2026, unit: 'complete' }),
      quote('price', 'farmer-price', 4.5),
    ] };
    const ledger = prepareLedger(data);
    expect(ledger.inventory[0]).toMatchObject({ purchased: 1000, used: 200, ending: 800, endingValue: 240 });
    expect(ledger.inventory[1]).toMatchObject({ beginning: 200, purchased: 0, ending: 200 });
    expect(ledger.financials.supplierPayments).toBe(300);
    expect(compute(data)[0]).toMatchObject({ grossRevenue: 450, expenses: 110, netReturn: 340, expenseBreakdown: { fertilizer: 30, labor: 80 } });
    const partial = compute({ ...data, assumptions: data.assumptions.filter(a => a.kind !== 'expense-coverage') })[0];
    expect(partial.knownExpenses).toBe(110); expect(partial.netReturn).toBeNull();
  });

  it('fills field contracts first and limits shared contracts to available production using field proportions', () => {
    const payments = [
      payment('local', 'contract', 0, { crop: 'corn', fieldId: 'a', season: 2027, status: 'confirmed', quantity: 50, unit: 'bu', price: 8 }),
      payment('all', 'contract', 0, { crop: 'corn', season: 2027, status: 'confirmed', quantity: 5600, unit: 'lb', price: 6 / 56 }),
      payment('unsigned', 'contract', 0, { season: 2027, quantity: 10000, unit: 'bu', price: 10 }),
    ];
    const data = { payments, assumptions: [quote('price', 'farmer-price', 4), quote('market', 'market-price', 9)] };
    const [a, b] = compute(data, [row('a', 100), row('b', 150)]);
    expect(a.contractedQuantity).toBeCloseTo(75); expect(b.contractedQuantity).toBeCloseTo(75);
    expect(a.grossRevenue! + b.grossRevenue!).toBeCloseTo(50 * 8 + 100 * 6 + 100 * 4);
    const short = compute(data, [row('a', 40)])[0];
    expect(short.grossRevenue).toBe(320); expect(short.issues.join(' ')).toMatch(/short by/);
    expect(compute(data, [row('a', 100), row('b', null)])[0].grossRevenue).toBeNull();
  });

  it('replaces only the fertilizer category with evidenced rotation-specific application rates and traces resulting savings', () => {
    const data = { purchases: [purchase('nitrogen', 'purchase', 5000, { totalPrice: 2500, actualUsage: 2000, crop: 'corn', fieldId: 'a', season: 2026 })],
      harvests: [{ fieldId: 'a', crop: 'corn', plantedAcres: 20, season: 2026 }],
      payments: [payment('workers', 'operating', 200, { season: 2026, fieldId: 'a', category: 'labor' })],
      assumptions: [quote('verified', 'expense-coverage', 1, { unit: 'complete', season: 2026, fieldId: 'a' }),
        quote('rotation-program', 'input-rate', 80, { unit: 'lb', lotId: 'nitrogen', previousCrop: 'soybeans' })],
    };
    const followingSoy = compute(data)[0];
    expect(followingSoy.expenseBreakdown).toEqual({ fertilizer: 400, labor: 100 });
    expect(followingSoy.expenses).toBe(500);
    expect(followingSoy.trace.join(' ')).toContain('fertilizer savings against the historical budget: $100.00');
    expect(compute(data, [{ ...row(), previousCrop: 'corn' }])[0].expenses).toBe(600);
  });

  it('applies regional basis and delivery only to a market quote, selects seasonal rates, and does not look ahead into later sales', () => {
    const assumptions = [quote('market', 'market-price', 5), quote('basis', 'basis', -0.2), quote('delivery', 'delivery', 0.1),
      quote('operating', 'operating-rate', 24, { unit: 'USD/acre' }),
      quote('first', 'operating-rate', 20, { unit: 'USD/acre', season: 2027, previousCrop: 'soybeans' })];
    const ledger = prepareLedger({ ...blank(), assumptions });
    const first = applyLedger(ledger, [row()], 2027, 'expected')[0];
    expect(first.grossRevenue).toBeCloseTo(470); expect(first.expenses).toBe(200); expect(first.netReturn).toBeCloseTo(270);
    expect(applyLedger(ledger, [row()], 2028, 'expected')[0].expenses).toBe(240);
    expect(compute({ assumptions: [...assumptions, quote('grower', 'farmer-price', 6)] })[0].grossRevenue).toBe(600);
    const future = payment('future', 'sale', 800, { season: 2027, quantity: 100, unit: 'bu', status: 'paid' });
    expect(compute({ payments: [future] })[0].grossRevenue).toBeNull();
  });

  it('uses real shared daily capacity and hours, preserves yield, and does not duplicate operating budget lines', () => {
    const equipment: EquipmentRecord[] = [
      { id: 'drill', source: 'tractor monitor', operation: 'plant', widthM: 2, speedKph: 5, hoursPerDay: 4, efficiency: 0.5,
        supportedCrops: ['corn'], operatingCostPerHour: 15, fuelPerHour: 2, fuelPrice: 4, availableDays: 2 },
    ];
    const assumptions = [quote('price', 'farmer-price', 5)];
    const results = compute({ equipment, assumptions }, [row('a'), row('b')]);
    expect(results.map(r => r.grossRevenue)).toEqual([500, 500]);
    expect(results.flatMap(r => r.issues).join(' ')).toMatch(/extra machine-days/);
    expect(results.flatMap(r => r.trace).join(' ')).toMatch(/4.94 ac\/day/);
    expect(results.reduce((a, r) => a + (r.knownExpenses ?? 0), 0)).toBeCloseTo(8 * (15 + 2 * 4));
    const full = compute({ equipment, assumptions: [...assumptions, quote('budget', 'operating-rate', 100, { unit: '$/acre' })] })[0];
    expect(full.expenses).toBe(1000);
  });

  it('reserves a self-reported prior price for missing weighted sales and leaves unsupported price outlooks unavailable', () => {
    const fallback = quote('prior-year', 'historical-price', 6);
    const prior = payment('prior-sale', 'sale', 500, { quantity: 100, unit: 'bu' });
    expect(compute({ assumptions: [fallback] })[0].grossRevenue).toBe(600);
    expect(compute({ assumptions: [fallback], payments: [prior] })[0].grossRevenue).toBe(500);
    expect(compute({ assumptions: [fallback], payments: [prior] }, [row()], 'optimistic')[0].grossRevenue).toBeNull();
    expect(compute({ assumptions: [fallback] }, [row()], 'conservative')[0].grossRevenue).toBeNull();
  });

  it('excludes future inventory usage and post-cutoff sales, even when the crop was grown earlier', () => {
    const ledger = prepareLedger({ ...blank(), purchases: [
      purchase('before', 'purchase', 1000, { date: '2026-10-01', totalPrice: 500 }),
      purchase('later', 'application', 300, { lotId: 'before', date: '2027-04-01', season: 2027 }),
      purchase('future-purchase', 'purchase', 500, { totalPrice: 400, date: '2028-03-20' }),
    ], payments: [payment('late-sale', 'sale', 500, { season: 2026, date: '2028-03-21', quantity: 100, unit: 'bu' })] });
    expect(ledger.inventory).toHaveLength(1);
    expect(ledger.inventory[0].ending).toBe(1000);
    expect(ledger.sales).toHaveLength(0);
  });

  it('reserves a flexible machine for the crop requiring it', () => {
    const equipment: EquipmentRecord[] = [
      { id: 'general', source: 'machine report', operation: 'plant', dailyCapacityAcres: 10, supportedCrops: '*', availableDays: 1 },
      { id: 'corn-only', source: 'machine report', operation: 'plant', dailyCapacityAcres: 10, supportedCrops: 'corn', availableDays: 1 },
    ];
    const res = compute({ equipment }, [row('a'), { ...row('b'), crop: 'soybeans' }]);
    expect(res.flatMap(r => r.issues).join(' ')).not.toMatch(/Shared plant window/);
    expect(res[1].trace.join(' ')).toMatch(/plant with general/);
  });

  it('flags unsatisfied contracts for a crop missing from the rotation', () => {
    const contract = payment('wheat-delivery', 'contract', 0, { season: 2027, crop: 'wheat', quantity: 500, price: 6, unit: 'bu', status: 'confirmed' });
    const res = compute({ payments: [contract], assumptions: [quote('spot', 'market-price', 5)] })[0];
    expect(res.issues.join(' ')).toContain('No wheat production for contract wheat-delivery');
    expect(res.contractedQuantity).toBe(0); expect(res.grossRevenue).toBe(500);
  });

  it('requires evidence for a planned cover cost and includes an applicable cover rate exactly once', () => {
    const planted = { ...row(), plannedCover: 'cereal-rye' };
    const cash = quote('corn-budget', 'operating-rate', 90, { unit: 'USD/acre' });
    const cover = quote('rye-budget', 'cover-rate', 18, { unit: 'USD/acre', plannedCover: 'cereal-rye' });
    expect(compute({ assumptions: [cash] }, [planted])[0]).toMatchObject({ knownExpenses: 900, expenses: null });
    expect(compute({ assumptions: [cash, cover] }, [planted])[0]).toMatchObject({ expenses: 1080, expenseBreakdown: { budget: 900, cover: 180 } });
    expect(compute({ assumptions: [cash, cover] })[0].expenses).toBe(900);
    expect(compute({ assumptions: [{ ...cash, plannedCover: 'cereal-rye' }, cover] }, [planted])[0].expenses).toBe(900);
  });
});
