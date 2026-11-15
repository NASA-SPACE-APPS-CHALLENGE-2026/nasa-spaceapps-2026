import { describe, expect, it } from 'vitest';
import { assessEcology, coverTimeline, diversity, expectedYield, nitrogenYears } from '@/lib/domain/ecology';
import { Params } from '@/lib/domain/finance/assumptions';
import { nitrogenRate, seasonBudget, type SeasonPlan } from '@/lib/domain/finance/budget';
import { DEFAULT_FINANCE, parseFinance } from '@/lib/domain/finance/inputs';
import { fieldAcres, fieldSetup } from '@/lib/domain/finance/farm';
import { proposedPlanSeasons } from '@/lib/domain/finance/plans';
import { simulate } from '@/lib/domain/finance/simulate';
import { createField } from '@/lib/domain/field';
import { createLocalRepositories, STORAGE_KEYS } from '@/lib/repo/local';
import { MemoryStorage } from '@/lib/repo/local/storage';
import { acresFromM2 } from '@/lib/domain/acreage';
import { AMES_FIELD, NOW } from './helpers';
import type { Plan } from '@/lib/domain/types';

const P = new Params();
const seasons: SeasonPlan[] = [{ year: 2027, crops: ['corn'] }, { year: 2028, crops: ['soybeans'] }];
const plan = (ss: Plan['seasons']): Plan => ({ id: 'p', fieldId: 'f', name: 'Test', strategyId: 'custom', createdAt: '', updatedAt: '', seasons: ss });
const f = createField({ name: 'Field', geometry: AMES_FIELD, definedBy: 'polygon', id: 'f', now: NOW });

describe('ecological nitrogen accounting', () => {
  it('uses crop-specific application and published grain removal, including negative legume balances', () => {
    const result = nitrogenYears(seasons, { cropInputs: { corn: { nitrogen: 150, yield: 200 }, soybeans: { nitrogen: 5, yield: 60 } } }, P);
    expect(result[0]).toMatchObject({ input: 150, removal: 138, balance: 12 });
    expect(result[1].removal).toBeCloseTo(206.4);
    expect(result[1].balance).toBeCloseTo(-201.4);
    expect(result[1].legumes).toBe(true);
  });
  it('sums double crops without applying corn nitrogen to soybeans', () => {
    const [n] = nitrogenYears([{ year: 2027, crops: ['corn', 'soybeans'] }], { nRateCorn: 170, cropInputs: { corn: { yield: 100 }, soybeans: { yield: 30 } } }, P);
    expect(n.input).toBe(170);
    expect(n.removal).toBeCloseTo(69 + 103.2);
  });
  it('uses only exact removal coefficients and keeps incomplete totals unavailable', () => {
    const [n] = nitrogenYears([{ year: 2027, crops: ['cotton'] }], { cropInputs: { cotton: { nitrogen: 80, yield: 800 } } }, P);
    expect(n.input).toBe(80);
    expect(n.removal).toBeNull();
    expect(n.balance).toBeNull();
    expect(expectedYield('barley', {}, P).value).toBeUndefined();
    expect(nitrogenYears([{ year: 2027, crops: [] }], {}, P)[0].input).toBeNull();
    expect(nitrogenYears([{ year: 2027, crops: ['fallow'] }], {}, P)[0].balance).toBe(0);
  });
  it('shares actual rates with financial budgets and never double-subtracts a legume credit', () => {
    const prev = { year: 2026, crops: ['soybeans'], cover: { id: 'red-clover', name: 'Red clover', legume: true, winterKills: false } };
    const sim = { cropInputs: { corn: { nitrogen: 140, yield: 180 }, soybeans: { nitrogen: 8 } } };
    expect(nitrogenRate('corn', prev, sim, P)).toBe(140);
    expect(nitrogenRate('corn', prev, {}, P)).toBe(159 - P.get('cover.legumeNCredit'));
    const setup = { acres: 1, tenure: 'own' as const, irrigated: false, ...sim };
    expect(seasonBudget(seasons[0], prev, setup, P).nLbs).toBe(140);
    expect(seasonBudget(seasons[1], seasons[0], setup, P).nLbs).toBe(8);
    expect(seasonBudget(seasons[0], prev, setup, P).yields[0].bu).toBe(180);
  });
  it('validates persisted values and preserves real zero applications', () => {
    const parsed = parseFinance({ simulator: { f: { cropInputs: { corn: { nitrogen: -3, yield: Infinity }, soybeans: { nitrogen: 0 } } } } });
    expect(parsed.simulator.f.cropInputs?.corn).toEqual({ nitrogen: undefined, yield: undefined });
    expect(parsed.simulator.f.cropInputs?.soybeans.nitrogen).toBe(0);
  });
});

describe('Planner calendar and diversity', () => {
  it('counts actual month lengths, including leap years, and responds to moved Planner planting', () => {
    const ss = [{ year: 2028, crops: ['corn'] }];
    const mk = (month: number) => plan([{ year: 2028, crop: { kind: 'catalog', id: 'corn' }, tasks: [{ id: 'p', kind: 'plant', month, label: 'Plant corn' }, { id: 'h', kind: 'harvest', month: 10, label: 'Harvest corn' }] }]);
    const a = assessEcology(ss, mk(5), {}, P);
    const b = assessEcology(ss, mk(6), {}, P);
    expect(a.livingDays! - b.livingDays!).toBe(31);
    expect(a.timeline.months.reduce((sum, m) => sum + m.days, 0)).toBe(366);
    expect(a.timeline.months.find((m) => m.month === 2)?.days).toBe(29);
  });
  it('carries cover into the following spring, honors termination and avoids overlapping double counts', () => {
    const ss = [seasons[0], { ...seasons[1], crops: ['corn'] }];
    ss[0] = { ...ss[0], cover: { id: 'cereal-rye', name: 'Cereal rye', legume: false, winterKills: false } };
    const p = plan([{ year: 2027, crop: { kind: 'catalog', id: 'corn' }, tasks: [{ id: 'c', kind: 'cover-plant', month: 10, label: 'Seed rye' }] }, { year: 2028, crop: { kind: 'catalog', id: 'corn' }, tasks: [{ id: 't', kind: 'cover-terminate', month: 3, label: 'End rye' }] }]);
    const { months } = coverTimeline(ss, p, {});
    expect(months.filter((m) => m.year === 2028 && m.month <= 3).every((m) => m.state === 'cover')).toBe(true);
    expect(months.find((m) => m.year === 2028 && m.month === 4)?.state).toBe('gap');
    expect(months).toHaveLength(24);
    expect(months.filter((m) => m.year === 2027 && m.month === 10)).toHaveLength(1);
  });
  it('does not count fall-sown wheat twice in its harvest year or turn residue into bare soil', () => {
    const { months } = coverTimeline([{ year: 2027, crops: ['winter-wheat'] }], undefined, { residue: 'retained' }, 42);
    expect(months.find((m) => m.month === 1)?.state).toBe('cash');
    expect(months.find((m) => m.month === 10)?.state).toBe('residue');
  });
  it('does not fabricate cover for unknown crops, empty Planner seasons or contradictory dates', () => {
    const p = plan([{ year: 2027, crop: null, tasks: [] }, { year: 2028, crop: { kind: 'catalog', id: 'corn' }, tasks: [] }]);
    expect(proposedPlanSeasons(f, p, 3, 2027)[0].crops).toEqual([]);
    expect(assessEcology([{ year: 2027, crops: [] }], p, {}, P).livingDays).toBeNull();
    const invalid = plan([{ year: 2027, crop: { kind: 'catalog', id: 'corn' }, tasks: [{ id: 'p', kind: 'plant', month: 11, label: 'Plant corn' }, { id: 'h', kind: 'harvest', month: 9, label: 'Harvest corn' }] }]);
    expect(assessEcology([seasons[0]], invalid, {}, P).livingDays).toBeNull();
  });
  it('counts types, families, repetitions and covers from the actual sequence', () => {
    const d = diversity([seasons[0], { year: 2028, crops: ['corn', 'soybeans'] }, { year: 2029, crops: ['winter-wheat'], cover: { id: 'red-clover', name: 'Red clover', legume: true, winterKills: false } }]);
    expect(d).toMatchObject({ crops: 3, families: 2, repeated: 1, coverYears: 1 });
  });
  it('tillage and residue change qualitative protection, not invented soil-loss amounts', () => {
    const a = assessEcology(seasons, undefined, { tillage: 'conventional' }, P);
    const b = assessEcology(seasons, undefined, { tillage: 'no-till', residue: 'retained' }, P);
    expect(a.erosion).toBe('Exposure concerns');
    expect(b.erosion).toBe('More protective practices');
    expect(b).not.toHaveProperty('erosionTons');
    expect(b).not.toHaveProperty('organicMatterPercent');
  });
});

describe('branch compatibility and acreage', () => {
  it('uses mapped acreage unless an explicit scenario override is enabled', () => {
    const finance = { ...DEFAULT_FINANCE, fields: { [f.id]: { acres: 31 } } };
    const actual = acresFromM2(f.areaM2);
    expect(fieldAcres(f, finance)).toBe(actual);
    expect(fieldSetup(f, finance, { acres: 31 }).acres).toBe(actual);
    expect(fieldSetup(f, finance, { acres: 31, acreageOverride: true }).acres).toBe(31);
    expect(f.areaM2).toBeGreaterThan(0);
  });
  it('decodes double-crop current rotations in the shared financial workflow', () => {
    const { result } = simulate(f, undefined, DEFAULT_FINANCE, { currentCrops: { [f.crops.current.year + 1]: 'winter-wheat>soybeans' } });
    expect(result.current.seasons[0].crops).toEqual(['winter-wheat', 'soybeans']);
  });
  it('migrates compatible AP assumptions without overwriting original profiles or saved scenarios', async () => {
    const storage = new MemoryStorage();
    const legacy = { fieldId: 'f', landTenure: 'cash-rent', cashRentPerAcre: 230, crops: { corn: { yieldPerAcre: 190, yieldUnit: 'bushel', pricePerUnit: 4.2, totalOperatingCostPerAcre: 600 } } };
    storage.setItem(STORAGE_KEYS.finance, JSON.stringify({ schemaVersion: 1, items: { f: legacy } }));
    storage.setItem('fieldshift.scenarios', 'original-scenarios');
    const repo = createLocalRepositories(storage);
    const modern = await repo.finance.get();
    expect(modern.simulator.f.cropInputs?.corn.yield).toBe(190);
    expect(modern.simulator.f.overrides?.['corn.price']).toBe(4.2);
    expect(modern.fields.f.rentPerAcre).toBe(230);
    await repo.finance.save(modern);
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.finance)!).items.f).toEqual(legacy);
    expect(storage.getItem('fieldshift.scenarios')).toBe('original-scenarios');
    expect((await repo.finance.get()).simulator.f.cropInputs?.corn.yield).toBe(190);
  });
});
