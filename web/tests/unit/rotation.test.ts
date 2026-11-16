import { describe, expect, it } from 'vitest';
import { setSeasonCrop } from '@/lib/domain/cropHistory';
import { createField } from '@/lib/domain/field';
import { answersOf, toManagementRecord, type RotationAnswers } from '@/lib/domain/management';
import { fallGdd40 } from '@/lib/domain/rotation/agronomy';
import { CITATIONS } from '@/lib/domain/rotation/citations';
import { pickCover, suggestCovers } from '@/lib/domain/rotation/coverCrops';
import { buildInputs } from '@/lib/domain/rotation/inputs';
import { scoreRotation, type RotationResult } from '@/lib/domain/rotation/score';
import { buildStrategies, detectCycle } from '@/lib/domain/rotation/strategies';
import type { ClimateNormals, CropRef, Field, FieldProfile } from '@/lib/domain/types';
import { climateNormals, parseClimatology } from '@/lib/sources/power';
import { AMES_FIELD, fixture } from './helpers';

const C = (id: string): CropRef => ({ kind: 'catalog', id });
const AMES: ClimateNormals = climateNormals(parseClimatology(JSON.parse(fixture('power-climatology.json'))));

/** A field near Ames with crops from this season backwards (2026, 2025, …). */
function fieldWith(crops: string[]): Field {
  let f = createField({ name: 'Test field', geometry: AMES_FIELD, definedBy: 'polygon', now: new Date('2026-11-14T00:00:00Z') });
  let c = f.crops;
  crops.forEach((id, i) => (c = setSeasonCrop(c, 2026 - i, C(id))));
  f = { ...f, crops: c };
  return f;
}

function profileFor(f: Field, climate: ClimateNormals | null = AMES, extra: Partial<FieldProfile['sources']> = {}): FieldProfile {
  return {
    fieldId: f.id,
    geometryHash: f.geometryHash,
    sources: {
      ...(climate ? { power: { sourceId: 'power', sourceName: 'NASA POWER', docsUrl: '', status: 'ok', values: [], climate } } : {}),
      ...extra,
    },
  };
}

const score = (f: Field, answers: RotationAnswers = {}, profile: FieldProfile | undefined = profileFor(f)): RotationResult => scoreRotation(buildInputs(f, profile, answers));
const bar = (r: RotationResult, strategy: string, id: string) => r.strategies.find((s) => s.strategy.id === strategy)!.bars.find((b) => b.id === id)!;

const FULL: RotationAnswers = { tillage: 'no-till', irrigation: 'none', coverExperience: 'sometimes', livestock: 'no', smallGrainEquipment: 'yes', smallGrainMarket: 'yes', problems: ['rootworm', 'scn'], harvestMonth: 10 };

describe('rotation pattern and strategies', () => {
  it('detects the shortest repeating pattern', () => {
    expect(detectCycle([['corn'], ['soybeans'], ['corn'], ['soybeans']])).toEqual([['corn'], ['soybeans']]);
    expect(detectCycle([['corn'], ['corn'], ['corn']])).toEqual([['corn']]);
    expect(detectCycle([['corn'], ['soybeans'], ['oats'], ['corn'], ['soybeans'], ['oats']])).toEqual([['corn'], ['soybeans'], ['oats']]);
  });

  it('builds keep / cover / small grains from a corn–soybean history', () => {
    const set = buildStrategies(buildInputs(fieldWith(['soybeans', 'corn', 'soybeans', 'corn']), profileFor(fieldWith([])), {}));
    const [keep, cover, sg] = set.strategies;
    expect(keep.seasons.map((s) => s.ids[0])).toEqual(['corn', 'soybeans', 'corn']);
    expect(cover.seasons.map((s) => s.ids[0])).toEqual(['corn', 'soybeans', 'corn']);
    expect(cover.seasons.every((s) => s.cover)).toBe(true);
    // After soybeans this fall it is too late for winter wheat, so spring oats come first, with red clover.
    expect(sg.seasons.map((s) => s.ids[0])).toEqual(['oats', 'corn', 'soybeans']);
    expect(sg.seasons[0].cover?.pick.species.id).toBe('red-clover');
    expect(sg.smallGrain).toBe('oats');
  });

  it('asks for this season’s crop when it is missing', () => {
    const f = createField({ name: 'Empty', geometry: AMES_FIELD, definedBy: 'polygon' });
    const r = score(f);
    expect(r.problem).toMatch(/Enter the 2026 crop/);
    expect(r.bestFit).toBeNull();
  });
});

describe('scoring rubric', () => {
  const cornSoy = fieldWith(['soybeans', 'corn', 'soybeans', 'corn']);

  it('is deterministic', () => {
    expect(JSON.stringify(score(cornSoy, FULL))).toEqual(JSON.stringify(score(cornSoy, FULL)));
  });

  it('scores all four bars 0–100 for every strategy and picks exactly one best fit', () => {
    const r = score(cornSoy, FULL);
    expect(r.strategies).toHaveLength(3);
    for (const s of r.strategies) {
      expect(s.bars.map((b) => b.id)).toEqual(['soilCover', 'diversity', 'pests', 'climate']);
      for (const b of s.bars) {
        expect(b.score).not.toBeNull();
        expect(b.score!).toBeGreaterThanOrEqual(0);
        expect(b.score!).toBeLessThanOrEqual(100);
      }
    }
    expect(['keep', 'cover', 'small-grains']).toContain(r.bestFit);
  });

  it('every reason and caveat cites at least one source, and every citation exists', () => {
    const r = score(cornSoy, {});
    for (const s of r.strategies) {
      for (const reason of [...s.bars.flatMap((b) => b.reasons), ...s.caveats]) {
        expect(reason.sources.length, reason.text).toBeGreaterThan(0);
        for (const src of reason.sources) if (src.kind === 'citation') expect(CITATIONS[src.id]).toBeDefined();
      }
    }
  });

  it('cover crops raise soil cover, and small grains raise diversity, over keeping the rotation', () => {
    const r = score(cornSoy, FULL);
    expect(bar(r, 'cover', 'soilCover').score!).toBeGreaterThan(bar(r, 'keep', 'soilCover').score!);
    expect(bar(r, 'small-grains', 'diversity').score!).toBeGreaterThan(bar(r, 'keep', 'diversity').score!);
  });

  it('continuous corn is penalised for pests, especially with rootworm', () => {
    const cc = fieldWith(['corn', 'corn', 'corn', 'corn']);
    const r = score(cc, { ...FULL, problems: ['rootworm'] });
    expect(bar(r, 'keep', 'pests').score!).toBeLessThan(30);
    expect(bar(r, 'keep', 'pests').reasons.some((x) => /rootworm/i.test(x.text) && (x.effect ?? 0) < 0)).toBe(true);
  });

  it('missing answers never score better than known favourable answers', () => {
    const known = score(cornSoy, FULL);
    const missing = score(cornSoy, { ...FULL, tillage: undefined, problems: 'unsure', irrigation: 'unsure' });
    for (const s of known.strategies) {
      for (const b of s.bars) {
        const m = bar(missing, s.strategy.id, b.id);
        expect(m.score!, `${s.strategy.id}/${b.id}`).toBeLessThanOrEqual(b.score!);
      }
    }
    expect(bar(missing, 'keep', 'soilCover').missing).toContain('tillage');
  });

  it('shows climate as missing (not zero) without POWER data, and still ranks on three bars', () => {
    const r = score(cornSoy, FULL, profileFor(cornSoy, null));
    for (const s of r.strategies) {
      const c = s.bars.find((b) => b.id === 'climate')!;
      expect(c.score).toBeNull();
      expect(c.reasons[0].text).toMatch(/Not enough info/);
      expect(s.overall).not.toBeNull();
    }
    expect(r.bestFit).not.toBeNull();
  });

  it('no best fit with only this season known and no climate (fewer than 3 bars)', () => {
    const one = fieldWith(['corn']);
    one.crops = { ...one.crops, history: one.crops.history.map((s) => ({ ...s, crop: null, status: 'empty' as const })) };
    const r = score(one, FULL, profileFor(one, null));
    expect(r.bestFit).toBeNull();
    expect(r.bestFitReason).toMatch(/Not enough info/);
    expect(bar(r, 'keep', 'diversity').score).toBeNull();
  });

  it('breaks ties toward fewer practice changes', () => {
    const r = score(cornSoy, FULL);
    const best = r.strategies.find((s) => s.strategy.id === r.bestFit)!;
    for (const s of r.strategies) {
      if (s.overall === null || s === best) continue;
      const within = Math.abs(s.overall - best.overall!) < 1;
      if (within) expect(best.strategy.practiceChanges).toBeLessThanOrEqual(s.strategy.practiceChanges);
      else expect(best.overall!).toBeGreaterThan(s.overall);
    }
  });

  it('erosion doubles the soil-cover weight', () => {
    const r = score(cornSoy, { ...FULL, problems: ['erosion'] });
    expect(r.weights.soilCover).toBe(2);
    expect(r.weightReasons[0].sources.some((s) => s.kind === 'answer')).toBe(true);
  });

  it('a soil test overrides the soil-survey organic matter and is labelled as the farmer’s', () => {
    const f = cornSoy;
    const profile = profileFor(f, AMES, {
      ssurgo: { sourceId: 'ssurgo', sourceName: 'SSURGO', docsUrl: '', status: 'ok', values: [{ key: 'organicMatter', label: 'OM', value: 3.1, unit: '%' }] },
    });
    expect(buildInputs(f, profile, {}).organicMatter).toMatchObject({ value: 3.1 });
    expect(buildInputs(f, profile, { soilTest: { organicMatterPct: 4.2 } }).organicMatter).toMatchObject({ value: 4.2, fromFarmer: true });
  });

  it('ignores a profile from an older boundary', () => {
    const f = cornSoy;
    const stale = { ...profileFor(f), geometryHash: 'old' };
    expect(buildInputs(f, stale, {}).climate).toBeUndefined();
  });

  it('recent dryness from POWER lowers cover-crop climate fit', () => {
    const wet = profileFor(cornSoy, AMES, {
      power: { sourceId: 'power', sourceName: 'NASA POWER', docsUrl: '', status: 'ok', climate: AMES, values: [{ key: 'rain30', label: 'r', value: 3, unit: 'in' }, { key: 'rainNormal', label: 'n', value: 2.2, unit: 'in' }] },
    });
    const dry = profileFor(cornSoy, AMES, {
      power: { sourceId: 'power', sourceName: 'NASA POWER', docsUrl: '', status: 'ok', climate: AMES, values: [{ key: 'rain30', label: 'r', value: 0.4, unit: 'in' }, { key: 'rainNormal', label: 'n', value: 2.2, unit: 'in' }] },
    });
    expect(bar(score(cornSoy, FULL, dry), 'cover', 'climate').score!).toBeLessThan(bar(score(cornSoy, FULL, wet), 'cover', 'climate').score!);
  });
});

describe('cover crops', () => {
  it('fall GDD after an October harvest near Ames is short; after a July harvest it is long', () => {
    expect(fallGdd40(AMES.monthlyMeanTempF, 10)).toBeLessThan(300);
    expect(fallGdd40(AMES.monthlyMeanTempF, 7)).toBeGreaterThan(1500);
  });

  it('after late-harvested corn going to soybeans, cereal rye is the top pick', () => {
    expect(pickCover({ prevCrop: 'corn', nextCrop: 'soybeans', harvestMonth: 10, climate: AMES, goals: [] }).species.id).toBe('cereal-rye');
  });

  it('oats and radish need an earlier harvest than October near Ames', () => {
    const picks = suggestCovers({ prevCrop: 'soybeans', nextCrop: 'corn', harvestMonth: 10, climate: AMES, goals: [] });
    expect(picks.find((p) => p.species.id === 'oats')?.fits).toBe(false);
    expect(picks.find((p) => p.species.id === 'radish')?.fits).toBe(false);
  });

  it('crimson clover fails Iowa winters; red clover only follows small grains', () => {
    const afterOats = suggestCovers({ prevCrop: 'oats', nextCrop: 'corn', harvestMonth: 7, climate: AMES, goals: [] });
    expect(afterOats.find((p) => p.species.id === 'crimson-clover')?.fits).toBe(false);
    expect(afterOats[0].species.id).toBe('red-clover');
    expect(suggestCovers({ prevCrop: 'corn', nextCrop: 'soybeans', harvestMonth: 10, climate: AMES, goals: [] }).some((p) => p.species.id === 'red-clover')).toBe(false);
  });

  it('without climate data, nothing is marked as fitting and the reason says so', () => {
    const picks = suggestCovers({ prevCrop: 'corn', nextCrop: 'soybeans', harvestMonth: 10, goals: [] });
    expect(picks.every((p) => p.fits === null)).toBe(true);
    expect(picks[0].why.join(' ')).toMatch(/Climate data is missing/);
  });
});

describe('questionnaire answers (layer 3)', () => {
  it('round-trips through a management record and drops an empty soil test', () => {
    const rec = toManagementRecord('f1', { ...FULL, soilTest: { ph: undefined } }, new Date('2026-11-14T00:00:00Z'));
    expect(rec).toMatchObject({ fieldId: 'f1', schemaVersion: 1 });
    expect(rec.answers).not.toHaveProperty('soilTest');
    expect(answersOf(rec)).toEqual(FULL);
  });

  it('keeps the valid answers from a partly corrupted record', () => {
    const a = answersOf({ fieldId: 'f', schemaVersion: 1, updatedAt: '', answers: { tillage: 'no-till', irrigation: 'sometimes??', harvestMonth: 13 } });
    expect(a).toEqual({ tillage: 'no-till' });
  });
});
