import { cropName } from '../rotation/agronomy';
import { ACTUAL_CATS, type Params } from './assumptions';

/**
 * Per-acre budget for one season on one field, built from the ISU 2026 budgets and the farmer's overrides.
 * Each cost is tagged with a category and the season of the year the money goes out, for the cash-flow view.
 */

export type CropKey = 'corn' | 'soybeans' | 'oats' | 'wheat';
export type CostCat = 'seed' | 'fertilizer' | 'chemicals' | 'insurance' | 'machinery' | 'labor' | 'interest' | 'land' | 'cover' | 'irrigation' | 'other';
export type Season = 'spring' | 'summer' | 'fall' | 'winter';

export const COST_LABELS: Record<CostCat, string> = {
  seed: 'Seed',
  fertilizer: 'Fertilizer and lime',
  chemicals: 'Herbicide and insecticide',
  insurance: 'Crop insurance',
  machinery: 'Fuel, repairs and machinery (incl. drying and hauling)',
  labor: 'Labor',
  interest: 'Operating loan interest',
  land: 'Land (rent)',
  cover: 'Cover crop seed, seeding and ending',
  irrigation: 'Irrigation',
  other: 'Miscellaneous',
};

export const OPERATING_CATS: CostCat[] = ['seed', 'fertilizer', 'chemicals', 'insurance', 'machinery', 'labor', 'interest', 'cover', 'irrigation', 'other'];

export function cropKeyOf(id: string): CropKey | null {
  if (id === 'corn') return 'corn';
  if (id === 'soybeans') return 'soybeans';
  if (['oats', 'barley', 'rye', 'triticale'].includes(id)) return 'oats';
  if (['winter-wheat', 'spring-wheat', 'durum-wheat'].includes(id)) return 'wheat';
  return null;
}

export interface PlanCoverCrop {
  id: string;
  name: string;
  legume: boolean;
  winterKills: boolean;
}

/** One season of a plan, in the engine's terms: cash crop ids (one, or two for a double crop) and an optional cover after them. */
export interface SeasonPlan {
  year: number;
  crops: string[];
  cover?: PlanCoverCrop;
}

export type Tenure = 'own' | 'cash' | 'share';
export type Tillage = 'conventional' | 'reduced' | 'no-till';

export interface FieldSetup {
  acres: number;
  tenure: Tenure;
  rentPerAcre?: number;
  /** Landlord's share of the crop under share rent, %. */
  sharePct?: number;
  irrigated: boolean;
  tillage?: Tillage;
  /** Simulator: the farmer's own nitrogen rate for corn, lb N/ac. */
  nRateCorn?: number;
}

export interface WeatherYear {
  stressed: Set<CropKey>;
  good: Set<CropKey>;
}

export interface BudgetItem {
  cat: CostCat;
  season: Season;
  amount: number;
}

export interface CropYield {
  crop: string;
  key: CropKey | null;
  bu: number;
  price: number;
}

export interface SeasonBudget {
  year: number;
  /** $/ac by crop name (and "Oat straw"). */
  revenueBy: Record<string, number>;
  /** When each revenue line is received. */
  revenueSeason: Record<string, Season>;
  revenue: number;
  items: BudgetItem[];
  costs: Record<CostCat, number>;
  totalCost: number;
  net: number;
  /** Commercial nitrogen applied, lb N/ac. */
  nLbs: number;
  yields: CropYield[];
  coverAcres: number;
  /** Crops with no budget (kept at land cost only and flagged). */
  unmodeled: string[];
}

const VARIABLE_SHARE_OF_PRE_MACHINERY = 0.41; // ISU: variable $24.60 of $59.40 for corn, $26.60 of $64.20 for soybeans

export function emptyCosts(): Record<CostCat, number> {
  return { seed: 0, fertilizer: 0, chemicals: 0, insurance: 0, machinery: 0, labor: 0, interest: 0, land: 0, cover: 0, irrigation: 0, other: 0 };
}

export function seasonBudget(season: SeasonPlan, prev: SeasonPlan | undefined, setup: FieldSetup, P: Params, weather?: WeatherYear): SeasonBudget {
  const items: BudgetItem[] = [];
  // Imported books can scale a whole category to what the farmer actually spent (actual.<cat>, default ×1).
  // Only read when set, so unused multipliers don't show up in the transparency table.
  const actual = (cat: CostCat) => ((ACTUAL_CATS as readonly string[]).includes(cat) && P.has(`actual.${cat}`) ? P.get(`actual.${cat}`) : 1);
  const add = (cat: CostCat, seasonOfYear: Season, amount: number) => amount && items.push({ cat, season: seasonOfYear, amount: amount * actual(cat) });
  const revenueBy: Record<string, number> = {};
  const revenueSeason: Record<string, Season> = {};
  const yields: CropYield[] = [];
  const unmodeled: string[] = [];
  let nLbs = 0;
  const basis = P.get('basis');
  const tillageFactor = setup.tillage === 'no-till' ? 1 - P.get('practice.noTillMachinery') / 100 : setup.tillage === 'reduced' ? 1 - P.get('practice.reducedTillMachinery') / 100 : 1;
  const irrigatedGain = setup.irrigated ? P.get('practice.irrigatedYield') / 100 : 0;
  const prevCorn = prev?.crops.includes('corn') ?? false;
  const prevCover = prev?.cover;

  season.crops.forEach((id, idx) => {
    const key = cropKeyOf(id);
    const second = idx > 0; // second crop of a double crop: no extra land, lower yield
    if (id === 'fallow') return;
    if (!key) {
      unmodeled.push(cropName(id));
      return;
    }
    let yieldBu = 0;
    let price = P.get(`${key}.price`) + basis;
    const weatherFactor = weather ? (weather.stressed.has(key) ? 1 - P.get(key === 'corn' ? 'risk.cornLoss' : key === 'soybeans' ? 'risk.soybeansLoss' : 'risk.smallGrainLoss') / 100 : weather.good.has(key) ? 1 + P.get('risk.goodYearGain') / 100 : 1) : 1;
    let preInputs = 0;

    if (key === 'corn') {
      const afterCorn = prevCorn || (second && season.crops[0] === 'corn');
      yieldBu = P.get(afterCorn ? 'corn.yieldAfterCorn' : 'corn.yield');
      if (prevCover && !prevCover.legume && !prevCover.winterKills) yieldBu *= 1 - P.get('cover.ryeCornDrag') / 100;
      let n = setup.nRateCorn ?? P.get(afterCorn ? 'corn.nLbsAfterCorn' : 'corn.nLbs');
      if (setup.nRateCorn === undefined && prevCover?.legume) n = Math.max(0, n - P.get('cover.legumeNCredit'));
      nLbs += n;
      const seed = P.get('corn.seed');
      const fert = n * P.get('n.price') + P.get(afterCorn ? 'corn.pLbsAfterCorn' : 'corn.pLbs') * P.get('p.price') + P.get(afterCorn ? 'corn.kLbsAfterCorn' : 'corn.kLbs') * P.get('k.price') + P.get('corn.lime');
      const pre = P.get(afterCorn ? 'corn.machineryPreAfterCorn' : 'corn.machineryPre') * tillageFactor;
      const chem = P.get('corn.herbicide') + (afterCorn ? P.get('corn.insecticideAfterCorn') : 0);
      add('seed', 'spring', seed);
      add('fertilizer', 'spring', fert);
      add('chemicals', 'spring', chem);
      add('insurance', 'summer', P.get('corn.insurance'));
      add('other', 'summer', P.get('corn.misc'));
      add('machinery', 'spring', pre);
      add('machinery', 'fall', P.get(afterCorn ? 'corn.machineryHarvestAfterCorn' : 'corn.machineryHarvest'));
      add('labor', 'summer', P.get(afterCorn ? 'corn.laborAfterCorn' : 'corn.labor'));
      preInputs = seed + fert + chem + P.get('corn.insurance') + P.get('corn.misc') + pre * VARIABLE_SHARE_OF_PRE_MACHINERY;
    } else if (key === 'soybeans') {
      yieldBu = P.get('soybeans.yield') * (second ? 0.75 : 1);
      const seed = P.get('soybeans.seed');
      const fert = P.get('soybeans.pLbs') * P.get('p.price') + P.get('soybeans.kLbs') * P.get('k.price') + P.get('soybeans.lime');
      add('seed', 'spring', seed);
      add('fertilizer', 'spring', fert);
      add('chemicals', 'spring', P.get('soybeans.herbicide'));
      add('insurance', 'summer', P.get('soybeans.insurance'));
      add('other', 'summer', P.get('soybeans.misc'));
      add('machinery', 'spring', P.get('soybeans.machineryPre') * tillageFactor);
      add('machinery', 'fall', P.get('soybeans.machineryHarvest'));
      add('labor', 'summer', P.get('soybeans.labor'));
      preInputs = seed + fert + P.get('soybeans.herbicide') + P.get('soybeans.insurance') + P.get('soybeans.misc') + P.get('soybeans.machineryPre') * tillageFactor * VARIABLE_SHARE_OF_PRE_MACHINERY;
    } else {
      // Small grains: oats budget; wheat swaps in its own yield, price, seed and nitrogen.
      const wheat = key === 'wheat';
      yieldBu = P.get(wheat ? 'wheat.yield' : 'oats.yield');
      price = P.get(wheat ? 'wheat.price' : 'oats.price') + basis;
      const n = P.get(wheat ? 'wheat.nLbs' : 'oats.nLbs');
      nLbs += n;
      const seed = P.get(wheat ? 'wheat.seed' : 'oats.seed');
      const fert = n * P.get('n.price') + P.get('oats.pLbs') * P.get('p.price') + P.get('oats.kLbs') * P.get('k.price');
      const fallSown = id === 'winter-wheat' || id === 'rye' || id === 'triticale';
      add('seed', fallSown ? 'fall' : 'spring', seed);
      add('fertilizer', 'spring', fert);
      add('chemicals', 'spring', P.get('oats.herbicide'));
      add('insurance', 'summer', P.get('oats.insurance'));
      add('machinery', fallSown ? 'fall' : 'spring', P.get('oats.machineryPre') * tillageFactor);
      add('machinery', 'summer', P.get('oats.machineryHarvest'));
      add('labor', 'summer', P.get('oats.labor'));
      if (!wheat) {
        const straw = P.get('oats.strawTons') * P.get('oats.strawPrice') * weatherFactor;
        revenueBy['Oat straw'] = (revenueBy['Oat straw'] ?? 0) + straw;
        revenueSeason['Oat straw'] = 'summer';
        add('machinery', 'summer', P.get('oats.strawCost'));
      }
      preInputs = seed + fert + P.get('oats.herbicide') + P.get('oats.insurance') + P.get('oats.machineryPre') * tillageFactor * VARIABLE_SHARE_OF_PRE_MACHINERY;
    }

    yieldBu *= weatherFactor * (1 + irrigatedGain);
    const rate = P.get('interest.rate') / 100;
    add('interest', 'fall', preInputs * rate * (P.get('interest.months') / 12));
    const name = cropName(id);
    revenueBy[name] = (revenueBy[name] ?? 0) + yieldBu * price;
    revenueSeason[name] = key === 'oats' || key === 'wheat' ? 'summer' : 'fall';
    yields.push({ crop: id, key, bu: Math.round(yieldBu * 10) / 10, price });
  });

  // Cover crop seeded after this season's cash crop (ended next spring unless winter kills it).
  let coverAcres = 0;
  if (season.cover) {
    coverAcres = 1;
    add('cover', 'fall', P.get('cover.seed') + (season.cover.legume ? P.get('cover.legumeSeedExtra') : 0) + P.get('cover.planting'));
    if (!season.cover.winterKills) add('cover', 'spring', P.get('cover.termination'));
  }
  if (setup.irrigated && yields.length) add('irrigation', 'summer', P.get('practice.irrigatedCost'));

  // Land.
  if (setup.tenure === 'cash') {
    const rent = setup.rentPerAcre ?? P.get('rent');
    add('land', 'spring', rent / 2);
    add('land', 'fall', rent / 2);
  }
  let revenue = Object.values(revenueBy).reduce((s, v) => s + v, 0);
  if (setup.tenure === 'share') {
    // The landlord takes a share of the crop and pays the same share of seed, fertilizer and chemicals.
    const share = (setup.sharePct ?? 50) / 100;
    revenue *= 1 - share;
    for (const k of Object.keys(revenueBy)) revenueBy[k] *= 1 - share;
    for (const it of items) if (it.cat === 'seed' || it.cat === 'fertilizer' || it.cat === 'chemicals') it.amount *= 1 - share;
  }

  const costs = emptyCosts();
  for (const it of items) costs[it.cat] += it.amount;
  const totalCost = Object.values(costs).reduce((s, v) => s + v, 0);
  return { year: season.year, revenueBy, revenueSeason, revenue, items, costs, totalCost, net: revenue - totalCost, nLbs, yields, coverAcres, unmodeled };
}
