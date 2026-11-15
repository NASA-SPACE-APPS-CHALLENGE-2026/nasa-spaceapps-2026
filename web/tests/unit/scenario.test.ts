import { describe, expect, it } from 'vitest';
import { setSeasonCrop } from '@/lib/domain/cropHistory';
import { createField } from '@/lib/domain/field';
import { buildInputs } from '@/lib/domain/rotation/inputs';
import { buildStrategies } from '@/lib/domain/rotation/strategies';
import { adjustClimateNormals, compareScenario, DEFAULT_SCENARIO_CONFIG, priorityWeights, strategyFromPlan, summarizeScenarioWeather } from '@/lib/domain/scenario';
import { planFromStrategy } from '@/lib/domain/plan';
import type { ClimateNormals, CropRef, Field, FieldProfile } from '@/lib/domain/types';
import { AMES_FIELD } from './helpers';

const NORMALS: ClimateNormals = {
  monthlyMeanTempF: [20, 25, 38, 50, 62, 70, 75, 73, 64, 51, 38, 25],
  monthlyRainIn: [1, 1, 2, 3, 4, 5, 4, 4, 3, 2, 1, 1],
};
const C = (id: string): CropRef => ({ kind: 'catalog', id });

function fieldWithHistory(): Field {
  let field = createField({ name: 'Test field', geometry: AMES_FIELD, definedBy: 'polygon', now: new Date('2026-11-14T00:00:00Z') });
  let crops = field.crops;
  for (const [year, crop] of [[2026, 'soybeans'], [2025, 'corn'], [2024, 'soybeans'], [2023, 'corn']] as const) {
    crops = setSeasonCrop(crops, year, C(crop));
  }
  field = { ...field, crops };
  return field;
}

function profile(field: Field, climate: ClimateNormals | null = NORMALS): FieldProfile {
  return {
    fieldId: field.id,
    geometryHash: field.geometryHash,
    sources: climate ? { power: { sourceId: 'power', sourceName: 'NASA POWER', docsUrl: '', status: 'ok', values: [], climate } } : {},
  };
}

describe('scenario weather transforms', () => {
  it('scales rainfall and shifts temperatures without mutating the normals', () => {
    const adjusted = adjustClimateNormals(NORMALS, -20, 2);
    expect(adjusted.monthlyRainIn[0]).toBeCloseTo(0.8);
    expect(adjusted.monthlyMeanTempF[0]).toBeCloseTo(23.6);
    expect(NORMALS.monthlyRainIn[0]).toBe(1);
    expect(NORMALS.monthlyMeanTempF[0]).toBe(20);
  });

  it('rejects out-of-range and incomplete climate inputs', () => {
    expect(() => adjustClimateNormals(NORMALS, 31, 0)).toThrow(RangeError);
    expect(() => adjustClimateNormals(NORMALS, 0, 5.1)).toThrow(RangeError);
    expect(() => adjustClimateNormals({ ...NORMALS, monthlyRainIn: [1] }, 0, 0)).toThrow(TypeError);
  });

  it('summarizes the adjusted annual rainfall and warmest baseline month', () => {
    const summary = summarizeScenarioWeather(NORMALS, adjustClimateNormals(NORMALS, 20, 1));
    expect(summary.baselineRainIn).toBe(31);
    expect(summary.adjustedRainIn).toBeCloseTo(37.2);
    expect(summary.warmestMonth).toBe('Jul');
    expect(summary.temperatureChangeF).toBeCloseTo(1.8);
  });
});

describe('scenario rotation comparison', () => {
  it('maps supported priorities to existing rubric weights and leaves operational feasibility unscored', () => {
    expect(priorityWeights('water')).toEqual({ climate: 2 });
    expect(priorityWeights('soil')).toEqual({ soilCover: 2 });
    expect(priorityWeights('resilience')).toEqual({ diversity: 2, climate: 2 });
    expect(priorityWeights('pests')).toEqual({ pests: 2 });
    expect(priorityWeights('operational')).toEqual({});

    const field = fieldWithHistory();
    const inputs = buildInputs(field, profile(field), {});
    const strategies = buildStrategies(inputs).strategies;
    const comparison = compareScenario(inputs, strategies[0], strategies[1], 4, { ...DEFAULT_SCENARIO_CONFIG, priority: 'operational' });
    expect(comparison.betterMatch).toBeNull();
    expect(comparison.current.overall).not.toBeNull();
  });

  it('keeps climate fit unscored when climate normals are missing', () => {
    const field = fieldWithHistory();
    const inputs = buildInputs(field, profile(field, null), {});
    const [current, proposed] = buildStrategies(inputs).strategies;
    const comparison = compareScenario(inputs, current, proposed, 4, DEFAULT_SCENARIO_CONFIG);
    expect(comparison.current.bars.find((bar) => bar.id === 'climate')?.score).toBeNull();
    expect(comparison.proposed.bars.find((bar) => bar.id === 'climate')?.score).toBeNull();
  });

  it('reconstructs the saved Planner crop choices and records missing-date estimates', () => {
    const field = fieldWithHistory();
    const inputs = buildInputs(field, profile(field), {});
    const strategy = buildStrategies(inputs).strategies.find((item) => item.id === 'cover')!;
    const plan = planFromStrategy(strategy, field, {}, { now: new Date('2026-11-14T00:00:00Z') });
    const planWithoutDates = { ...plan, seasons: plan.seasons.map((season) => ({ ...season, tasks: [] })) };
    const reconstructed = strategyFromPlan(planWithoutDates, inputs.lat, NORMALS);
    expect(reconstructed.strategy?.id).toBe('cover');
    expect(reconstructed.strategy?.seasons.map((season) => season.ids)).toEqual(strategy.seasons.map((season) => season.ids));
    expect(reconstructed.strategy?.seasons.some((season) => season.cover)).toBe(true);
    expect(reconstructed.limitations).toContain('Some crop dates use the catalog’s usual central-US planting and harvest months because no matching Planner task was saved.');
  });
});
