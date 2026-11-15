import { z } from 'zod';
import { cropName, cropIdsOf, agronomyOf, calendarFor } from './rotation/agronomy';
import { COVER_SPECIES, suggestCovers, type CoverPick } from './rotation/coverCrops';
import type { RotationInputs } from './rotation/inputs';
import { scoreStrategySet, type BarWeights, type StrategyScore } from './rotation/score';
import type { PlannedCover, PlannedSeason, Strategy } from './rotation/strategies';
import type { ClimateNormals, Plan, PlanSeason, ScenarioConfig, ScenarioPriority } from './types';

export const scenarioConfigSchema = z.object({
  preset: z.enum(['historical', 'drier', 'wetter', 'hotter', 'custom']),
  rainfallPct: z.number().finite().min(-30).max(30),
  temperatureDeltaC: z.number().finite().min(-3).max(5),
  priority: z.enum(['balanced', 'water', 'soil', 'resilience', 'pests', 'operational']),
  growthStage: z.enum(['unspecified', 'pre-planting', 'establishment', 'vegetative', 'reproductive', 'grain-fill', 'harvest']),
  irrigation: z.enum(['field', 'none', 'supplemental', 'full', 'unsure']),
}).strict();

export const DEFAULT_SCENARIO_CONFIG: ScenarioConfig = {
  preset: 'historical',
  rainfallPct: 0,
  temperatureDeltaC: 0,
  priority: 'balanced',
  growthStage: 'unspecified',
  irrigation: 'field',
};

export const SCENARIO_PRESETS: Record<Exclude<ScenarioConfig['preset'], 'custom'>, Pick<ScenarioConfig, 'rainfallPct' | 'temperatureDeltaC'>> = {
  historical: { rainfallPct: 0, temperatureDeltaC: 0 },
  drier: { rainfallPct: -20, temperatureDeltaC: 0 },
  wetter: { rainfallPct: 20, temperatureDeltaC: 0 },
  hotter: { rainfallPct: 0, temperatureDeltaC: 2 },
};

export interface ScenarioMonth {
  name: string;
  baselineRainIn: number;
  adjustedRainIn: number;
  baselineTempF: number;
  adjustedTempF: number;
}

export interface ScenarioWeatherSummary {
  months: ScenarioMonth[];
  baselineRainIn: number;
  adjustedRainIn: number;
  rainfallChangeIn: number;
  temperatureChangeF: number;
  warmestMonth: string;
  baselineWarmestTempF: number;
  adjustedWarmestTempF: number;
  largestRainChangeMonth: string;
}

export interface ScenarioComparison {
  current: StrategyScore;
  proposed: StrategyScore;
  weights: Record<'soilCover' | 'diversity' | 'pests' | 'climate', number>;
  weightReasons: ReturnType<typeof scoreStrategySet>['weightReasons'];
  betterMatch: 'current' | 'proposed' | null;
  gap: number | null;
}

export const PRIORITY_LABELS: Record<ScenarioPriority, string> = {
  balanced: 'Balanced comparison',
  water: 'Water and climate',
  soil: 'Soil cover',
  resilience: 'Crop resilience',
  pests: 'Pest management',
  operational: 'Operational feasibility',
};

export const PRIORITY_EXPLANATIONS: Record<ScenarioPriority, string> = {
  balanced: 'Uses the field-specific Rotation Explorer weights, including its erosion adjustment when applicable.',
  water: 'Gives the existing climate-fit bar extra weight. This is a climate-fit proxy, not a crop water-use or water-savings model.',
  soil: 'Gives the existing soil-cover bar extra weight. It is not a measured erosion reduction.',
  resilience: 'Gives crop diversity and climate fit extra weight; these are rubric indicators, not a crop-loss prediction.',
  pests: 'Gives the existing pest-and-disease rotation bar extra weight. It does not predict pest populations.',
  operational: 'The current rubric does not score feasibility, equipment, or markets, so this priority surfaces practical caveats without ranking the plans.',
};

export const STAGE_LABELS: Record<ScenarioConfig['growthStage'], string> = {
  unspecified: 'Not specified',
  'pre-planting': 'Pre-planting',
  establishment: 'Germination or establishment',
  vegetative: 'Vegetative growth',
  reproductive: 'Flowering or reproductive stage',
  'grain-fill': 'Grain filling or maturation',
  harvest: 'Harvest',
};

export function priorityWeights(priority: ScenarioPriority): BarWeights {
  switch (priority) {
    case 'water':
      return { climate: 2 };
    case 'soil':
      return { soilCover: 2 };
    case 'resilience':
      return { diversity: 2, climate: 2 };
    case 'pests':
      return { pests: 2 };
    case 'balanced':
    case 'operational':
      return {};
  }
}

export function adjustClimateNormals(climate: ClimateNormals, rainfallPct: number, temperatureDeltaC: number): ClimateNormals {
  if (!Number.isFinite(rainfallPct) || rainfallPct < -30 || rainfallPct > 30) throw new RangeError('Rainfall adjustment must be between -30% and +30%.');
  if (!Number.isFinite(temperatureDeltaC) || temperatureDeltaC < -3 || temperatureDeltaC > 5) throw new RangeError('Temperature adjustment must be between -3°C and +5°C.');
  if (climate.monthlyRainIn.length !== 12 || climate.monthlyMeanTempF.length !== 12) throw new TypeError('Climate normals must contain 12 monthly values.');
  if ([...climate.monthlyRainIn, ...climate.monthlyMeanTempF].some((value) => !Number.isFinite(value))) throw new TypeError('Climate normals must contain only finite values.');

  const rainFactor = 1 + rainfallPct / 100;
  const tempDeltaF = temperatureDeltaC * 1.8;
  return {
    monthlyRainIn: climate.monthlyRainIn.map((rain) => rain * rainFactor),
    monthlyMeanTempF: climate.monthlyMeanTempF.map((temp) => temp + tempDeltaF),
  };
}

export function summarizeScenarioWeather(baseline: ClimateNormals, adjusted: ClimateNormals): ScenarioWeatherSummary {
  if (baseline.monthlyRainIn.length !== 12 || baseline.monthlyMeanTempF.length !== 12 || adjusted.monthlyRainIn.length !== 12 || adjusted.monthlyMeanTempF.length !== 12) {
    throw new TypeError('Scenario weather summaries require 12 baseline and adjusted monthly values.');
  }
  const months = baseline.monthlyRainIn.map((rain, index) => ({
    name: new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2020, index, 1))),
    baselineRainIn: rain,
    adjustedRainIn: adjusted.monthlyRainIn[index],
    baselineTempF: baseline.monthlyMeanTempF[index],
    adjustedTempF: adjusted.monthlyMeanTempF[index],
  }));
  const warmestIndex = baseline.monthlyMeanTempF.reduce((best, value, index, values) => (value > values[best] ? index : best), 0);
  const largestRainIndex = months.reduce((best, month, index, values) =>
    Math.abs(month.adjustedRainIn - month.baselineRainIn) > Math.abs(values[best].adjustedRainIn - values[best].baselineRainIn) ? index : best, 0);
  const baselineRainIn = baseline.monthlyRainIn.reduce((sum, value) => sum + value, 0);
  const adjustedRainIn = adjusted.monthlyRainIn.reduce((sum, value) => sum + value, 0);
  return {
    months,
    baselineRainIn,
    adjustedRainIn,
    rainfallChangeIn: adjustedRainIn - baselineRainIn,
    temperatureChangeF: adjusted.monthlyMeanTempF[0] - baseline.monthlyMeanTempF[0],
    warmestMonth: months[warmestIndex].name,
    baselineWarmestTempF: baseline.monthlyMeanTempF[warmestIndex],
    adjustedWarmestTempF: adjusted.monthlyMeanTempF[warmestIndex],
    largestRainChangeMonth: months[largestRainIndex].name,
  };
}

export function compareScenario(
  inputs: RotationInputs,
  current: Strategy,
  proposed: Strategy,
  knownSeasons: number,
  config: ScenarioConfig,
): ScenarioComparison {
  const climate = inputs.climate
    ? adjustClimateNormals(inputs.climate.value, config.rainfallPct, config.temperatureDeltaC)
    : undefined;
  const irrigation = config.irrigation === 'field' ? inputs.answers.irrigation : config.irrigation;
  const scenarioInputs: RotationInputs = {
    ...inputs,
    answers: { ...inputs.answers, irrigation },
    climate: climate && inputs.climate
      ? {
          ...inputs.climate,
          value: climate,
          label: 'Hypothetical adjustment to 1991–2020 NASA POWER climate normals',
          display: `${config.rainfallPct >= 0 ? '+' : ''}${config.rainfallPct}% rain, ${config.temperatureDeltaC >= 0 ? '+' : ''}${config.temperatureDeltaC}°C`,
        }
      : undefined,
  };
  const scored = scoreStrategySet(scenarioInputs, [current, proposed], knownSeasons, priorityWeights(config.priority));
  const [currentScore, proposedScore] = scored.strategies;
  const gap = currentScore.overall === null || proposedScore.overall === null ? null : Math.abs(proposedScore.overall - currentScore.overall);
  const operationalOnly = config.priority === 'operational';
  return {
    current: currentScore,
    proposed: proposedScore,
    weights: scored.weights,
    weightReasons: scored.weightReasons,
    betterMatch: operationalOnly || gap === null || gap < 1 ? null : proposedScore.overall! > currentScore.overall! ? 'proposed' : 'current',
    gap,
  };
}

export interface PlanStrategyResult {
  strategy?: Strategy;
  limitations: string[];
}

interface DatedTask {
  year: number;
  month: number;
  label: string;
}

function normalizedText(text: string): string {
  return text.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function taskDate(plan: Plan, kind: string, matchText: string, expectedYear: number): DatedTask | undefined {
  const match = normalizedText(matchText);
  return plan.seasons
    .flatMap((season) => season.tasks.filter((task) => task.kind === kind && normalizedText(task.label).includes(match)).map((task) => ({ year: season.year, month: task.month, label: task.label })))
    .sort((a, b) => Math.abs(a.year - expectedYear) - Math.abs(b.year - expectedYear))[0];
}

function planCropWindows(plan: Plan, season: PlanSeason, ids: string[], lat: number | undefined, limitations: Set<string>) {
  return ids.map((id) => {
    const calendar = calendarFor(id, lat);
    if (!calendar) return undefined;
    const crop = cropName(id);
    const expectedPlantYear = calendar.fallSown ? season.year - 1 : season.year;
    const planting = taskDate(plan, 'plant', crop, expectedPlantYear);
    const harvest = taskDate(plan, 'harvest', crop, season.year);
    if (!planting || !harvest) limitations.add('Some crop dates use the catalog’s usual central-US planting and harvest months because no matching Planner task was saved.');
    return {
      id,
      plant: planting?.month ?? calendar.plant,
      plantYear: planting?.year ?? expectedPlantYear,
      harvest: harvest?.month ?? calendar.harvest,
      harvestYear: harvest?.year ?? season.year,
      perennial: calendar.perennial,
    };
  });
}

function datedCover(plan: Plan, season: PlanSeason, index: number, allSeasons: Array<{ season: PlanSeason; ids: string[]; crops: NonNullable<ReturnType<typeof planCropWindows>> }>, climate: ClimateNormals | undefined, limitations: Set<string>): PlannedCover | undefined {
  if (!season.cover) return undefined;
  const species = COVER_SPECIES.find((item) => item.id === season.cover?.species);
  const current = allSeasons[index];
  const lastCrop = current?.crops[current.crops.length - 1];
  if (!species || !lastCrop) {
    limitations.add('A Planner cover crop could not be matched to the Rotation Explorer cover-crop catalog, so the plan cannot be fully scored.');
    return undefined;
  }
  const nextCrop = allSeasons[index + 1]?.ids[0];
  const pick: CoverPick = suggestCovers({ prevCrop: lastCrop.id, nextCrop, harvestMonth: lastCrop.harvest, climate, goals: [] }).find((candidate) => candidate.species.id === species.id)
    ?? { species, fits: null, rank: 0, why: ['This cover is in the saved Planner plan; the existing suggestion rules did not rank it for this gap.'] };
  const plantTask = taskDate(plan, 'cover-plant', species.name, season.year);
  const terminateTask = taskDate(plan, 'cover-terminate', species.name, season.year + 1);
  if (!plantTask) limitations.add('A cover-crop planting month is missing from the Planner; the crop harvest month is used as an approximate seeding window.');

  const next = allSeasons[index + 1]?.crops[0];
  const nextYear = next?.plantYear ?? season.year + 1;
  const nextMonth = next?.plant ?? 5;
  const endTotalMonth = nextYear * 12 + nextMonth - 2;
  const defaultEndYear = Math.floor(endTotalMonth / 12);
  const defaultEndMonth = ((endTotalMonth % 12) + 12) % 12 + 1;
  return {
    pick,
    plantMonth: plantTask?.month ?? lastCrop.harvest,
    plantYear: plantTask?.year ?? lastCrop.harvestYear,
    endMonth: terminateTask?.month ?? defaultEndMonth,
    endYear: terminateTask?.year ?? defaultEndYear,
  };
}

/** Reconstructs a strategy from the saved Planner rows and tasks, retaining custom edits. */
export function strategyFromPlan(plan: Plan, lat: number | undefined, climate?: ClimateNormals): PlanStrategyResult {
  const limitations = new Set<string>();
  const parsed = plan.seasons.map((season) => {
    if (!season.crop) return { season, ids: [] as string[] };
    const ids = cropIdsOf(season.crop);
    if (!ids || ids.some((id) => !agronomyOf(id))) {
      return { season, ids: null };
    }
    return { season, ids };
  });
  const unsupported = parsed.find((entry) => entry.ids === null);
  if (unsupported) {
    limitations.add(`The crop in ${unsupported.season.year} is not in the supported crop catalog; no crop-fit score is shown for this plan.`);
    return { limitations: [...limitations] };
  }
  const supported = parsed as Array<{ season: PlanSeason; ids: string[] }>;
  const rows = supported.map(({ season, ids }) => ({ season, ids, crops: planCropWindows(plan, season, ids, lat, limitations).filter((crop): crop is NonNullable<typeof crop> => !!crop) }));
  const seasons: PlannedSeason[] = rows.map(({ season, ids, crops }, index) => {
    const cover = datedCover(plan, season, index, rows, climate, limitations);
    return {
      year: season.year,
      ids,
      label: ids.length ? ids.map(cropName).join(' → ') : 'Fallow / no crop entered',
      crops,
      cover,
      changed: plan.strategyId !== 'keep',
    };
  });
  const id = plan.strategyId;
  const title = id === 'keep' ? 'Saved current-rotation plan' : id === 'cover' ? 'Saved cover-crop plan' : id === 'small-grains' ? 'Saved small-grains plan' : plan.name;
  const strategy: Strategy = {
    id,
    title,
    summary: `Saved Planner schedule: ${plan.name}.`,
    practiceChanges: id === 'keep' ? 0 : id === 'custom' ? 1 : 2,
    seasons,
    notes: [],
    ...(id === 'small-grains' ? { smallGrain: seasons.flatMap((item) => item.ids).find((crop) => crop === 'oats' || crop === 'barley' || crop === 'winter-wheat' || crop === 'spring-wheat' || crop === 'durum-wheat' || crop === 'rye' || crop === 'triticale') } : {}),
  };
  return { strategy, limitations: [...limitations] };
}
