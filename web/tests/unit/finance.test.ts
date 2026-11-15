import { describe, expect, it } from 'vitest';
import { setSeasonCrop } from '@/lib/domain/cropHistory';
import { createField } from '@/lib/domain/field';
import { analyzeFarm, cashFlow, partialBudget, projectPlan, type FarmFieldInput } from '@/lib/domain/finance/analysis';
import { ASSUMPTIONS, confidenceOf, Params } from '@/lib/domain/finance/assumptions';
import { seasonBudget, type FieldSetup, type SeasonPlan } from '@/lib/domain/finance/budget';
import { coverMonths, currentPlanSeasons, proposedPlanSeasons } from '@/lib/domain/finance/plans';
import { buildParams, DEFAULT_FINANCE, parseFinance } from '@/lib/domain/finance/inputs';
import { classifyYears } from '@/lib/domain/finance/weather';
import { simulate } from '@/lib/domain/finance/simulate';
import { upcomingTasks } from '@/lib/domain/finance/farm';
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
    const mk = (year: number, outs: number[], ins: number[]) => ({ year, acres: 1, revenue: 0, revenueBy: {}, programs: 0, costs: {} as never, operating: 0, land: 0, net: 0, nLbs: 0, coverAcres: 0, flows: { spring: { in: ins[0], out: outs[0] }, summer: { in: ins[1], out: outs[1] }, fall: { in: ins[2], out: outs[2] }, winter: { in: ins[3], out: outs[3] } } });
    const cur = [mk(2027, [100, 0, 0, 0], [0, 0, 200, 0]), mk(2028, [100, 0, 0, 0], [0, 0, 200, 0])];
    const pro = [mk(2027, [150, 0, 0, 0], [0, 0, 200, 0]), mk(2028, [100, 0, 0, 0], [0, 0, 260, 0])];
    const c = cashFlow(cur, pro);
    expect(c.deepestDip).toBe(-50);
    expect(c.breakEven).toEqual({ label: 'Fall 2028', year: 2028 });
    expect(partialBudget([], []).net).toBe(0);
  });

  it('projects a field with no crop as zero revenue and no costs except rent', () => {
    const y = projectPlan([{ ...field(1), current: [{ year: 2027, crops: [] }] }], 'current', new Params(), { beginningFarmer: false });
    expect(y[0].revenue).toBe(0);
    expect(y[0].net).toBeCloseTo(-270, 6);
  });
});

describe('finance inputs (layer 5)', () => {
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

  it('compares the saved plan with the current rotation using the shared financial budget', () => {
    const f = cornSoyField();
    const { result } = simulate(f, plan(f), DEFAULT_FINANCE, { acres: 100, acreageOverride: true });
    expect(result.acres).toBe(100);
    expect(result.startYear).toBe(2027);
    expect(result.proposed.seasons[0].cover?.id).toBe('cereal-rye');
    expect(result.proposed.years).toHaveLength(5);
    expect(result.cash.points.at(-1)?.difference).toBeCloseTo(result.proposed.totalProfit - result.current.totalProfit, 4);
  });

  it('a dry-summer scenario cuts corn and soybean yields; not planted yet starts the plan this season', () => {
    const f = cornSoyField();
    const normal = simulate(f, plan(f), DEFAULT_FINANCE, {}).result;
    const dry = simulate(f, plan(f), DEFAULT_FINANCE, { scenario: 'dry' }).result;
    expect(dry.current.netPerAcre).toBeLessThan(normal.current.netPerAcre);
    expect(dry.proposed.netPerAcre).toBeLessThan(normal.proposed.netPerAcre);
    const early = simulate(f, plan(f), DEFAULT_FINANCE, { stage: 'pre-plant' }).result;
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
