import type { ProductType } from './types';

/**
 * Product recognition and unit math for invoices and machine logs. Densities and analyses are standard
 * label values (UAN 28% ≈ 10.67 lb/gal, UAN 32% ≈ 11.06 lb/gal, 10-34-0 ≈ 11.65 lb/gal). See docs/imports.md.
 */
export interface ProductInfo {
  type: ProductType;
  /** N-P2O5-K2O, %. */
  analysis?: [number, number, number];
  /** Pounds per gallon for liquids. */
  lbsPerGal?: number;
  name: string;
}

const FERT: Array<[RegExp, ProductInfo]> = [
  [/anhydrous|\bnh3\b|82-0-0/i, { type: 'n-fertilizer', analysis: [82, 0, 0], name: 'Anhydrous ammonia' }],
  [/\buan\s*32\b|32%\s*(uan|n)|32-0-0/i, { type: 'n-fertilizer', analysis: [32, 0, 0], lbsPerGal: 11.06, name: 'UAN 32%' }],
  [/\buan\b|28%\s*(uan|n)|28-0-0/i, { type: 'n-fertilizer', analysis: [28, 0, 0], lbsPerGal: 10.67, name: 'UAN 28%' }],
  [/\burea\b|46-0-0/i, { type: 'n-fertilizer', analysis: [46, 0, 0], name: 'Urea' }],
  [/\besn\b|44-0-0/i, { type: 'n-fertilizer', analysis: [44, 0, 0], name: 'ESN (polymer-coated urea)' }],
  [/ammonium\s*sulfate|\bams\b|21-0-0/i, { type: 'n-fertilizer', analysis: [21, 0, 0], name: 'Ammonium sulfate' }],
  [/\bdap\b|diammonium|18-46-0/i, { type: 'p-fertilizer', analysis: [18, 46, 0], name: 'DAP' }],
  [/\bmap\b|monoammonium|11-52-0/i, { type: 'p-fertilizer', analysis: [11, 52, 0], name: 'MAP' }],
  [/10-34-0|\bapp\b|ammonium\s*polyphosphate/i, { type: 'p-fertilizer', analysis: [10, 34, 0], lbsPerGal: 11.65, name: 'Ammonium polyphosphate 10-34-0' }],
  [/potash|muriate|\bmop\b|\bkcl\b|0-0-60|0-0-62/i, { type: 'k-fertilizer', analysis: [0, 0, 60], name: 'Potash (0-0-60)' }],
  [/\blime\b|aglime|calcium\s*carbonate/i, { type: 'lime', name: 'Lime' }],
];

const OTHER: Array<[RegExp, ProductType]> = [
  [/seed\s*corn|corn\s*seed|\bhybrid\b|\bdkc\b|\bp\d{4}\b|pioneer.*\d{4}|\bdekalb\b|\bchannel\b.*\d{3}|corn.*\b80k\b|\b80,?000\b/i, 'seed-corn'],
  [/soy\w*\s*seed|seed\s*soy|\bxtend|\benlist\b|\bag\d{2}x\d|\bp\d{2}a\d|\b140k\b|\b140,?000\b|soybean/i, 'seed-soybeans'],
  [/(oat|wheat|barley|rye|triticale).*(seed|bu\b)|seed\s*(oat|wheat)/i, 'seed-small-grain'],
  [/cover\s*crop|cereal\s*rye\s*seed|radish|clover\s*seed|vetch/i, 'seed-cover'],
  [/glyphosate|roundup|atrazine|dicamba|2,?4-d|liberty|glufosinate|acetochlor|metolachlor|dual|harness|warrant|callisto|mesotrione|lumax|acuron|resicore|verdict|zidua|enlist\s*one|engenia|xtendimax|fierce|authority|sencor|herbicide/i, 'herbicide'],
  [/insecticide|bifenthrin|lambda|warrior|force\b|aztec|counter|capture|hero\b/i, 'insecticide'],
  [/fungicide|headline|trivapro|delaro|miravis|veltyma|quilt|stratego|priaxor/i, 'fungicide'],
  [/diesel|gasoline|\bfuel\b|\bdef\b|\bpropane\b|\blp\b/i, 'fuel'],
];

/** Recognise a product from its name. Unknown names are 'other'. Blends like "11-52-0" are read from the analysis. */
export function productInfo(name: string): ProductInfo {
  for (const [re, info] of FERT) if (re.test(name)) return info;
  for (const [re, type] of OTHER) if (re.test(name)) return { type, name };
  const blend = name.match(/\b(\d{1,2})-(\d{1,2})-(\d{1,2})\b/);
  if (blend) {
    const a: [number, number, number] = [+blend[1], +blend[2], +blend[3]];
    if (a[0] + a[1] + a[2] > 0 && a[0] + a[1] + a[2] <= 100) return { type: a[1] === 0 && a[2] === 0 ? 'n-fertilizer' : 'blend', analysis: a, name };
  }
  return { type: 'other', name };
}

export function normUnit(u: string | undefined): string {
  const s = (u ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/^(t|ton|tons|tn|st)$/.test(s)) return 'ton';
  if (/^(lb|lbs|pound|pounds|\#)$/.test(s)) return 'lb';
  if (/^(cwt)$/.test(s)) return 'cwt';
  if (/^(gal|gals|gallon|gallons|ga)$/.test(s)) return 'gal';
  if (/^(bag|bags|bg|unit|units|un|u|ea|each|ssu|sd|80k|140k)$/.test(s)) return 'unit';
  if (/^(bu|bushel|bushels)$/.test(s)) return 'bu';
  if (/^(ac|acre|acres)$/.test(s)) return 'acre';
  if (/^(oz|floz)$/.test(s)) return 'oz';
  if (/^(qt|quart|quarts)$/.test(s)) return 'qt';
  if (/^(pt|pint|pints)$/.test(s)) return 'pt';
  if (/^(ksds|kseeds|thousandseeds|1000seeds)$/.test(s)) return 'kseeds';
  return s;
}

/** Pounds of product in one unit, when the unit is a weight or a liquid with a known density. */
export function lbsPerUnit(unit: string, info: ProductInfo): number | undefined {
  switch (unit) {
    case 'ton':
      return 2000;
    case 'cwt':
      return 100;
    case 'lb':
      return 1;
    case 'gal':
      return info.lbsPerGal;
    default:
      return undefined;
  }
}

/** Dollars per pound of N (or P2O5, K2O) for one fertilizer purchase. */
export function pricePerNutrientLb(unitPrice: number, unit: string, info: ProductInfo, nutrient: 0 | 1 | 2): number | undefined {
  const lbs = lbsPerUnit(unit, info);
  const pct = info.analysis?.[nutrient];
  if (!lbs || !pct) return undefined;
  return unitPrice / ((lbs * pct) / 100);
}

/** Seed price per standard unit: corn per 80,000-kernel bag, soybeans per 140,000-seed unit. */
export function seedUnitPrice(type: 'seed-corn' | 'seed-soybeans', unitPrice: number, unit: string): number | undefined {
  if (type === 'seed-corn') {
    if (unit === 'unit') return unitPrice;
    if (unit === 'kseeds') return unitPrice * 80;
    return undefined;
  }
  if (unit === 'unit') return unitPrice;
  if (unit === 'kseeds') return unitPrice * 140;
  if (unit === 'bu') return unitPrice * (140 / 168); // 60 lb bushel ≈ 168,000 seeds at 2,800 seeds/lb
  if (unit === 'lb') return unitPrice * 50; // 50 lb ≈ 140,000 seeds
  return undefined;
}

/**
 * Pounds of N per acre from an application rate. Rates in lb/ac or gal/ac of product,
 * or lb N/ac directly when the unit says so.
 */
export function nLbsPerAcre(rate: number, rateUnit: string, info: ProductInfo): number | undefined {
  const u = rateUnit.toLowerCase().replace(/\s+/g, '');
  if (/lbn|nlb|lbsn|unitsn|unitn/.test(u)) return rate;
  const pct = info.analysis?.[0];
  if (!pct) return undefined;
  if (/^(lb|lbs)(\/|per)?(ac|acre)?$/.test(u) || u === 'lb/ac' || u === 'lbs/ac') return (rate * pct) / 100;
  if (/^gal/.test(u) && info.lbsPerGal) return (rate * info.lbsPerGal * pct) / 100;
  if (/^(ton|t)(\/|per)?(ac|acre)?$/.test(u)) return (rate * 2000 * pct) / 100;
  return undefined;
}
