import { z } from 'zod';
import { Params, type Origin } from './assumptions';
import type { CropKey, Tenure, Tillage } from './budget';

/**
 * Layer 5: what the farmer tells the Finance tab (and the Simulator), stored farm-wide.
 * Anything left blank falls back to a documented default (see assumptions.ts).
 */

export interface FieldFinance {
  acres?: number;
  /** The farmer confirmed the rotation PlotTwist read from their crop history. */
  rotationConfirmed?: boolean;
  tenure?: Tenure;
  rentPerAcre?: number;
  sharePct?: number;
  irrigated?: boolean;
}

export type CropStage = 'pre-plant' | 'growing' | 'harvested';
export type WeatherScenario = 'normal' | 'dry' | 'wet';

export interface CropScenarioInput {
  /** Fertilizer applied to this crop in each year it occurs, lb N/ac. */
  nitrogen?: number;
  /** Baseline expected harvested yield, in the crop’s displayed production unit/ac. */
  yield?: number;
}

export interface SimulatorInputs {
  cropInputs?: Record<string, CropScenarioInput>;
  residue?: 'unknown' | 'retained' | 'removed';
  /** Only explicit scenario overrides can replace mapped acreage. */
  acreageOverride?: boolean;
  acres?: number;
  stage?: CropStage;
  tillage?: Tillage;
  nRateCorn?: number;
  scenario?: WeatherScenario;
  /** Per-crop yield and price for this field only, keyed like "corn.yield". */
  overrides?: Record<string, number>;
  /** Plan A ("what you do now") edited by year: crop id per year. */
  currentCrops?: Record<string, string>;
}

export interface FinanceInputs {
  migrationNotes?: string[];
  horizon: 3 | 5;
  overrides: Record<string, number>;
  fields: Record<string, FieldFinance>;
  lastYear: { crops: Partial<Record<CropKey, { yield?: number; price?: number }>>; totalRevenue?: number; totalCosts?: number };
  forward: Partial<Record<CropKey, number>>;
  suppliers: { seedSupplier?: string; cornSeedPerBag?: number; fertilizerSupplier?: string; anhydrousPerTon?: number; grainBuyer?: string };
  beginningFarmer: boolean;
  simulator: Record<string, SimulatorInputs>;
  updatedAt?: string;
}

export const DEFAULT_FINANCE: FinanceInputs = { horizon: 5, overrides: {}, fields: {}, lastYear: { crops: {} }, forward: {}, suppliers: {}, beginningFarmer: false, simulator: {} };

const num = z.number().finite();
const optNum = num.nonnegative().optional().catch(undefined);
const optStr = z.string().max(120).optional().catch(undefined);
const cropKey = z.enum(['corn', 'soybeans', 'oats', 'wheat']);

export const financeSchema = z.object({
  migrationNotes: z.array(z.string()).optional().catch(undefined),
  horizon: z.union([z.literal(3), z.literal(5)]).catch(5),
  overrides: z.record(z.string(), num).catch({}),
  fields: z
    .record(
      z.string(),
      z.object({
        acres: optNum,
        rotationConfirmed: z.boolean().optional().catch(undefined),
        tenure: z.enum(['own', 'cash', 'share']).optional().catch(undefined),
        rentPerAcre: optNum,
        sharePct: optNum,
        irrigated: z.boolean().optional().catch(undefined),
      }),
    )
    .catch({}),
  lastYear: z
    .object({
      crops: z.record(cropKey, z.object({ yield: optNum, price: optNum })).catch({}),
      totalRevenue: optNum,
      totalCosts: optNum,
    })
    .catch({ crops: {} }),
  forward: z.record(cropKey, num).catch({}),
  suppliers: z.object({ seedSupplier: optStr, cornSeedPerBag: optNum, fertilizerSupplier: optStr, anhydrousPerTon: optNum, grainBuyer: optStr }).catch({}),
  beginningFarmer: z.boolean().catch(false),
  simulator: z
    .record(
      z.string(),
      z.object({
        acres: optNum,
        stage: z.enum(['pre-plant', 'growing', 'harvested']).optional().catch(undefined),
        tillage: z.enum(['conventional', 'reduced', 'no-till']).optional().catch(undefined),
        nRateCorn: optNum,
        acreageOverride: z.boolean().optional().catch(undefined),
        residue: z.enum(['unknown', 'retained', 'removed']).optional().catch(undefined),
        cropInputs: z.record(z.string(), z.object({ nitrogen: optNum, yield: optNum })).optional().catch(undefined),
        scenario: z.enum(['normal', 'dry', 'wet']).optional().catch(undefined),
        overrides: z.record(z.string(), num).optional().catch(undefined),
        currentCrops: z.record(z.string(), z.string().max(40)).optional().catch(undefined),
      }),
    )
    .catch({}),
  updatedAt: z.string().optional().catch(undefined),
});

/** Read stored finance inputs, dropping anything unreadable instead of failing. */
export function parseFinance(raw: unknown): FinanceInputs {
  const r = financeSchema.safeParse(raw ?? {});
  return r.success ? (r.data as FinanceInputs) : { ...DEFAULT_FINANCE };
}

const CORN_SEEDS_PER_ACRE = 30000; // ISU 2026 corn-following-soybeans seeding rate
const KERNELS_PER_BAG = 80000;
const ANHYDROUS_N = 0.82;

/**
 * The Params the engine reads: the farmer's direct overrides first, then values derived from what they told us
 * (last year's yields, supplier quotes), then the defaults.
 */
export function buildParams(inputs: FinanceInputs, extra: Record<string, number> = {}): Params {
  const overrides: Record<string, number> = {};
  const origins: Record<string, Origin> = {};
  const set = (id: string, v: number | undefined) => {
    if (typeof v === 'number' && Number.isFinite(v) && !(id in overrides)) {
      overrides[id] = v;
      origins[id] = 'farmer';
    }
  };
  for (const [id, v] of Object.entries(extra)) set(id, v);
  for (const [id, v] of Object.entries(inputs.overrides)) set(id, v);
  for (const [k, v] of Object.entries(inputs.lastYear.crops) as Array<[CropKey, { yield?: number }]>) set(`${k}.yield`, v?.yield);
  if (inputs.suppliers.cornSeedPerBag) set('corn.seed', (inputs.suppliers.cornSeedPerBag * CORN_SEEDS_PER_ACRE) / KERNELS_PER_BAG);
  if (inputs.suppliers.anhydrousPerTon) set('n.price', inputs.suppliers.anhydrousPerTon / (2000 * ANHYDROUS_N));
  return new Params(overrides, origins);
}
