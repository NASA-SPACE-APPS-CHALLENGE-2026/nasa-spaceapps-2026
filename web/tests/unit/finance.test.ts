import { describe, expect, it } from 'vitest';
import {
  breakEvenPriceChangePct,
  emptyFinancialProfile,
  partialBudget,
  projectFinancials,
  type FinancialSeason,
} from '@/lib/domain/finance';
import { createField } from '@/lib/domain/field';
import { FarmStore } from '@/lib/client/store';
import { createLocalRepositories, STORAGE_KEYS } from '@/lib/repo/local';
import { MemoryStorage } from '@/lib/repo/local/storage';
import { AMES_FIELD } from './helpers';

const seasons: FinancialSeason[] = [
  { year: 2027, cropIds: ['corn'], hasCover: false },
  { year: 2028, cropIds: ['soybeans'], hasCover: false },
  { year: 2029, cropIds: ['corn'], hasCover: false },
];

function profile() {
  const value = emptyFinancialProfile('north-40', new Date('2026-01-01T00:00:00.000Z'));
  value.landTenure = 'owned';
  value.crops = {
    corn: { yieldPerAcre: 180, yieldUnit: 'bushel', pricePerUnit: 4, costMode: 'total', totalOperatingCostPerAcre: 350, costsPerAcre: {} },
    soybeans: { yieldPerAcre: 50, yieldUnit: 'bushel', pricePerUnit: 10, costMode: 'total', totalOperatingCostPerAcre: 300, costsPerAcre: {} },
  };
  return value;
}

describe('financial projections', () => {
  it('calculates crop revenue and costs at field scale from entered assumptions', () => {
    const projection = projectFinancials({ profile: profile(), acres: 40, seasons, horizon: 3 });
    expect(projection.complete).toBe(true);
    expect(projection.years[0]).toMatchObject({ revenue: 28_800, costs: 14_000, netReturn: 14_800 });
    expect(projection.cumulativeNetReturn).toBe(37_600);
  });

  it('keeps unsupplied yield, price, rent, and schedule values incomplete', () => {
    const assumptions = emptyFinancialProfile('north-40', new Date('2026-01-01T00:00:00.000Z'));
    assumptions.crops.corn = { costMode: 'total', costsPerAcre: {} };
    const projection = projectFinancials({ profile: assumptions, acres: 40, seasons: seasons.slice(0, 1), horizon: 3 });
    expect(projection.complete).toBe(false);
    expect(projection.years[0].revenue).toBeNull();
    expect(projection.years[0].netReturn).toBeNull();
    expect(projection.missingInputs).toContain('land: choose owned, cash-rented, or share-rented');
    expect(projection.missingInputs).toContain('corn: yield per acre');
    expect(projection.missingInputs).toContain('corn: price per unit');
    expect(projection.missingInputs).toContain('corn: operating cost per acre');
    expect(projection.years[1].seasonMissing).toBe(true);
  });

  it('includes explicit cover and one-time transition costs in the alternative', () => {
    const assumptions = profile();
    assumptions.coverCostPerAcre = 25;
    assumptions.transitionCostPerAcre = 40;
    const alternative = projectFinancials({
      profile: assumptions,
      acres: 40,
      seasons: [{ ...seasons[0], hasCover: true }, ...seasons.slice(1)],
      horizon: 3,
      alternative: true,
    });
    expect(alternative.years[0].costs).toBe(16_600);
    expect(alternative.years[0].costBreakdown.cover).toBe(1_000);
    expect(alternative.years[0].costBreakdown.transition).toBe(1_600);
    expect(alternative.years[0].netReturn).toBe(12_200);
  });

  it('applies transparent sensitivity changes without changing saved assumptions', () => {
    const assumptions = profile();
    const changed = projectFinancials({
      profile: assumptions,
      acres: 40,
      seasons,
      horizon: 3,
      adjustments: { yieldPct: -10, pricePct: 5, costPct: 10, environmentalYieldPctByCrop: {} },
    });
    expect(changed.years[0].revenue).toBe(27_216);
    expect(changed.years[0].costs).toBe(15_400);
    expect(assumptions.crops.corn.yieldPerAcre).toBe(180);
  });

  it('requires every detailed expense category, while accepting an explicit zero', () => {
    const assumptions = profile();
    assumptions.crops.corn = {
      yieldPerAcre: 180,
      yieldUnit: 'bushel',
      pricePerUnit: 4,
      costMode: 'detailed',
      costsPerAcre: { seed: 0 },
    };
    const projection = projectFinancials({ profile: assumptions, acres: 40, seasons: [seasons[0]], horizon: 3 });
    expect(projection.years[0].costs).toBeNull();
    expect(projection.missingInputs).toContain('corn: operating cost per acre');
  });

  it('keeps unsupported planner crops and missing crop rows out of projected totals', () => {
    const projection = projectFinancials({
      profile: profile(),
      acres: 40,
      seasons: [{ year: 2027, cropIds: [], hasCover: false, unknownCropLabels: ['Free-text crop'] }],
      horizon: 3,
    });
    expect(projection.years[0].netReturn).toBeNull();
    expect(projection.missingInputs).toContain('Free-text crop: choose a supported crop in the Planner before projecting');
  });

  it('splits first-year changes into mutually exclusive partial-budget lines', () => {
    const current = projectFinancials({ profile: profile(), acres: 40, seasons, horizon: 3 });
    const proposedProfile = profile();
    proposedProfile.crops.corn.pricePerUnit = 5;
    const proposed = projectFinancials({ profile: proposedProfile, acres: 40, seasons, horizon: 3 });
    const budget = partialBudget(current.years[0], proposed.years[0]);
    expect(budget).toEqual({ addedRevenue: 7_200, reducedCosts: 0, addedCosts: 0, reducedRevenue: 0, netChange: 7_200 });
    expect(breakEvenPriceChangePct(current, proposed)).toBeCloseTo(-15.6522, 3);
  });

  it('persists assumptions per field and removes them with the field', async () => {
    const storage = new MemoryStorage();
    const api = {
      fetchSource: async () => ({ sourceId: 'power', sourceName: '', docsUrl: '', status: 'ok', values: [] }) as never,
      fetchCdl: async () => ({ status: 'ok', years: [] }) as never,
    };
    const store = new FarmStore(createLocalRepositories(storage), api);
    await store.load();
    await store.setSettings({ externalLookups: false });
    const field = createField({ name: 'North 40', geometry: AMES_FIELD, definedBy: 'polygon', now: new Date('2026-01-01T00:00:00.000Z') });
    await store.addFields([field]);
    const saved = profile();
    saved.fieldId = field.id;
    await store.saveFinancialProfile(saved);
    expect(storage.getItem(STORAGE_KEYS.finance)).toContain(field.id);

    const restored = new FarmStore(createLocalRepositories(storage), api);
    await restored.load();
    expect(restored.getSnapshot().financialProfiles[field.id].crops.corn.yieldPerAcre).toBe(180);
    await restored.deleteField(field.id);
    expect(restored.getSnapshot().financialProfiles[field.id]).toBeUndefined();
    expect(storage.getItem(STORAGE_KEYS.finance)).not.toContain(field.id);
  });
});
