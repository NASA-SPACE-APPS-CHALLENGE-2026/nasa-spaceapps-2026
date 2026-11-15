import { z } from 'zod';

export const FINANCIAL_COST_CATEGORIES = [
  { id: 'seed', label: 'Seed and planting' },
  { id: 'fertilizer', label: 'Fertilizer and nutrients' },
  { id: 'chemicals', label: 'Crop protection' },
  { id: 'equipment', label: 'Equipment and custom hire' },
  { id: 'labor', label: 'Labor' },
  { id: 'irrigation', label: 'Irrigation' },
  { id: 'harvest', label: 'Harvest, drying, and hauling' },
  { id: 'insurance', label: 'Crop insurance and fees' },
  { id: 'other', label: 'Other production costs' },
] as const;

export const FINANCIAL_YIELD_UNITS = ['bushel', 'pound', 'ton', 'cwt', 'bale', 'box', 'other'] as const;
export type FinancialYieldUnit = (typeof FINANCIAL_YIELD_UNITS)[number];
export type FinancialCostCategory = (typeof FINANCIAL_COST_CATEGORIES)[number]['id'];
export type LandTenure = 'unknown' | 'owned' | 'cash-rent' | 'share-rent';

const nonNegativeNumber = z.number().finite().min(0);
const costBreakdownSchema = z.object({
  seed: nonNegativeNumber.optional(),
  fertilizer: nonNegativeNumber.optional(),
  chemicals: nonNegativeNumber.optional(),
  equipment: nonNegativeNumber.optional(),
  labor: nonNegativeNumber.optional(),
  irrigation: nonNegativeNumber.optional(),
  harvest: nonNegativeNumber.optional(),
  insurance: nonNegativeNumber.optional(),
  other: nonNegativeNumber.optional(),
}).strict();

export interface CropFinancialAssumptions {
  yieldPerAcre?: number;
  yieldUnit?: FinancialYieldUnit;
  yieldUnitLabel?: string;
  pricePerUnit?: number;
  costMode: 'total' | 'detailed';
  totalOperatingCostPerAcre?: number;
  costsPerAcre: Partial<Record<FinancialCostCategory, number>>;
}

const cropFinancialAssumptionsSchema = z.object({
  yieldPerAcre: nonNegativeNumber.optional(),
  yieldUnit: z.enum(FINANCIAL_YIELD_UNITS).optional(),
  yieldUnitLabel: z.string().trim().min(1).optional(),
  pricePerUnit: nonNegativeNumber.optional(),
  costMode: z.enum(['total', 'detailed']),
  totalOperatingCostPerAcre: nonNegativeNumber.optional(),
  costsPerAcre: costBreakdownSchema,
}).strict();

export interface FinancialProfile {
  fieldId: string;
  updatedAt: string;
  planningHorizon: 3 | 5;
  landTenure: LandTenure;
  cashRentPerAcre?: number;
  shareRentPct?: number;
  coverCostPerAcre?: number;
  transitionCostPerAcre?: number;
  crops: Record<string, CropFinancialAssumptions>;
}

export const financialProfileSchema = z.object({
  fieldId: z.string().min(1),
  updatedAt: z.string().datetime(),
  planningHorizon: z.union([z.literal(3), z.literal(5)]),
  landTenure: z.enum(['unknown', 'owned', 'cash-rent', 'share-rent']),
  cashRentPerAcre: nonNegativeNumber.optional(),
  shareRentPct: z.number().finite().min(0).max(100).optional(),
  coverCostPerAcre: nonNegativeNumber.optional(),
  transitionCostPerAcre: nonNegativeNumber.optional(),
  crops: z.record(z.string(), cropFinancialAssumptionsSchema),
}).strict();

export function emptyFinancialProfile(fieldId: string, now = new Date()): FinancialProfile {
  return {
    fieldId,
    updatedAt: now.toISOString(),
    planningHorizon: 3,
    landTenure: 'unknown',
    crops: {},
  };
}

export interface FinancialAdjustments {
  yieldPct: number;
  pricePct: number;
  costPct: number;
  environmentalYieldPctByCrop: Record<string, number>;
}

export const financialAdjustmentsSchema = z.object({
  yieldPct: z.number().finite().min(-100).max(100),
  pricePct: z.number().finite().min(-100).max(100),
  costPct: z.number().finite().min(-100).max(100),
  environmentalYieldPctByCrop: z.record(z.string(), z.number().finite().min(-100).max(100)),
}).strict();

export const NO_FINANCIAL_ADJUSTMENTS: FinancialAdjustments = {
  yieldPct: 0,
  pricePct: 0,
  costPct: 0,
  environmentalYieldPctByCrop: {},
};

export interface FinancialSeason {
  year: number;
  cropIds: string[];
  hasCover: boolean;
  repeated?: boolean;
  unknownCropLabels?: string[];
}

export interface ProjectionYear {
  year: number;
  seasonMissing: boolean;
  repeated: boolean;
  revenue: number | null;
  costs: number | null;
  netReturn: number | null;
  costBreakdown: Partial<Record<FinancialCostCategory | 'aggregate' | 'cash-rent' | 'share-rent' | 'cover' | 'transition', number>>;
  missingInputs: string[];
}

export interface FinancialProjection {
  years: ProjectionYear[];
  totalRevenue: number | null;
  totalCosts: number | null;
  cumulativeNetReturn: number | null;
  yearOneNetReturn: number | null;
  missingInputs: string[];
  complete: boolean;
}

export interface PartialBudget {
  addedRevenue: number;
  reducedCosts: number;
  addedCosts: number;
  reducedRevenue: number;
  netChange: number;
}

function costPerAcre(crop: CropFinancialAssumptions): { amount?: number; breakdown?: Partial<Record<FinancialCostCategory | 'aggregate', number>> } {
  if (crop.costMode === 'total') {
    return crop.totalOperatingCostPerAcre === undefined
      ? {}
      : { amount: crop.totalOperatingCostPerAcre, breakdown: { aggregate: crop.totalOperatingCostPerAcre } };
  }
  const categories = FINANCIAL_COST_CATEGORIES.map(({ id }) => id);
  if (categories.some((id) => crop.costsPerAcre[id] === undefined)) return {};
  const breakdown = crop.costsPerAcre as Record<FinancialCostCategory, number>;
  return { amount: categories.reduce((sum, id) => sum + breakdown[id], 0), breakdown };
}

function addCost(
  breakdown: ProjectionYear['costBreakdown'],
  category: FinancialCostCategory | 'aggregate' | 'cash-rent' | 'share-rent' | 'cover' | 'transition',
  amount: number,
) {
  breakdown[category] = (breakdown[category] ?? 0) + amount;
}

function dollars(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Project only from entered assumptions. Incomplete years have no net-return value. */
export function projectFinancials(options: {
  profile: FinancialProfile;
  acres: number;
  seasons: FinancialSeason[];
  horizon: 3 | 5;
  adjustments?: FinancialAdjustments;
  alternative?: boolean;
}): FinancialProjection {
  const { profile, acres, seasons, horizon, alternative = false } = options;
  financialProfileSchema.parse(profile);
  const adjustments = financialAdjustmentsSchema.parse(options.adjustments ?? NO_FINANCIAL_ADJUSTMENTS);
  if (!Number.isFinite(acres) || acres <= 0) throw new RangeError('Field acreage must be a positive finite number.');

  const startYear = seasons[0]?.year ?? new Date().getFullYear() + 1;
  const missingAll = new Set<string>();
  const years: ProjectionYear[] = [];

  for (let index = 0; index < horizon; index++) {
    const season = seasons[index];
    const year = season?.year ?? startYear + index;
    const missing = new Set<string>();
    const breakdown: ProjectionYear['costBreakdown'] = {};
    let revenue = 0;
    let operatingCosts = 0;
    let revenueComplete = true;
    let costsComplete = true;

    if (!season) {
      missing.add(`${year}: add a season to the plan`);
      missingAll.add(`${year}: add a season to the plan`);
      years.push({
        year,
        seasonMissing: true,
        repeated: false,
        revenue: null,
        costs: null,
        netReturn: null,
        costBreakdown: {},
        missingInputs: [...missing],
      });
      continue;
    }

    for (const cropId of season.cropIds) {
      const crop = profile.crops[cropId];
      const cropLabel = cropId.replaceAll('-', ' ');
      if (!crop) {
        missing.add(`${cropLabel}: yield, price, and operating costs`);
        revenueComplete = false;
        costsComplete = false;
        continue;
      }

      if (crop.yieldPerAcre === undefined) {
        missing.add(`${cropLabel}: yield per acre`);
        revenueComplete = false;
      }
      if (!crop.yieldUnit) {
        missing.add(`${cropLabel}: yield unit`);
        revenueComplete = false;
      }
      if (crop.yieldUnit === 'other' && !crop.yieldUnitLabel?.trim()) {
        missing.add(`${cropLabel}: describe the yield unit`);
        revenueComplete = false;
      }
      if (crop.pricePerUnit === undefined) {
        missing.add(`${cropLabel}: price per ${crop.yieldUnit === 'other' ? crop.yieldUnitLabel || 'unit' : crop.yieldUnit ?? 'unit'}`);
        revenueComplete = false;
      }
      if (crop.yieldPerAcre !== undefined && crop.pricePerUnit !== undefined && crop.yieldUnit) {
        const cropYieldPct = adjustments.yieldPct + (adjustments.environmentalYieldPctByCrop[cropId] ?? 0);
        const yieldFactor = Math.max(0, 1 + cropYieldPct / 100);
        const priceFactor = Math.max(0, 1 + adjustments.pricePct / 100);
        revenue += crop.yieldPerAcre * yieldFactor * crop.pricePerUnit * priceFactor * acres;
      }

      const cropCost = costPerAcre(crop);
      if (cropCost.amount === undefined) {
        missing.add(`${cropLabel}: operating cost per acre`);
        costsComplete = false;
      } else {
        const amount = cropCost.amount * Math.max(0, 1 + adjustments.costPct / 100) * acres;
        operatingCosts += amount;
        for (const [category, cost] of Object.entries(cropCost.breakdown ?? {})) {
          if (cost !== undefined) addCost(breakdown, category as FinancialCostCategory | 'aggregate', cost * Math.max(0, 1 + adjustments.costPct / 100) * acres);
        }
      }
    }

    for (const label of season.unknownCropLabels ?? []) {
      missing.add(`${label}: choose a supported crop in the Planner before projecting`);
      revenueComplete = false;
      costsComplete = false;
    }

    if (profile.landTenure === 'unknown') {
      missing.add('land: choose owned, cash-rented, or share-rented');
      costsComplete = false;
    } else if (profile.landTenure === 'cash-rent') {
      if (profile.cashRentPerAcre === undefined) {
        missing.add('land: cash rent per acre');
        costsComplete = false;
      } else {
        const rent = profile.cashRentPerAcre * acres;
        operatingCosts += rent;
        addCost(breakdown, 'cash-rent', rent);
      }
    } else if (profile.landTenure === 'share-rent') {
      if (profile.shareRentPct === undefined) {
        missing.add('land: share of crop revenue');
        costsComplete = false;
      } else if (!revenueComplete) {
        missing.add('land: crop revenue is needed to calculate share rent');
        costsComplete = false;
      } else {
        const rent = revenue * profile.shareRentPct / 100;
        operatingCosts += rent;
        addCost(breakdown, 'share-rent', rent);
      }
    }

    if (season.hasCover) {
      if (profile.coverCostPerAcre === undefined) {
        missing.add('cover crop: establishment and termination cost per acre');
        costsComplete = false;
      } else {
        const coverCost = profile.coverCostPerAcre * acres;
        operatingCosts += coverCost;
        addCost(breakdown, 'cover', coverCost);
      }
    }

    if (alternative && index === 0) {
      if (profile.transitionCostPerAcre === undefined) {
        missing.add('alternative: one-time transition cost per acre (enter 0 if none)');
        costsComplete = false;
      } else {
        const transition = profile.transitionCostPerAcre * acres;
        operatingCosts += transition;
        addCost(breakdown, 'transition', transition);
      }
    }

    for (const item of missing) missingAll.add(item);
    const complete = missing.size === 0 && revenueComplete && costsComplete;
    const revenueValue = revenueComplete ? dollars(revenue) : null;
    const costValue = costsComplete ? dollars(operatingCosts) : null;
    const netReturn = complete ? dollars(revenue - operatingCosts) : null;
    years.push({
      year,
      seasonMissing: false,
      repeated: !!season.repeated,
      revenue: revenueValue,
      costs: costValue,
      netReturn,
      costBreakdown: complete ? Object.fromEntries(Object.entries(breakdown).map(([key, amount]) => [key, dollars(amount!)])) : {},
      missingInputs: [...missing],
    });
  }

  const complete = years.length === horizon && years.every((year) => year.netReturn !== null);
  const totalRevenue = complete ? years.reduce((sum, year) => sum + year.revenue!, 0) : null;
  const totalCosts = complete ? years.reduce((sum, year) => sum + year.costs!, 0) : null;
  return {
    years,
    totalRevenue,
    totalCosts,
    cumulativeNetReturn: complete ? years.reduce((sum, year) => sum + year.netReturn!, 0) : null,
    yearOneNetReturn: years[0]?.netReturn ?? null,
    missingInputs: [...missingAll],
    complete,
  };
}

export function partialBudget(current: ProjectionYear, proposed: ProjectionYear): PartialBudget | undefined {
  if (current.revenue === null || current.costs === null || proposed.revenue === null || proposed.costs === null) return undefined;
  return {
    addedRevenue: Math.max(0, proposed.revenue - current.revenue),
    reducedCosts: Math.max(0, current.costs - proposed.costs),
    addedCosts: Math.max(0, proposed.costs - current.costs),
    reducedRevenue: Math.max(0, current.revenue - proposed.revenue),
    netChange: proposed.netReturn! - current.netReturn!,
  };
}

/** Percentage change in proposed crop prices needed for its total return to equal the baseline. */
export function breakEvenPriceChangePct(current: FinancialProjection, proposed: FinancialProjection): number | undefined {
  if (current.cumulativeNetReturn === null || proposed.totalRevenue === null || proposed.totalCosts === null || proposed.totalRevenue <= 0) return undefined;
  const requiredRevenue = current.cumulativeNetReturn + proposed.totalCosts;
  return (requiredRevenue / proposed.totalRevenue - 1) * 100;
}
