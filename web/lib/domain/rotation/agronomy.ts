import { catalogCrop } from '../crops';
import type { CropRef } from '../types';

/**
 * Plain agronomy tables for Rotation Explorer. Every number here is a documented placeholder
 * (docs/rotation-rubric.md), not a measurement for a specific farm.
 */

export type Family =
  | 'grasses'
  | 'legumes'
  | 'brassicas'
  | 'sunflower family'
  | 'mallows'
  | 'nightshades'
  | 'beets'
  | 'buckwheat'
  | 'flax'
  | 'onions'
  | 'squash family'
  | 'morning glories'
  | 'mixed vegetables';

export type SeasonType = 'warm' | 'cool' | 'perennial';

interface CropAgronomy {
  family: Family;
  season: SeasonType;
  /** Usual planting month (1–12). Fall-sown crops are planted the year before harvest. */
  plant: number;
  harvest: number;
  fallSown?: boolean;
  /** Living plants all year (hay, pasture, a full-season cover). */
  perennial?: boolean;
}

const A = (family: Family, season: SeasonType, plant: number, harvest: number, extra: Partial<CropAgronomy> = {}): CropAgronomy => ({ family, season, plant, harvest, ...extra });

/**
 * Usual planting and harvest months for the central US (about 40–44° N), simplified from USDA NASS
 * "Field Crops Usual Planting and Harvesting Dates" (Agricultural Handbook 628). Editable in the Planner.
 */
export const AGRONOMY: Record<string, CropAgronomy> = {
  corn: A('grasses', 'warm', 5, 10),
  'sweet-corn': A('grasses', 'warm', 5, 8),
  popcorn: A('grasses', 'warm', 5, 10),
  sorghum: A('grasses', 'warm', 6, 10),
  rice: A('grasses', 'warm', 4, 9),
  millet: A('grasses', 'warm', 6, 9),
  soybeans: A('legumes', 'warm', 5, 10),
  peanuts: A('legumes', 'warm', 5, 10),
  'dry-beans': A('legumes', 'warm', 6, 9),
  cotton: A('mallows', 'warm', 5, 10),
  sunflower: A('sunflower family', 'warm', 5, 10),
  safflower: A('sunflower family', 'cool', 4, 9),
  tobacco: A('nightshades', 'warm', 5, 9),
  'sweet-potatoes': A('morning glories', 'warm', 5, 10),
  tomatoes: A('nightshades', 'warm', 5, 9),
  pumpkins: A('squash family', 'warm', 6, 10),
  watermelons: A('squash family', 'warm', 5, 8),
  buckwheat: A('buckwheat', 'warm', 6, 9),
  'winter-wheat': A('grasses', 'cool', 10, 7, { fallSown: true }),
  rye: A('grasses', 'cool', 10, 7, { fallSown: true }),
  triticale: A('grasses', 'cool', 10, 7, { fallSown: true }),
  'spring-wheat': A('grasses', 'cool', 4, 8),
  'durum-wheat': A('grasses', 'cool', 4, 8),
  barley: A('grasses', 'cool', 4, 7),
  oats: A('grasses', 'cool', 4, 7),
  canola: A('brassicas', 'cool', 4, 8),
  mustard: A('brassicas', 'cool', 4, 8),
  camelina: A('brassicas', 'cool', 4, 7),
  flaxseed: A('flax', 'cool', 4, 8),
  peas: A('legumes', 'cool', 4, 7),
  lentils: A('legumes', 'cool', 4, 8),
  chickpeas: A('legumes', 'cool', 4, 8),
  potatoes: A('nightshades', 'cool', 4, 9),
  sugarbeets: A('beets', 'cool', 4, 10),
  onions: A('onions', 'cool', 4, 8),
  vegetables: A('mixed vegetables', 'warm', 4, 9),
  alfalfa: A('legumes', 'perennial', 4, 10, { perennial: true }),
  clover: A('legumes', 'perennial', 4, 10, { perennial: true }),
  'other-hay': A('grasses', 'perennial', 4, 10, { perennial: true }),
  switchgrass: A('grasses', 'perennial', 4, 10, { perennial: true }),
  'grass-pasture': A('grasses', 'perennial', 4, 10, { perennial: true }),
  sugarcane: A('grasses', 'perennial', 3, 11, { perennial: true }),
  'cover-crop': A('grasses', 'cool', 9, 5, { perennial: true }),
};

/** Fallow has no crop family and no living cover. */
export const FALLOW = 'fallow';

export const SMALL_GRAINS = new Set(['winter-wheat', 'spring-wheat', 'durum-wheat', 'barley', 'oats', 'rye', 'triticale']);
export const LEGUME_CASH = new Set(['soybeans', 'dry-beans', 'peas', 'lentils', 'chickpeas', 'peanuts']);

/** Pest and disease hosts. Sources: see citations for each problem in score.ts. */
export const HOSTS = {
  rootworm: new Set(['corn', 'sweet-corn', 'popcorn']),
  scn: new Set(['soybeans', 'dry-beans']),
  'white-mold': new Set(['soybeans', 'dry-beans', 'sunflower', 'safflower', 'canola', 'mustard', 'camelina', 'peas', 'lentils', 'chickpeas', 'potatoes', 'tomatoes']),
} as const;

/**
 * The crop ids in one season. A double crop counts as two crops (first, then second).
 * Crops outside the catalogue ("other" text, unmapped CDL classes) return null: they are unknown to the rubric.
 */
export function cropIdsOf(ref: CropRef | null | undefined): string[] | null {
  if (!ref) return null;
  if (ref.kind === 'catalog') return catalogCrop(ref.id) ? [ref.id] : null;
  if (ref.kind === 'double') return [ref.first, ref.second];
  return null;
}

export function agronomyOf(id: string): CropAgronomy | undefined {
  return AGRONOMY[id];
}

export function familyOf(id: string): Family | undefined {
  return AGRONOMY[id]?.family;
}

/** Prefix finance uses for a crop the farmer typed in themselves ("other:Hemp"). */
export const OTHER_CROP_PREFIX = 'other:';

export function cropName(id: string): string {
  return catalogCrop(id)?.name ?? (id.startsWith(OTHER_CROP_PREFIX) ? id.slice(OTHER_CROP_PREFIX.length) : id);
}

/** Shift spring planting and harvest a month earlier in the South (below 36° N). */
export function calendarFor(id: string, lat: number | undefined, harvestOverride?: number): { plant: number; harvest: number; fallSown: boolean; perennial: boolean } | undefined {
  const a = AGRONOMY[id];
  if (!a) return undefined;
  const south = lat !== undefined && lat < 36 && !a.perennial;
  const clampM = (m: number) => ((m - 1 + 12) % 12) + 1;
  let plant = a.plant;
  let harvest = a.harvest;
  if (south) {
    plant = a.fallSown ? clampM(plant + 1) : clampM(plant - 1);
    harvest = clampM(harvest - 1);
  }
  if (harvestOverride && !a.perennial) harvest = harvestOverride;
  return { plant, harvest, fallSown: !!a.fallSown, perennial: !!a.perennial };
}

export const DAYS_IN_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Fall growing degree days (°F, base 40) available to a cover crop seeded right after a harvest in
 * `harvestMonth`: half the harvest month, then each following month until the normal mean drops below 40 °F.
 */
export function fallGdd40(monthlyMeanTempF: number[], harvestMonth: number): number {
  let total = 0;
  for (let k = 0; k < 6; k++) {
    const m = (harvestMonth - 1 + k) % 12;
    const t = monthlyMeanTempF[m];
    if (t < 40) break;
    total += (t - 40) * DAYS_IN_MONTH[m] * (k === 0 ? 0.5 : 1);
  }
  return Math.round(total);
}

export function coldestMonthF(monthlyMeanTempF: number[]): number {
  return Math.min(...monthlyMeanTempF);
}
