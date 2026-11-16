/**
 * Every number the finance engine uses, with where it came from. Farmers can override any of them;
 * an override is recorded as "You entered" and always wins over the default.
 * Values were read from the sources on 2026-11-15. See docs/finance-defaults.md.
 */

import { cropName } from '../rotation/agronomy';

export type Origin = 'farmer' | 'default' | 'nasa' | 'import';

export interface SourceRef {
  name: string;
  url?: string;
  date: string;
}

export const SOURCES = {
  isu: { name: 'Iowa State University, Ag Decision Maker A1-20 "Estimated Costs of Crop Production in Iowa – 2026"', url: 'https://www.extension.iastate.edu/agdm/crops/pdf/a1-20.pdf', date: 'Jan 2026' },
  wasde: { name: 'USDA World Agricultural Supply and Demand Estimates (WASDE), 2026/27 season-average farm price', url: 'https://www.usda.gov/oce/commodity/wasde/wasde1126.pdf', date: 'Nov 10, 2026' },
  ersCosts: { name: 'USDA ERS Cost-of-Production Forecasts for Major U.S. Field Crops, 2026F', url: 'https://www.ers.usda.gov/data-products/commodity-costs-and-returns', date: 'Nov 10, 2026' },
  ersReturns: { name: 'USDA ERS Commodity Costs and Returns, U.S. total', url: 'https://www.ers.usda.gov/data-products/commodity-costs-and-returns', date: 'Oct 1, 2026' },
  rent: { name: 'Iowa State University "Cash Rental Rates for Iowa 2026 Survey" (FM 1851), state average', url: 'https://shop.iastate.edu/extension/fm1851.html', date: 'May 2026' },
  eqip: { name: 'Iowa NRCS FY2026 EQIP payment schedule, Cover Crop (340) single species (as summarised by hellogravel.com)', url: 'https://hellogravel.com/incentives/iowa/iowa-nrcs-fy2026-payment-schedule/', date: '2026' },
  oatsPrice: { name: 'USDA NASS Agricultural Prices via Wisconsin Farm Reporter: Wisconsin May 2026 oat price (stand-in; no Iowa price found)', url: 'https://datcp.wi.gov/Documents2/WisconsinFarmReporter202607.pdf', date: 'Jul 2026' },
  fsa: { name: 'USDA Farm Service Agency, Microloans', url: 'https://www.fsa.usda.gov/microloans', date: '2026' },
  idalsCostShare: { name: 'Iowa Department of Agriculture and Land Stewardship, cover crop cost-share sign-up (Water Quality Initiative)', url: 'https://iowaagriculture.gov/news/sign-up-cover-crop-cost-share', date: 'May 13, 2025' },
  idalsInsurance: { name: 'Iowa Department of Agriculture and Land Stewardship, Crop Insurance Discount Program sign-up', url: 'https://iowaagriculture.gov/news/crop-ins-discount-prog-signup-12-25', date: 'Dec 1, 2025' },
  farmer: { name: 'You entered', date: 'in PlotTwist' },
  power: { name: 'NASA POWER monthly weather for this field, 1985–2024', url: 'https://power.larc.nasa.gov/docs/services/api/temporal/monthly/', date: 'fetched live' },
  plottwist: { name: 'PlotTwist planning assumption (not from a published budget)', date: 'Nov 2026' },
} satisfies Record<string, SourceRef>;

/** Cost categories that imported books can calibrate (see lib/import/kinds/finance.ts). */
export const ACTUAL_CATS = ['seed', 'fertilizer', 'chemicals', 'insurance', 'machinery', 'labor', 'other'] as const;
export type ActualCat = (typeof ACTUAL_CATS)[number];
const ACTUAL_LABELS: Record<ActualCat, string> = { seed: 'seed', fertilizer: 'fertilizer and lime', chemicals: 'herbicide and insecticide', insurance: 'crop insurance', machinery: 'machinery, fuel and repairs', labor: 'labor', other: 'miscellaneous costs' };

export type Group = 'Yields and prices' | 'Corn costs' | 'Soybean costs' | 'Small grain costs' | 'Rice costs' | 'Sorghum costs' | 'Cotton costs' | 'Fertilizer prices' | 'Cover crops' | 'Land and money' | 'Programs' | 'Risk' | 'Practices' | 'Your records' | 'Your crop budgets';

export interface Assumption {
  id: string;
  label: string;
  group: Group;
  value: number;
  unit: string;
  source: SourceRef;
  note?: string;
}

const isu = (id: string, label: string, group: Group, value: number, unit: string, note?: string): Assumption => ({ id, label, group, value, unit, source: SOURCES.isu, note });
const planning = (id: string, label: string, group: Group, value: number, unit: string, note?: string): Assumption => ({ id, label, group, value, unit, source: SOURCES.plottwist, note });
const ers = (id: string, label: string, group: Group, value: number, unit: string, note?: string): Assumption => ({ id, label, group, value, unit, source: SOURCES.ersCosts, note });

export const ASSUMPTIONS: Assumption[] = [
  // ---- Yields and prices ----
  isu('corn.yield', 'Corn yield after soybeans', 'Yields and prices', 211, 'bu/ac', 'Middle yield level of the corn-following-soybeans budget (30-year trend).'),
  isu('corn.yieldAfterCorn', 'Corn yield after corn', 'Yields and prices', 193, 'bu/ac', 'Middle yield level of the corn-following-corn budget. The gap is the rotation effect.'),
  { id: 'corn.price', label: 'Corn price', group: 'Yields and prices', value: 4.6, unit: '$/bu', source: SOURCES.wasde, note: 'National season-average farm price, so it already includes a typical local basis.' },
  isu('soybeans.yield', 'Soybean yield', 'Yields and prices', 61, 'bu/ac', 'Middle yield level of the herbicide-tolerant soybeans-following-corn budget.'),
  { id: 'soybeans.price', label: 'Soybean price', group: 'Yields and prices', value: 12.1, unit: '$/bu', source: SOURCES.wasde },
  isu('oats.yield', 'Oat yield', 'Yields and prices', 80, 'bu/ac', 'The oat yield ISU assumes in its oat-companion budget.'),
  { id: 'oats.price', label: 'Oat price', group: 'Yields and prices', value: 3.88, unit: '$/bu', source: SOURCES.oatsPrice },
  isu('oats.strawTons', 'Oat straw', 'Yields and prices', 1, 'ton/ac'),
  planning('oats.strawPrice', 'Oat straw price', 'Yields and prices', 80, '$/ton'),
  planning('wheat.yield', 'Wheat yield', 'Yields and prices', 70, 'bu/ac'),
  { id: 'wheat.price', label: 'Wheat price', group: 'Yields and prices', value: 6.2, unit: '$/bu', source: SOURCES.wasde, note: 'All-wheat season-average farm price.' },
  { id: 'rice.yield', label: 'Rice yield', group: 'Yields and prices', value: 76.64, unit: 'cwt/ac', source: SOURCES.wasde, note: '7,664 pounds per harvested acre, converted to hundredweight.' },
  { id: 'rice.price', label: 'Rice price', group: 'Yields and prices', value: 15.1, unit: '$/cwt', source: SOURCES.wasde, note: 'All-rice season-average farm price.' },
  { id: 'sorghum.yield', label: 'Sorghum yield', group: 'Yields and prices', value: 52.4, unit: 'bu/ac', source: SOURCES.wasde },
  { id: 'sorghum.price', label: 'Sorghum price', group: 'Yields and prices', value: 4.45, unit: '$/bu', source: SOURCES.wasde },
  { id: 'sorghum.secondaryRevenue', label: 'Sorghum grazing and silage value', group: 'Yields and prices', value: 7.5, unit: '$/ac', source: SOURCES.ersReturns },
  { id: 'cotton.yield', label: 'Cotton lint yield', group: 'Yields and prices', value: 775, unit: 'lb/ac', source: SOURCES.wasde },
  { id: 'cotton.price', label: 'Cotton lint price', group: 'Yields and prices', value: 0.76, unit: '$/lb', source: SOURCES.wasde },
  { id: 'cotton.seedYield', label: 'Cottonseed yield', group: 'Yields and prices', value: 1492, unit: 'lb/ac', source: SOURCES.ersReturns },
  { id: 'cotton.seedPrice', label: 'Cottonseed price', group: 'Yields and prices', value: 0.12, unit: '$/lb', source: SOURCES.ersReturns },
  { id: 'basis', label: 'Local basis adjustment', group: 'Yields and prices', value: 0, unit: '$/bu', source: SOURCES.wasde, note: 'Zero because the USDA price is already a farm price. Enter your elevator’s difference from it.' },

  // ---- Fertilizer prices (ISU 2026) ----
  isu('n.price', 'Nitrogen price', 'Fertilizer prices', 0.53, '$/lb N'),
  isu('p.price', 'Phosphate price', 'Fertilizer prices', 0.72, '$/lb P₂O₅'),
  isu('k.price', 'Potash price', 'Fertilizer prices', 0.39, '$/lb K₂O'),

  // ---- Corn costs (ISU corn following soybeans, 211 bu column, unless noted) ----
  isu('corn.seed', 'Corn seed', 'Corn costs', 113.7, '$/ac', '30,000 kernels at $3.79 per 1,000.'),
  isu('corn.nLbs', 'Nitrogen for corn after soybeans', 'Corn costs', 159, 'lb N/ac'),
  isu('corn.nLbsAfterCorn', 'Nitrogen for corn after corn', 'Corn costs', 194, 'lb N/ac'),
  isu('corn.pLbs', 'Phosphate for corn', 'Corn costs', 79, 'lb/ac'),
  isu('corn.kLbs', 'Potash for corn', 'Corn costs', 63, 'lb/ac'),
  isu('corn.lime', 'Lime (yearly)', 'Corn costs', 3.72, '$/ac'),
  isu('corn.herbicide', 'Corn herbicide', 'Corn costs', 56, '$/ac'),
  isu('corn.insecticideAfterCorn', 'Insecticide, corn after corn only', 'Corn costs', 25, '$/ac'),
  isu('corn.insurance', 'Corn crop insurance', 'Corn costs', 17.1, '$/ac', 'Revenue protection, 80% coverage.'),
  isu('corn.misc', 'Corn miscellaneous', 'Corn costs', 13.7, '$/ac'),
  isu('corn.machineryPre', 'Corn machinery before harvest', 'Corn costs', 59.4, '$/ac', 'Fixed $34.80 + variable $24.60.'),
  isu('corn.machineryHarvest', 'Corn harvest, drying, hauling and handling', 'Corn costs', 136.97, '$/ac', 'Fixed $67.56 + variable $69.41, including LP-gas drying.'),
  isu('corn.labor', 'Corn labor', 'Corn costs', 52.02, '$/ac', '2.55 hours at $20.40.'),
  isu('corn.pLbsAfterCorn', 'Phosphate for corn after corn', 'Corn costs', 72, 'lb/ac'),
  isu('corn.kLbsAfterCorn', 'Potash for corn after corn', 'Corn costs', 58, 'lb/ac'),
  isu('corn.machineryPreAfterCorn', 'Corn-after-corn machinery before harvest', 'Corn costs', 71.3, '$/ac', 'Adds chisel plowing: fixed $41.20 + variable $30.10.'),
  isu('corn.machineryHarvestAfterCorn', 'Corn-after-corn harvest, drying, hauling and handling', 'Corn costs', 129.36, '$/ac', 'Fixed $64.71 + variable $64.65.'),
  isu('corn.laborAfterCorn', 'Corn-after-corn labor', 'Corn costs', 57.12, '$/ac', '2.80 hours at $20.40.'),

  // ---- Soybean costs (ISU HT soybeans following corn, 61 bu column) ----
  isu('soybeans.seed', 'Soybean seed', 'Soybean costs', 63.1, '$/ac', '140,000 seeds.'),
  isu('soybeans.pLbs', 'Phosphate for soybeans', 'Soybean costs', 49, 'lb/ac'),
  isu('soybeans.kLbs', 'Potash for soybeans', 'Soybean costs', 92, 'lb/ac'),
  isu('soybeans.lime', 'Lime (yearly)', 'Soybean costs', 3.72, '$/ac'),
  isu('soybeans.herbicide', 'Soybean herbicide', 'Soybean costs', 75, '$/ac'),
  isu('soybeans.insurance', 'Soybean crop insurance', 'Soybean costs', 9.1, '$/ac'),
  isu('soybeans.misc', 'Soybean miscellaneous', 'Soybean costs', 13.7, '$/ac'),
  isu('soybeans.machineryPre', 'Soybean machinery before harvest', 'Soybean costs', 64.2, '$/ac', 'Fixed $37.60 + variable $26.60.'),
  isu('soybeans.machineryHarvest', 'Soybean harvest and hauling', 'Soybean costs', 47.18, '$/ac', 'Fixed $32.42 + variable $14.76.'),
  isu('soybeans.labor', 'Soybean labor', 'Soybean costs', 44.88, '$/ac', '2.20 hours at $20.40.'),

  // ---- Small grains (partly ISU oat-companion budget; the rest are assumptions) ----
  isu('oats.seed', 'Oat seed', 'Small grain costs', 35.18, '$/ac', '2 bushels.'),
  isu('oats.nLbs', 'Nitrogen for oats', 'Small grain costs', 60, 'lb N/ac'),
  planning('oats.pLbs', 'Phosphate for oats', 'Small grain costs', 25, 'lb/ac', 'About what an 80 bu crop removes.'),
  planning('oats.kLbs', 'Potash for oats (grain and straw)', 'Small grain costs', 45, 'lb/ac'),
  planning('oats.herbicide', 'Small grain herbicide', 'Small grain costs', 15, '$/ac'),
  isu('oats.insurance', 'Oat crop insurance', 'Small grain costs', 4.1, '$/ac', '70% yield coverage.'),
  { id: 'oats.machineryPre', label: 'Small grain machinery before harvest', group: 'Small grain costs', value: 35.3, unit: '$/ac', source: SOURCES.isu, note: 'Spreading, disking and drilling in the oat-companion budget.' },
  { id: 'oats.machineryHarvest', label: 'Small grain combining and hauling', group: 'Small grain costs', value: 41.31, unit: '$/ac', source: SOURCES.isu },
  planning('oats.strawCost', 'Baling and hauling straw', 'Small grain costs', 30, '$/ac'),
  planning('oats.labor', 'Small grain labor', 'Small grain costs', 40.8, '$/ac', '2 hours at $20.40.'),
  planning('wheat.seed', 'Wheat seed', 'Small grain costs', 45, '$/ac'),
  planning('wheat.nLbs', 'Nitrogen for wheat', 'Small grain costs', 90, 'lb N/ac'),

  // ---- Rice, sorghum and cotton (USDA ERS 2026F U.S. budgets, excluding opportunity cost of land) ----
  ers('rice.seed', 'Rice seed', 'Rice costs', 119.14, '$/ac'),
  planning('rice.nLbs', 'Nitrogen for rice', 'Rice costs', 130, 'lb N/ac', 'Planning rate; replace with the field rate when known.'),
  ers('rice.fertilizerOther', 'Rice fertilizer other than nitrogen', 'Rice costs', 156.11, '$/ac', 'Residual that makes fertilizer total $225.01/ac at the default nitrogen price.'),
  ers('rice.chemicals', 'Rice chemicals', 'Rice costs', 121.69, '$/ac'),
  ers('rice.machinery', 'Rice machinery, fuel, repairs and custom work', 'Rice costs', 576.46, '$/ac'),
  ers('rice.labor', 'Rice paid and unpaid labor', 'Rice costs', 77.92, '$/ac'),
  ers('rice.insurance', 'Rice taxes and insurance', 'Rice costs', 27.16, '$/ac'),
  ers('rice.interest', 'Rice operating interest', 'Rice costs', 15.84, '$/ac'),
  ers('rice.other', 'Rice other variable and farm overhead', 'Rice costs', 73.2, '$/ac'),

  ers('sorghum.seed', 'Sorghum seed', 'Sorghum costs', 16.6, '$/ac'),
  planning('sorghum.nLbs', 'Nitrogen for sorghum', 'Sorghum costs', 80, 'lb N/ac', 'Planning rate; replace with the field rate when known.'),
  ers('sorghum.fertilizerOther', 'Sorghum fertilizer other than nitrogen', 'Sorghum costs', 28.67, '$/ac', 'Residual that makes fertilizer total $71.07/ac at the default nitrogen price.'),
  ers('sorghum.chemicals', 'Sorghum chemicals', 'Sorghum costs', 30.87, '$/ac'),
  ers('sorghum.machinery', 'Sorghum machinery, fuel, repairs and custom work', 'Sorghum costs', 222.27, '$/ac'),
  ers('sorghum.labor', 'Sorghum paid and unpaid labor', 'Sorghum costs', 27.63, '$/ac'),
  ers('sorghum.insurance', 'Sorghum taxes and insurance', 'Sorghum costs', 14.11, '$/ac'),
  ers('sorghum.interest', 'Sorghum operating interest', 'Sorghum costs', 3.63, '$/ac'),
  ers('sorghum.other', 'Sorghum other variable and farm overhead', 'Sorghum costs', 19.45, '$/ac'),

  ers('cotton.seed', 'Cotton seed', 'Cotton costs', 100.06, '$/ac'),
  planning('cotton.nLbs', 'Nitrogen for cotton', 'Cotton costs', 90, 'lb N/ac', 'Planning rate; replace with the field rate when known.'),
  ers('cotton.fertilizerOther', 'Cotton fertilizer other than nitrogen', 'Cotton costs', 76.17, '$/ac', 'Residual that makes fertilizer total $123.87/ac at the default nitrogen price.'),
  ers('cotton.chemicals', 'Cotton chemicals', 'Cotton costs', 80.81, '$/ac'),
  ers('cotton.machinery', 'Cotton machinery, fuel, repairs and custom work', 'Cotton costs', 352.39, '$/ac'),
  ers('cotton.labor', 'Cotton paid and unpaid labor', 'Cotton costs', 55.45, '$/ac'),
  ers('cotton.insurance', 'Cotton taxes and insurance', 'Cotton costs', 12.62, '$/ac'),
  ers('cotton.interest', 'Cotton operating interest', 'Cotton costs', 10.76, '$/ac'),
  ers('cotton.other', 'Cotton ginning, other variable and farm overhead', 'Cotton costs', 137.58, '$/ac'),

  // ---- Cover crops ----
  planning('cover.seed', 'Cover crop seed (cereal rye)', 'Cover crops', 18, '$/ac', 'About 1 bushel of rye seed.'),
  planning('cover.legumeSeedExtra', 'Extra seed cost for a legume cover', 'Cover crops', 20, '$/ac'),
  planning('cover.planting', 'Seeding the cover (drill)', 'Cover crops', 16.5, '$/ac'),
  planning('cover.termination', 'Ending the cover (herbicide and pass)', 'Cover crops', 12, '$/ac'),
  planning('cover.ryeCornDrag', 'Corn yield drag after cereal rye', 'Cover crops', 2, '%'),
  planning('cover.legumeNCredit', 'Nitrogen credit from a legume cover before corn', 'Cover crops', 40, 'lb N/ac'),
  // Farmer-entered only: read only when set.
  { id: 'cover.grazing', label: 'Cover crop grazing or forage value', group: 'Cover crops', value: 0, unit: '$/ac', source: SOURCES.farmer, note: 'What grazing or harvesting the cover is worth to you (feed saved or forage sold). Leave empty if you don’t use it.' },

  // ---- Land and money ----
  { id: 'rent', label: 'Cash rent', group: 'Land and money', value: 270, unit: '$/ac', source: SOURCES.rent },
  isu('interest.rate', 'Operating loan interest rate', 'Land and money', 7.47, '%', 'Charged on pre-harvest costs for 8 months.'),
  isu('interest.months', 'Months of operating interest', 'Land and money', 8, 'months'),

  // ---- Programs ----
  { id: 'eqip.cover', label: 'EQIP cost share for a cover crop', group: 'Programs', value: 74.34, unit: '$/ac/yr', source: SOURCES.eqip },
  { id: 'eqip.coverBeginning', label: 'EQIP cover crop rate for beginning farmers', group: 'Programs', value: 89.2, unit: '$/ac/yr', source: SOURCES.eqip, note: 'Historically underserved rate, which includes beginning farmers.' },
  planning('eqip.years', 'Years of EQIP cover crop payments', 'Programs', 3, 'years'),
  { id: 'fsa.microloan', label: 'FSA microloan limit', group: 'Programs', value: 50000, unit: '$', source: SOURCES.fsa },
  { id: 'state.coverFirstTime', label: 'Iowa cost share, first-time cover crop user', group: 'Programs', value: 30, unit: '$/ac', source: SOURCES.idalsCostShare, note: '2025 statewide rate; check the 2026 rate with your Soil and Water Conservation District.' },
  { id: 'state.coverReturning', label: 'Iowa cost share, returning cover crop user', group: 'Programs', value: 20, unit: '$/ac', source: SOURCES.idalsCostShare, note: '2025 statewide rate; check the 2026 rate with your Soil and Water Conservation District.' },
  { id: 'state.maxAcres', label: 'Iowa cost share acre limit per farmer', group: 'Programs', value: 160, unit: 'ac/yr', source: SOURCES.idalsCostShare },
  { id: 'insurance.coverDiscount', label: 'Iowa crop insurance discount for fall cover crops', group: 'Programs', value: 5, unit: '$/ac', source: SOURCES.idalsInsurance, note: 'Taken off the next year’s premium. Acres in other IDALS or NRCS cost share don’t qualify; no acreage cap.' },
  // Farmer-entered only (no published per-acre value): read only when set.
  { id: 'csp.annual', label: 'CSP contract payment per year', group: 'Programs', value: 0, unit: '$/yr', source: SOURCES.farmer, note: 'From your Conservation Stewardship Program contract, for a new contract that comes with the PlotTwist plan.' },
  { id: 'csp.years', label: 'CSP contract years left', group: 'Programs', value: 0, unit: 'years', source: SOURCES.farmer, note: 'Leave empty to count the payment in every plan year.' },

  // ---- Risk ----
  planning('risk.cornLoss', 'Corn yield loss in a stress year', 'Risk', 20, '%'),
  planning('risk.soybeansLoss', 'Soybean yield loss in a stress year', 'Risk', 15, '%'),
  planning('risk.smallGrainLoss', 'Small grain yield loss in a stress year', 'Risk', 15, '%'),
  planning('risk.goodYearGain', 'Yield gain in a good year', 'Risk', 6, '%'),

  // ---- Practices (Simulator) ----
  planning('practice.reducedTillMachinery', 'Pre-harvest machinery saved with reduced tillage', 'Practices', 15, '%'),
  planning('practice.noTillMachinery', 'Pre-harvest machinery saved with no-till', 'Practices', 30, '%'),
  planning('practice.irrigatedYield', 'Yield gain from irrigation', 'Practices', 12, '%'),
  planning('practice.irrigatedCost', 'Irrigation pumping and upkeep', 'Practices', 55, '$/ac'),

  // ---- Your records: multipliers set only from imported books (1 = use the budget as is) ----
  ...ACTUAL_CATS.map((cat) => ({
    id: `actual.${cat}`,
    label: `Your actual ${ACTUAL_LABELS[cat]} vs the budget`,
    group: 'Your records' as Group,
    value: 1,
    unit: '×',
    source: SOURCES.plottwist,
    note: 'Set only from imported finance records: what you actually spent last year divided by what PlotTwist modeled for the same fields and crops.',
  })),
];

export const ASSUMPTION_BY_ID: Record<string, Assumption> = Object.fromEntries(ASSUMPTIONS.map((a) => [a.id, a]));

/** own.<crop id>.yield|price|cost: the farmer's budget for a crop with no published one (see budget.ts). */
const OWN_ID = /^own\.(.+)\.(yield|price|cost)$/;
const OWN_LABELS = { yield: ['yield', 'units/ac'], price: ['price', '$/unit'], cost: ['operating costs', '$/ac'] } as const;

/** The assumption behind an id, including the farmer's own crop budgets, which have no default. */
export function assumptionFor(id: string): Assumption | undefined {
  const a = ASSUMPTION_BY_ID[id];
  if (a) return a;
  const m = OWN_ID.exec(id);
  if (!m) return undefined;
  const [label, unit] = OWN_LABELS[m[2] as keyof typeof OWN_LABELS];
  return { id, label: `${cropName(m[1])} ${label}`, group: 'Your crop budgets', value: 0, unit, source: { name: 'You entered', date: 'in PlotTwist' } };
}

export interface Resolved {
  value: number;
  origin: Origin;
  assumption: Assumption;
}

/**
 * Look up values by id, preferring the farmer's overrides. Records which ids were read,
 * so every result can report the assumptions behind it and how confident it is.
 */
export class Params {
  readonly used = new Set<string>();
  constructor(
    private overrides: Record<string, number> = {},
    private origins: Record<string, Origin> = {},
    /** Where imported values came from ("Your records: yield-2025.csv"). */
    private sources: Record<string, SourceRef> = {},
  ) {}

  get(id: string): number {
    const a = assumptionFor(id);
    if (!a) throw new Error(`Unknown finance assumption: ${id}`);
    this.used.add(id);
    const o = this.overrides[id];
    return typeof o === 'number' && Number.isFinite(o) ? o : a.value;
  }

  /** True when the value is not the default. Does not mark the id as used. */
  has(id: string): boolean {
    const o = this.overrides[id];
    return typeof o === 'number' && Number.isFinite(o);
  }

  resolve(id: string): Resolved {
    const a = assumptionFor(id)!;
    const o = this.overrides[id];
    const has = typeof o === 'number' && Number.isFinite(o);
    return { value: has ? o : a.value, origin: has ? (this.origins[id] ?? 'farmer') : 'default', assumption: a };
  }

  /** The farmer's own crop budget ids for one kind of number, e.g. every own.<crop>.price they entered. */
  ownIds(kind: 'yield' | 'price' | 'cost'): string[] {
    return Object.keys(this.overrides).filter((id) => this.has(id) && OWN_ID.exec(id)?.[2] === kind);
  }

  /** Source to show for a value: the published default, the farmer, or the imported file. */
  sourceOf(id: string): SourceRef {
    const r = this.resolve(id);
    if (r.origin === 'default') return r.assumption.source;
    if (r.origin === 'import') return this.sources[id] ?? { name: 'Your records', date: 'imported' };
    return { name: 'You entered', date: 'in PlotTwist' };
  }

  /** A copy with some values replaced (for sensitivity runs); does not affect `used`. */
  with(patch: Record<string, number>): Params {
    const p = new Params({ ...this.overrides, ...patch }, this.origins, this.sources);
    return p;
  }

  isFarmer(id: string): boolean {
    return this.resolve(id).origin !== 'default';
  }
}
