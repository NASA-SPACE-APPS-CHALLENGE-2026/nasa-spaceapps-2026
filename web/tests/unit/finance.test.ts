import { describe, expect, it } from 'vitest';
import { setSeasonCrop } from '@/lib/domain/cropHistory';
import { createField } from '@/lib/domain/field';
import { analyzeFarm, cashFlow, cropsWithoutBuiltInBudget, partialBudget, PROGRAM_LABELS, projectPlan, type FarmFieldInput } from '@/lib/domain/finance/analysis';
import { ASSUMPTIONS, confidenceOf, Params } from '@/lib/domain/finance/assumptions';
import { COVER_GRAZING, OPERATING_CATS, seasonBudget, type FieldSetup, type SeasonPlan } from '@/lib/domain/finance/budget';
import { coverMonths, currentPlanSeasons, proposedPlanSeasons } from '@/lib/domain/finance/plans';
import { buildParams, COVER_PROGRAMS, DEFAULT_FINANCE, parseFinance, type CoverProgram } from '@/lib/domain/finance/inputs';
import { classifyYears } from '@/lib/domain/finance/weather';
import { simulate } from '@/lib/domain/finance/simulate';
import { farmFieldInputs, fieldSetup, upcomingTasks } from '@/lib/domain/finance/farm';
import { FarmStore } from '@/lib/client/store';
import { createLocalRepositories } from '@/lib/repo/local';
import { MemoryStorage } from '@/lib/repo/local/storage';
import type { Field, Plan } from '@/lib/domain/types';
import { parseMonthly } from '@/lib/sources/weatherHistory';
import { AMES_FIELD, fixture } from './helpers';

const NOW = new Date('2026-11-14T12:00:00Z');
const ISU_RENT: FieldSetup = { acres: 1, tenure: 'cash', rentPerAcre: 274, irrigated: false };
const corn = (year = 2027, cover?: SeasonPlan['cover']): SeasonPlan => ({ year, crops: ['corn'], cover });
const soy = (year = 2027, cover?: SeasonPlan['cover']): SeasonPlan => ({ year, crops: ['soybeans'], cover });
const RYE = { id: 'cereal-rye', name: 'Cereal rye', legume: false, winterKills: false };

function cornSoyField(): Field {
  const f = createField({ name: 'North 40', geometry: AMES_FIELD, definedBy: 'polygon', now: NOW });
  let c = f.crops;
  c = setSeasonCrop(c, 2026, { kind: 'catalog', id: 'corn' });
  c = setSeasonCrop(c, 2025, { kind: 'catalog', id: 'soybeans' });
  c = setSeasonCrop(c, 2024, { kind: 'catalog', id: 'corn' });
  c = setSeasonCrop(c, 2023, { kind: 'catalog', id: 'soybeans' });
  return { ...f, crops: c };
}

describe('crop budgets reproduce the ISU 2026 totals', () => {
  it('corn after soybeans: $911.98 per acre at 211 bu', () => {
    const b = seasonBudget(corn(), soy(2026), ISU_RENT, new Params());
    expect(b.totalCost).toBeCloseTo(911.98, 0);
    expect(b.yields[0].bu).toBe(211);
    expect(b.nLbs).toBe(159);
    expect(b.revenue).toBeCloseTo(211 * 4.6, 6);
  });

  it('corn after corn: $960.02 per acre at 193 bu, with more nitrogen and an insecticide', () => {
    const b = seasonBudget(corn(), corn(2026), ISU_RENT, new Params());
    expect(b.totalCost).toBeCloseTo(960.02, 0);
    expect(b.yields[0].bu).toBe(193);
    expect(b.nLbs).toBe(194);
  });

  it('soybeans after corn: $679.11 per acre at 61 bu', () => {
    const b = seasonBudget(soy(), corn(2026), ISU_RENT, new Params());
    expect(b.totalCost).toBeCloseTo(679.11, 0);
    expect(b.nLbs).toBe(0);
  });

  it('models rice, sorghum and cotton with USDA revenue and owned-land production costs', () => {
    const own: FieldSetup = { acres: 1, tenure: 'own', irrigated: false };
    const P = new Params();
    const rice = seasonBudget({ year: 2027, crops: ['rice'] }, undefined, own, P);
    expect(rice.revenue).toBeCloseTo(76.64 * 15.1, 6);
    expect(rice.totalCost).toBeCloseTo(1236.42, 2);
    expect(rice.nLbs).toBe(130);
    expect(rice.unmodeled).toEqual([]);

    const sorghum = seasonBudget({ year: 2027, crops: ['sorghum'] }, undefined, own, P);
    expect(sorghum.revenue).toBeCloseTo(52.4 * 4.45 + 7.5, 6);
    expect(sorghum.totalCost).toBeCloseTo(405.63, 2);
    expect(sorghum.unmodeled).toEqual([]);

    const cotton = seasonBudget({ year: 2027, crops: ['cotton'] }, undefined, own, P);
    expect(cotton.revenue).toBeCloseTo(775 * 0.76 + 1492 * 0.12, 6);
    expect(cotton.totalCost).toBeCloseTo(873.54, 2);
    expect(cotton.unmodeled).toEqual([]);
  });

  it('applies farmer overrides, share rent, cover crops and their effect on the next corn crop', () => {
    const P = new Params({ 'corn.price': 5 });
    expect(seasonBudget(corn(), soy(2026), ISU_RENT, P).revenue).toBeCloseTo(1055, 6);
    const share = seasonBudget(corn(), soy(2026), { acres: 1, tenure: 'share', sharePct: 50, irrigated: false }, P);
    expect(share.revenue).toBeCloseTo(527.5, 6);
    expect(share.costs.land).toBe(0);
    const withCover = seasonBudget(soy(2027, RYE), corn(2026), ISU_RENT, P);
    expect(withCover.costs.cover).toBeCloseTo(18 + 16.5 + 12, 6);
    const afterRye = seasonBudget(corn(2028), soy(2027, RYE), ISU_RENT, P);
    expect(afterRye.yields[0].bu).toBeCloseTo(211 * 0.98, 1);
    const afterClover = seasonBudget(corn(2028), soy(2027, { id: 'crimson-clover', name: 'Crimson clover', legume: true, winterKills: false }), ISU_RENT, P);
    expect(afterClover.nLbs).toBe(159 - 40);
  });

  it('every assumption has a source, a date and a confidence; farmer values count as high confidence', () => {
    for (const a of ASSUMPTIONS) {
      expect(a.source.name.length).toBeGreaterThan(5);
      expect(a.source.date.length).toBeGreaterThan(2);
    }
    const P = new Params({ 'oats.price': 4 });
    expect(confidenceOf(P, ['oats.price'])).toBe('high');
    expect(confidenceOf(P, ['corn.price'])).toBe('medium');
    expect(confidenceOf(P, ['cover.seed'])).toBe('low');
  });
});

describe('plans: current rotation vs PlotTwist schedule', () => {
  it('carries the corn–soybean rotation forward from this year', () => {
    const f = cornSoyField();
    expect(currentPlanSeasons(f, 3).map((s) => [s.year, s.crops[0]])).toEqual([[2027, 'soybeans'], [2028, 'corn'], [2029, 'soybeans']]);
  });

  it('uses the Planner plan and continues its pattern past its last year', () => {
    const f = cornSoyField();
    const plan: Plan = {
      id: 'p', fieldId: f.id, strategyId: 'cover', name: 'x', createdAt: '', updatedAt: '',
      seasons: [
        { year: 2027, crop: { kind: 'catalog', id: 'soybeans' }, cover: { species: 'cereal-rye', name: 'Cereal rye' }, tasks: [] },
        { year: 2028, crop: { kind: 'catalog', id: 'corn' }, tasks: [] },
      ],
    };
    const p = proposedPlanSeasons(f, plan, 5);
    expect(p.map((s) => s.crops[0])).toEqual(['soybeans', 'corn', 'soybeans', 'corn', 'soybeans']);
    expect(p[0].cover).toMatchObject({ id: 'cereal-rye', legume: false, winterKills: false });
    expect(p[2].cover?.id).toBe('cereal-rye');
    expect(proposedPlanSeasons(f, undefined, 3)).toEqual(currentPlanSeasons(f, 3));
  });

  it('counts months of living cover', () => {
    const plant = (id: string) => (id === 'corn' ? 5 : 5);
    const harvest = (id: string) => (id === 'corn' ? 10 : 9);
    expect(coverMonths(soy(), plant, harvest)).toBe(5);
    expect(coverMonths(soy(2027, RYE), plant, harvest)).toBe(12);
  });
});

describe('whole-farm analysis', () => {
  const weather = classifyYears(parseMonthly(fixture('power-monthly.json')));
  const field = (acres: number): FarmFieldInput => ({
    id: 'a',
    name: 'North 40',
    setup: { acres, tenure: 'cash', irrigated: false },
    thisSeason: corn(2026),
    current: [soy(2027), corn(2028), soy(2029)],
    proposed: [soy(2027, RYE), corn(2028), soy(2029, RYE)],
  });

  it('flags 2012 as a corn stress year from the recorded NASA POWER history', () => {
    expect(weather.years).toHaveLength(40);
    expect(weather.stressYears.corn).toContain(2012);
    expect(weather.stressYears.corn.length).toBeGreaterThan(2);
    expect(weather.stressYears.corn.length).toBeLessThan(20);
  });

  it('adds up: partial budget net, cash flow and headline agree', () => {
    const P = new Params();
    const a = analyzeFarm([field(80)], P, { beginningFarmer: false, weather });
    const sum = (ys: typeof a.current) => ys.reduce((s, y) => s + y.net, 0);
    expect(a.headline.wholeFarm).toBeCloseTo(sum(a.proposed) - sum(a.current), 4);
    expect(a.partial.net).toBeCloseTo(a.headline.wholeFarm, 2);
    expect(a.cash.points[a.cash.points.length - 1].difference).toBeCloseTo(a.headline.wholeFarm, 2);
    expect(a.headline.low).toBeLessThanOrEqual(a.headline.mid);
    expect(a.headline.high).toBeGreaterThanOrEqual(a.headline.mid);
    // Cover crop costs show up as an added cost, EQIP as added revenue, and the corn yield drag as reduced revenue.
    expect(a.partial.addedCosts.map((l) => l.label)).toContain('Cover crop seed, seeding and ending');
    expect(a.partial.addedRevenue.find((l) => /EQIP/.test(l.label))?.amount).toBeCloseTo(74.34 * 80 * 2, 2);
    expect(a.partial.reducedRevenue.map((l) => l.label)).toContain('Corn sales');
    expect(a.savings.costShare).toBeCloseTo(74.34 * 80 * 2, 2);
    expect(a.risk?.years).toBe(40);
    expect(a.risk!.proposed.bad).toBeLessThanOrEqual(a.risk!.proposed.typical);
    expect(a.transparency.find((t) => t.id === 'corn.price')).toMatchObject({ value: 4.6, origin: 'default', confidence: 'medium' });
    expect(a.sensitivity.breakEven.find((b) => b.crop === 'Corn')!.breakEvenPrice).toBeCloseTo(907.98 / 211, 1);
  });

  it('beginning farmers get the higher cost-share rate', () => {
    const a = analyzeFarm([field(10)], new Params(), { beginningFarmer: true });
    expect(a.savings.costShare).toBeCloseTo(89.2 * 10 * 2, 2);
    expect(a.risk).toBeNull();
  });

  it('cash flow finds the break-even season and the deepest dip', () => {
    const mk = (year: number, outs: number[], ins: number[]) => ({ year, acres: 1, revenue: 0, revenueBy: {}, programs: 0, costs: {} as never, operating: 0, land: 0, net: 0, nLbs: 0, coverAcres: 0, flows: { spring: { in: ins[0], out: outs[0] }, summer: { in: ins[1], out: outs[1] }, fall: { in: ins[2], out: outs[2] }, winter: { in: ins[3], out: outs[3] } }, skipped: [], programsBy: {} });
    const cur = [mk(2027, [100, 0, 0, 0], [0, 0, 200, 0]), mk(2028, [100, 0, 0, 0], [0, 0, 200, 0])];
    const pro = [mk(2027, [150, 0, 0, 0], [0, 0, 200, 0]), mk(2028, [100, 0, 0, 0], [0, 0, 260, 0])];
    const c = cashFlow(cur, pro);
    expect(c.deepestDip).toBe(-50);
    expect(c.breakEven).toEqual({ label: 'Fall 2028', year: 2028 });
    expect(partialBudget([], []).net).toBe(0);
  });

  it('leaves a season with no crop out of both plans instead of charging rent for it', () => {
    const y = projectPlan([{ ...field(1), current: [{ year: 2027, crops: [] }] }], 'current', new Params(), { beginningFarmer: false });
    expect(y[0]).toMatchObject({ acres: 0, revenue: 0, net: 0 });
    expect(y[0].costs.land).toBe(0);
    expect(y[0].skipped).toEqual([{ fieldId: 'a', fieldName: 'North 40', year: 2027, reason: 'no-crop', crops: [] }]);
  });
});

describe('a rotation with an unsupported crop (Buckwheat) degrades gracefully', () => {
  // 2023 Millet, 2024 Buckwheat, 2025 Soybeans, 2026 Cotton: the rotation carried forward is Buckwheat → Soybeans → Cotton.
  function buckwheatField(): Field {
    const f = createField({ name: 'Field 1', geometry: AMES_FIELD, definedBy: 'polygon', now: NOW });
    let c = f.crops;
    c = setSeasonCrop(c, 2026, { kind: 'catalog', id: 'cotton' });
    c = setSeasonCrop(c, 2025, { kind: 'catalog', id: 'soybeans' });
    c = setSeasonCrop(c, 2024, { kind: 'catalog', id: 'buckwheat' });
    c = setSeasonCrop(c, 2023, { kind: 'catalog', id: 'millet' });
    return { ...f, crops: c };
  }
  const analyze = (horizon: 3 | 5, overrides: Record<string, number> = {}, plan?: Plan) => {
    const finance = { ...DEFAULT_FINANCE, horizon, overrides };
    return analyzeFarm(farmFieldInputs([buckwheatField()], plan ? [plan] : [], finance), buildParams(finance), { beginningFarmer: false });
  };

  it('5-year horizon: skips Buckwheat in 2027 and 2030 and shows the other three seasons', () => {
    const a = analyze(5);
    expect(a.years).toEqual([2027, 2028, 2029, 2030, 2031]);
    expect(a.budgetedYears).toEqual([2028, 2029, 2031]);
    expect(a.skipped.map((s) => [s.year, s.fieldName, s.reason, s.crops])).toEqual([
      [2027, 'Field 1', 'no-budget', ['buckwheat']],
      [2030, 'Field 1', 'no-budget', ['buckwheat']],
    ]);
    expect(a.needsBudget).toEqual(['buckwheat']);
    for (const i of [0, 3]) {
      // Never rent or a placeholder: nothing at all is counted for the skipped seasons.
      for (const y of [a.current[i], a.proposed[i]]) expect(y).toMatchObject({ acres: 0, revenue: 0, operating: 0, land: 0, net: 0 });
    }
    for (const i of [1, 2, 4]) expect(a.current[i].acres).toBeGreaterThan(0);
    // The headline averages only the budgeted seasons (no plan, so both sides match).
    expect(a.headline.mid).toBeCloseTo(0, 6);
    const cotton = a.current[2];
    expect(cotton.revenueBy.Cotton).toBeGreaterThan(0);
  });

  it('3-year horizon: only 2027 is skipped', () => {
    const a = analyze(3);
    expect(a.years).toEqual([2027, 2028, 2029]);
    expect(a.budgetedYears).toEqual([2028, 2029]);
    expect(a.skipped.map((s) => s.year)).toEqual([2027]);
  });

  it('skips a season in both plans when only one side has no budget', () => {
    const field = buckwheatField();
    const plan: Plan = {
      id: 'p1',
      fieldId: field.id,
      strategyId: 'custom',
      name: 'Corn first',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      seasons: [2027, 2028, 2029].map((year) => ({ year, crop: { kind: 'catalog' as const, id: year === 2028 ? 'soybeans' : year === 2029 ? 'cotton' : 'corn' }, tasks: [] })),
    };
    const finance = { ...DEFAULT_FINANCE, horizon: 3 as const };
    const fields = farmFieldInputs([field], [plan], finance);
    expect(fields[0].proposed[0].crops).toEqual(['corn']);
    const a = analyzeFarm(fields, buildParams(finance), { beginningFarmer: false });
    // Corn in the plan would otherwise be compared against nothing in 2027.
    expect(a.proposed[0]).toMatchObject({ acres: 0, net: 0 });
    expect(a.current[0]).toMatchObject({ acres: 0, net: 0 });
    expect(a.headline.wholeFarm).toBeCloseTo(0, 6);
    expect(a.partial.addedRevenue.find((l) => l.label === 'Corn sales')).toBeUndefined();
  });

  it('counts Buckwheat once the farmer enters their own numbers', () => {
    const a = analyze(5, { 'own.buckwheat.yield': 30, 'own.buckwheat.price': 12, 'own.buckwheat.cost': 250 });
    expect(a.skipped).toEqual([]);
    expect(a.budgetedYears).toHaveLength(5);
    expect(a.current[0].revenueBy.Buckwheat).toBeCloseTo(360 * a.current[0].acres, 6);
  });
});

describe('crops without a published budget', () => {
  const alfalfaField: FarmFieldInput = {
    id: 'a',
    name: 'North 40',
    setup: { acres: 10, tenure: 'own', irrigated: false },
    thisSeason: corn(2026),
    current: [soy(2027), { year: 2028, crops: ['alfalfa'] }, { year: 2029, crops: [] }],
    proposed: [soy(2027), corn(2028), soy(2029)],
  };
  const ALFALFA = { 'own.alfalfa.yield': 4, 'own.alfalfa.price': 200, 'own.alfalfa.cost': 350 };

  it('separates crops that need the farmer’s budget from seasons with no crop', () => {
    const a = analyzeFarm([alfalfaField], new Params(), { beginningFarmer: false });
    expect(a.needsBudget).toEqual(['alfalfa']);
    expect(a.missingSeasons).toEqual(['North 40, 2029']);
    expect(a.unmodeled).toEqual(['North 40, 2029: crop not entered', 'North 40, 2028: Alfalfa']);
    expect(cropsWithoutBuiltInBudget([alfalfaField])).toEqual(['alfalfa']);
  });

  it('prices the crop from the farmer’s yield, price and cost once all three are entered', () => {
    expect(seasonBudget({ year: 2028, crops: ['alfalfa'] }, undefined, ISU_RENT, buildParams({ ...DEFAULT_FINANCE, overrides: { 'own.alfalfa.yield': 4 } })).unmodeled).toEqual(['Alfalfa']);
    const P = buildParams({ ...DEFAULT_FINANCE, overrides: ALFALFA });
    const b = seasonBudget({ year: 2028, crops: ['alfalfa'] }, undefined, { acres: 1, tenure: 'own', irrigated: false }, P);
    expect(b.unmodeled).toEqual([]);
    expect(b.revenue).toBe(800);
    expect(b.totalCost).toBeCloseTo(350, 6);
    expect(b.costs.own).toBeCloseTo(350, 6);
    expect(b.yields[0]).toMatchObject({ crop: 'alfalfa', bu: 4, price: 200, unit: 'unit' });
  });

  it('completes the farm analysis and reports the farmer’s numbers in the assumptions', () => {
    const P = buildParams({ ...DEFAULT_FINANCE, overrides: ALFALFA });
    const a = analyzeFarm([{ ...alfalfaField, current: [soy(2027), { year: 2028, crops: ['alfalfa'] }, soy(2029)] }], P, { beginningFarmer: false });
    expect(a.unmodeled).toEqual([]);
    expect(a.needsBudget).toEqual([]);
    expect(a.current[1].revenueBy.Alfalfa).toBeCloseTo(8000, 6);
    expect(a.transparency.find((t) => t.id === 'own.alfalfa.price')).toMatchObject({ label: 'Alfalfa price', value: 200, origin: 'farmer', confidence: 'high' });
    expect(a.sensitivity.breakEven.find((b) => b.crop === 'Alfalfa')).toMatchObject({ breakEvenPrice: 87.5, unit: 'unit' });
    // Price scenarios move the farmer's own prices too.
    const down = a.sensitivity.rows.find((r) => r.label === 'Crop prices −20%')!;
    const base = a.sensitivity.rows.find((r) => r.label === 'As entered')!;
    expect(base.current - down.current).toBeGreaterThan(0);
  });

  it('treats a crop the farmer typed in as a crop, not an empty season', () => {
    const f = createField({ name: 'Back 20', geometry: AMES_FIELD, definedBy: 'polygon', now: NOW });
    let c = f.crops;
    c = setSeasonCrop(c, 2026, { kind: 'other', text: 'Hemp' });
    c = setSeasonCrop(c, 2025, { kind: 'catalog', id: 'corn' });
    const seasons = currentPlanSeasons({ ...f, crops: c }, 3);
    expect(seasons.map((s) => s.crops)).toEqual([['corn'], ['other:Hemp'], ['corn']]);
    const P = buildParams({ ...DEFAULT_FINANCE, overrides: { 'own.other:Hemp.yield': 1000, 'own.other:Hemp.price': 0.5, 'own.other:Hemp.cost': 300 } });
    const b = seasonBudget(seasons[1], seasons[0], { acres: 1, tenure: 'own', irrigated: false }, P);
    expect(b.revenueBy.Hemp).toBe(500);
    expect(b.unmodeled).toEqual([]);
  });
});

describe('finance inputs (layer 5)', () => {
  it('treats land as fully owned unless rent is explicitly selected', () => {
    const f = cornSoyField();
    expect(fieldSetup(f, DEFAULT_FINANCE).tenure).toBe('own');
    expect(fieldSetup(f, { ...DEFAULT_FINANCE, fields: { [f.id]: { tenure: 'cash' } } }).tenure).toBe('cash');
    const owned = seasonBudget(corn(), soy(2026), fieldSetup(f, DEFAULT_FINANCE), new Params());
    expect(owned.costs.land).toBe(0);
    expect(owned.net).toBeCloseTo(211 * 4.6 - (911.98 - 274), 0);
  });

  it('derive prices from last year and supplier quotes, but direct entries win', () => {
    const inputs = { ...DEFAULT_FINANCE, overrides: { 'soybeans.yield': 58 }, lastYear: { crops: { corn: { yield: 200 }, soybeans: { yield: 65 } } }, suppliers: { cornSeedPerBag: 300, anhydrousPerTon: 820 } };
    const P = buildParams(inputs);
    expect(P.get('corn.yield')).toBe(200);
    expect(P.get('soybeans.yield')).toBe(58);
    expect(P.get('corn.seed')).toBeCloseTo(112.5, 6);
    expect(P.get('n.price')).toBeCloseTo(0.5, 6);
    expect(P.resolve('corn.yield').origin).toBe('farmer');
    expect(P.resolve('corn.price').origin).toBe('default');
  });

  it('persist in their own storage key and survive bad data', async () => {
    const storage = new MemoryStorage();
    const api = { fetchSource: async () => ({}) as never, fetchCdl: async () => ({ status: 'ok', years: [] }) as never };
    const store = new FarmStore(createLocalRepositories(storage), api, () => NOW);
    await store.load();
    await store.saveFinance({ ...store.getSnapshot().finance, horizon: 3, beginningFarmer: true, overrides: { 'corn.price': 4.25 } });
    const again = new FarmStore(createLocalRepositories(storage), api, () => NOW);
    await again.load();
    expect(again.getSnapshot().finance).toMatchObject({ horizon: 3, beginningFarmer: true, overrides: { 'corn.price': 4.25 } });
    expect(parseFinance({ horizon: 7, overrides: { x: 'y' }, beginningFarmer: 'yes' })).toMatchObject({ horizon: 5, overrides: {}, beginningFarmer: false });
  });
});

describe('Scenario Simulator', () => {
  const plan = (f: Field): Plan => ({
    id: 'p', fieldId: f.id, strategyId: 'cover', name: 'Cover crop plan', createdAt: '', updatedAt: '',
    seasons: [
      { year: 2027, crop: { kind: 'catalog', id: 'soybeans' }, cover: { species: 'cereal-rye', name: 'Cereal rye' }, tasks: [] },
      { year: 2028, crop: { kind: 'catalog', id: 'corn' }, cover: { species: 'cereal-rye', name: 'Cereal rye' }, tasks: [] },
    ],
  });

  it('compares the plan with the current rotation and lists pros and cons', () => {
    const f = cornSoyField();
    const { result } = simulate(f, plan(f), DEFAULT_FINANCE, { acres: 100 }, { lat: 42, slopePct: 4 });
    expect(result.acres).toBe(100);
    expect(result.startYear).toBe(2027);
    expect(result.proposed.coverMonths).toBeGreaterThan(result.current.coverMonths);
    expect(result.pros.some((t) => /more months a year/.test(t))).toBe(true);
    expect(result.cons.some((t) => /seeding pass/.test(t))).toBe(true);
    expect(['Low', 'Moderate', 'High']).toContain(result.proposed.erosion);
  });

  it('a dry-summer scenario cuts corn and soybean yields; not planted yet starts the plan this season', () => {
    const f = cornSoyField();
    const normal = simulate(f, plan(f), DEFAULT_FINANCE, {}, { lat: 42 }).result;
    const dry = simulate(f, plan(f), DEFAULT_FINANCE, { scenario: 'dry' }, { lat: 42 }).result;
    expect(dry.current.netPerAcre).toBeLessThan(normal.current.netPerAcre);
    expect(dry.current.yields.find((y) => y.crop === 'Corn')!.bu).toBe(Math.round(211 * 0.8));
    const early = simulate(f, plan(f), DEFAULT_FINANCE, { stage: 'pre-plant' }, { lat: 42 }).result;
    expect(early.startYear).toBe(2026);
    expect(early.current.seasons[0]).toMatchObject({ year: 2026, crops: ['corn'] });
  });

  it('lists the next two months of Planner tasks on the Overview', () => {
    const f = cornSoyField();
    const p = { ...plan(f), seasons: [{ ...plan(f).seasons[0], year: 2026, tasks: [{ id: 't1', month: 12, kind: 'note' as const, label: 'Order seed' }, { id: 't2', month: 6, kind: 'plant' as const, label: 'Later' }] }] };
    const up = upcomingTasks([f], [p], new Date('2026-11-15T12:00:00'));
    expect(up.map((u) => u.task.label)).toEqual(['Order seed']);
  });
});

describe('net return follows the full formula (programs, insurance discount, grazing)', () => {
  // Plan adds cereal rye after the 2027 and 2029 soybeans; the current rotation has no cover crops.
  const field = (acres: number, current: SeasonPlan[] = [soy(2027), corn(2028), soy(2029)]): FarmFieldInput => ({
    id: 'a',
    name: 'North 40',
    setup: { acres, tenure: 'own', irrigated: false },
    thisSeason: corn(2026),
    current,
    proposed: [soy(2027, RYE), corn(2028), soy(2029, RYE)],
  });
  const run = (f: FarmFieldInput, coverProgram?: CoverProgram, overrides: Record<string, number> = {}) =>
    analyzeFarm([f], buildParams({ ...DEFAULT_FINANCE, overrides }), { beginningFarmer: false, coverProgram });
  const prog = (y: { programsBy: Record<string, number> }, label: string) => y.programsBy[label] ?? 0;

  it('every year adds up: revenue + programs − operating costs − land = net', () => {
    for (const p of COVER_PROGRAMS) {
      const a = run(field(200), p, { 'csp.annual': 4000, 'cover.grazing': 25 });
      for (const y of [...a.current, ...a.proposed]) {
        const sum = (r: Record<string, number>) => Object.values(r).reduce((s, v) => s + v, 0);
        expect(sum(y.revenueBy)).toBeCloseTo(y.revenue, 6);
        expect(sum(y.programsBy)).toBeCloseTo(y.programs, 6);
        expect(y.revenue + y.programs - OPERATING_CATS.reduce((s, c) => s + y.costs[c], 0) - y.land).toBeCloseTo(y.net, 6);
      }
    }
  });

  it('EQIP stays the default and is unchanged; "none" counts no program money', () => {
    const byDefault = run(field(80));
    expect(byDefault.proposed.map((y) => prog(y, PROGRAM_LABELS.eqip))).toEqual(run(field(80), 'eqip').proposed.map((y) => prog(y, PROGRAM_LABELS.eqip)));
    expect(byDefault.savings.costShare).toBeCloseTo(74.34 * 80 * 2, 2);
    const none = run(field(80), 'none');
    expect([...none.current, ...none.proposed].every((y) => y.programs === 0)).toBe(true);
  });

  it('Iowa cost share: first-time rate in the first cover year, returning rate after, capped at 160 acres', () => {
    const a = run(field(200), 'state');
    expect(a.proposed.map((y) => prog(y, PROGRAM_LABELS.state))).toEqual([30 * 160, 0, 20 * 160]);
    expect(a.current.every((y) => y.programs === 0)).toBe(true);
    expect(a.proposed.some((y) => prog(y, PROGRAM_LABELS.eqip) > 0)).toBe(false);
    // A farm that already grows cover crops is a returning user, in both columns.
    const returning = run(field(100, [soy(2027, RYE), corn(2028), soy(2029)]), 'state');
    expect(returning.current.map((y) => prog(y, PROGRAM_LABELS.state))).toEqual([2000, 0, 0]);
    expect(returning.proposed.map((y) => prog(y, PROGRAM_LABELS.state))).toEqual([2000, 0, 2000]);
  });

  it('insurance discount: $5/ac off the premium the year after a fall cover crop, and no cost share', () => {
    const a = run(field(80), 'insurance');
    // 2027 rye → 2028 discount; 2029 rye's discount falls in 2030, past the horizon.
    expect(a.proposed.map((y) => prog(y, PROGRAM_LABELS.insurance))).toEqual([0, 400, 0]);
    expect(a.proposed[1].flows.summer.in).toBeGreaterThanOrEqual(400);
    expect(a.proposed.some((y) => prog(y, PROGRAM_LABELS.eqip) > 0)).toBe(false);
    expect(a.partial.addedRevenue.find((l) => l.label === PROGRAM_LABELS.insurance)?.amount).toBeCloseTo(400, 6);
  });

  it('CSP: the farmer’s yearly payment, with the plan only, for the contract years entered', () => {
    const a = run(field(80), 'eqip', { 'csp.annual': 4000 });
    expect(a.proposed.map((y) => prog(y, PROGRAM_LABELS.csp))).toEqual([4000, 4000, 4000]);
    expect(a.current.every((y) => prog(y, PROGRAM_LABELS.csp) === 0)).toBe(true);
    expect(a.partial.addedRevenue.find((l) => l.label === PROGRAM_LABELS.csp)?.amount).toBeCloseTo(12000, 6);
    const short = run(field(80), 'eqip', { 'csp.annual': 4000, 'csp.years': 2 });
    expect(short.proposed.map((y) => prog(y, PROGRAM_LABELS.csp))).toEqual([4000, 4000, 0]);
    expect(run(field(80)).proposed.every((y) => prog(y, PROGRAM_LABELS.csp) === 0)).toBe(true);
  });

  it('cover crop grazing counts only when entered, and only on cover crop seasons', () => {
    const a = run(field(80), 'eqip', { 'cover.grazing': 25 });
    expect(a.proposed.map((y) => y.revenueBy[COVER_GRAZING] ?? 0)).toEqual([2000, 0, 2000]);
    const plain = run(field(80));
    expect(plain.proposed.every((y) => !(COVER_GRAZING in y.revenueBy))).toBe(true);
    expect(plain.transparency.find((t) => t.id === 'cover.grazing' || t.id.startsWith('csp.'))).toBeUndefined();
  });

  it('reads an unknown stored program as EQIP', () => {
    expect(parseFinance({ coverProgram: 'bogus' }).coverProgram).toBe('eqip');
    expect(parseFinance({}).coverProgram).toBe('eqip');
    expect(parseFinance({ coverProgram: 'insurance' }).coverProgram).toBe('insurance');
  });
});
