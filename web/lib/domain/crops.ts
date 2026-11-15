import type { CropRef } from './types';

export interface CatalogCrop {
  id: string;
  name: string;
  group: 'Row crops' | 'Small grains' | 'Oilseeds & pulses' | 'Forage' | 'Specialty' | 'Rotation states';
  aliases?: string[];
}

/** Common US field crops plus the rotation states the farmer can pick. */
export const CROP_CATALOG: CatalogCrop[] = [
  { id: 'corn', name: 'Corn', group: 'Row crops', aliases: ['maize', 'field corn'] },
  { id: 'soybeans', name: 'Soybeans', group: 'Row crops', aliases: ['soy', 'beans'] },
  { id: 'cotton', name: 'Cotton', group: 'Row crops' },
  { id: 'sorghum', name: 'Sorghum', group: 'Row crops', aliases: ['milo'] },
  { id: 'rice', name: 'Rice', group: 'Row crops' },
  { id: 'peanuts', name: 'Peanuts', group: 'Row crops' },
  { id: 'sweet-corn', name: 'Sweet corn', group: 'Row crops' },
  { id: 'popcorn', name: 'Popcorn', group: 'Row crops', aliases: ['ornamental corn'] },
  { id: 'sugarbeets', name: 'Sugar beets', group: 'Row crops' },
  { id: 'tobacco', name: 'Tobacco', group: 'Row crops' },
  { id: 'winter-wheat', name: 'Winter wheat', group: 'Small grains', aliases: ['wheat'] },
  { id: 'spring-wheat', name: 'Spring wheat', group: 'Small grains', aliases: ['wheat'] },
  { id: 'durum-wheat', name: 'Durum wheat', group: 'Small grains', aliases: ['wheat'] },
  { id: 'barley', name: 'Barley', group: 'Small grains' },
  { id: 'oats', name: 'Oats', group: 'Small grains' },
  { id: 'rye', name: 'Rye', group: 'Small grains', aliases: ['cereal rye'] },
  { id: 'triticale', name: 'Triticale', group: 'Small grains' },
  { id: 'millet', name: 'Millet', group: 'Small grains' },
  { id: 'buckwheat', name: 'Buckwheat', group: 'Small grains' },
  { id: 'canola', name: 'Canola', group: 'Oilseeds & pulses', aliases: ['rapeseed'] },
  { id: 'sunflower', name: 'Sunflower', group: 'Oilseeds & pulses' },
  { id: 'flaxseed', name: 'Flax', group: 'Oilseeds & pulses', aliases: ['flaxseed'] },
  { id: 'safflower', name: 'Safflower', group: 'Oilseeds & pulses' },
  { id: 'camelina', name: 'Camelina', group: 'Oilseeds & pulses' },
  { id: 'mustard', name: 'Mustard', group: 'Oilseeds & pulses' },
  { id: 'dry-beans', name: 'Dry beans', group: 'Oilseeds & pulses', aliases: ['pinto', 'navy beans'] },
  { id: 'peas', name: 'Dry peas', group: 'Oilseeds & pulses', aliases: ['field peas'] },
  { id: 'lentils', name: 'Lentils', group: 'Oilseeds & pulses' },
  { id: 'chickpeas', name: 'Chickpeas', group: 'Oilseeds & pulses', aliases: ['garbanzo'] },
  { id: 'alfalfa', name: 'Alfalfa', group: 'Forage', aliases: ['hay'] },
  { id: 'other-hay', name: 'Other hay', group: 'Forage', aliases: ['grass hay'] },
  { id: 'clover', name: 'Clover', group: 'Forage' },
  { id: 'switchgrass', name: 'Switchgrass', group: 'Forage' },
  { id: 'potatoes', name: 'Potatoes', group: 'Specialty' },
  { id: 'sweet-potatoes', name: 'Sweet potatoes', group: 'Specialty' },
  { id: 'sugarcane', name: 'Sugarcane', group: 'Specialty' },
  { id: 'tomatoes', name: 'Tomatoes', group: 'Specialty' },
  { id: 'onions', name: 'Onions', group: 'Specialty' },
  { id: 'pumpkins', name: 'Pumpkins', group: 'Specialty' },
  { id: 'watermelons', name: 'Watermelons', group: 'Specialty' },
  { id: 'vegetables', name: 'Mixed vegetables', group: 'Specialty' },
  { id: 'fallow', name: 'Fallow', group: 'Rotation states', aliases: ['idle'] },
  { id: 'cover-crop', name: 'Cover crop', group: 'Rotation states', aliases: ['cover'] },
  { id: 'grass-pasture', name: 'Grass / pasture', group: 'Rotation states', aliases: ['pasture', 'grass'] },
];

const CATALOG_BY_ID = new Map(CROP_CATALOG.map((c) => [c.id, c]));

export function catalogCrop(id: string): CatalogCrop | undefined {
  return CATALOG_BY_ID.get(id);
}

/** Double crops the farmer can pick directly (first crop → second crop in the same season). */
export const DOUBLE_CROP_OPTIONS: Array<{ first: string; second: string }> = [
  { first: 'winter-wheat', second: 'soybeans' },
  { first: 'winter-wheat', second: 'corn' },
  { first: 'winter-wheat', second: 'sorghum' },
  { first: 'winter-wheat', second: 'cotton' },
  { first: 'barley', second: 'soybeans' },
  { first: 'barley', second: 'corn' },
  { first: 'oats', second: 'corn' },
  { first: 'triticale', second: 'corn' },
  { first: 'corn', second: 'soybeans' },
];

export function cropLabel(ref: CropRef | null | undefined): string {
  if (!ref) return 'Not entered';
  switch (ref.kind) {
    case 'catalog':
      return catalogCrop(ref.id)?.name ?? ref.id;
    case 'double':
      return `${catalogCrop(ref.first)?.name ?? ref.first} → ${catalogCrop(ref.second)?.name ?? ref.second} (double crop)`;
    case 'other':
      return ref.text;
    case 'cdl-raw':
      return ref.name;
  }
}

export function sameCrop(a: CropRef | null, b: CropRef | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------- USDA Cropland Data Layer class → app crop ----------

/** CDL class codes that map to one catalog crop. */
const CDL_TO_CATALOG: Record<number, string> = {
  1: 'corn', 2: 'cotton', 3: 'rice', 4: 'sorghum', 5: 'soybeans', 6: 'sunflower', 10: 'peanuts', 11: 'tobacco',
  12: 'sweet-corn', 13: 'popcorn', 21: 'barley', 22: 'durum-wheat', 23: 'spring-wheat', 24: 'winter-wheat',
  27: 'rye', 28: 'oats', 29: 'millet', 31: 'canola', 32: 'flaxseed', 33: 'safflower', 34: 'canola', 35: 'mustard',
  36: 'alfalfa', 37: 'other-hay', 38: 'camelina', 39: 'buckwheat', 41: 'sugarbeets', 42: 'dry-beans', 43: 'potatoes',
  45: 'sugarcane', 46: 'sweet-potatoes', 47: 'vegetables', 48: 'watermelons', 49: 'onions', 51: 'chickpeas',
  52: 'lentils', 53: 'peas', 54: 'tomatoes', 58: 'clover', 60: 'switchgrass', 61: 'fallow', 176: 'grass-pasture',
  205: 'triticale', 224: 'cover-crop', 229: 'pumpkins',
};

/** CDL double-crop classes → [first, second] catalog crops. */
const CDL_DOUBLE: Record<number, [string, string]> = {
  26: ['winter-wheat', 'soybeans'], 225: ['winter-wheat', 'corn'], 226: ['oats', 'corn'], 228: ['triticale', 'corn'],
  234: ['durum-wheat', 'sorghum'], 235: ['barley', 'sorghum'], 236: ['winter-wheat', 'sorghum'], 237: ['barley', 'corn'],
  238: ['winter-wheat', 'cotton'], 239: ['soybeans', 'cotton'], 240: ['soybeans', 'oats'], 241: ['corn', 'soybeans'],
  254: ['barley', 'soybeans'],
};

/**
 * CDL codes that are not cropland. Grass/Pasture (176) and Fallow/Idle (61) are deliberately NOT here:
 * they are real rotation states. 81 (clouds/no data) is handled as "no data".
 */
const CDL_NON_CROP = new Set<number>([
  63, 64, 65, 82, 83, 87, 88, 92, 111, 112, 121, 122, 123, 124, 131, 141, 142, 143, 152, 190, 195,
]);

export const CDL_NO_DATA = new Set<number>([0, 81]);

/** Fallback names for codes we may see in a raster (zonal) where the service gives no category text. */
export const CDL_CLASS_NAMES: Record<number, string> = {
  1: 'Corn', 2: 'Cotton', 3: 'Rice', 4: 'Sorghum', 5: 'Soybeans', 6: 'Sunflower', 10: 'Peanuts', 11: 'Tobacco',
  12: 'Sweet Corn', 13: 'Pop or Orn Corn', 14: 'Mint', 21: 'Barley', 22: 'Durum Wheat', 23: 'Spring Wheat',
  24: 'Winter Wheat', 25: 'Other Small Grains', 26: 'Dbl Crop WinWht/Soybeans', 27: 'Rye', 28: 'Oats', 29: 'Millet',
  30: 'Speltz', 31: 'Canola', 32: 'Flaxseed', 33: 'Safflower', 34: 'Rape Seed', 35: 'Mustard', 36: 'Alfalfa',
  37: 'Other Hay/Non Alfalfa', 38: 'Camelina', 39: 'Buckwheat', 41: 'Sugarbeets', 42: 'Dry Beans', 43: 'Potatoes',
  44: 'Other Crops', 45: 'Sugarcane', 46: 'Sweet Potatoes', 47: 'Misc Vegs & Fruits', 48: 'Watermelons', 49: 'Onions',
  50: 'Cucumbers', 51: 'Chick Peas', 52: 'Lentils', 53: 'Peas', 54: 'Tomatoes', 55: 'Caneberries', 56: 'Hops',
  57: 'Herbs', 58: 'Clover/Wildflowers', 59: 'Sod/Grass Seed', 60: 'Switchgrass', 61: 'Fallow/Idle Cropland',
  63: 'Forest', 64: 'Shrubland', 65: 'Barren', 66: 'Cherries', 67: 'Peaches', 68: 'Apples', 69: 'Grapes',
  70: 'Christmas Trees', 71: 'Other Tree Crops', 72: 'Citrus', 74: 'Pecans', 75: 'Almonds', 76: 'Walnuts', 77: 'Pears',
  81: 'Clouds/No Data', 82: 'Developed', 83: 'Water', 87: 'Wetlands', 88: 'Nonag/Undefined', 92: 'Aquaculture',
  111: 'Open Water', 112: 'Perennial Ice/Snow', 121: 'Developed/Open Space', 122: 'Developed/Low Intensity',
  123: 'Developed/Med Intensity', 124: 'Developed/High Intensity', 131: 'Barren', 141: 'Deciduous Forest',
  142: 'Evergreen Forest', 143: 'Mixed Forest', 152: 'Shrubland', 176: 'Grass/Pasture', 190: 'Woody Wetlands',
  195: 'Herbaceous Wetlands', 204: 'Pistachios', 205: 'Triticale', 206: 'Carrots', 207: 'Asparagus', 208: 'Garlic',
  209: 'Cantaloupes', 210: 'Prunes', 211: 'Olives', 212: 'Oranges', 213: 'Honeydew Melons', 214: 'Broccoli',
  215: 'Avocados', 216: 'Peppers', 217: 'Pomegranates', 218: 'Nectarines', 219: 'Greens', 220: 'Plums',
  221: 'Strawberries', 222: 'Squash', 223: 'Apricots', 224: 'Vetch', 225: 'Dbl Crop WinWht/Corn',
  226: 'Dbl Crop Oats/Corn', 227: 'Lettuce', 228: 'Dbl Crop Triticale/Corn', 229: 'Pumpkins',
  230: 'Dbl Crop Lettuce/Durum Wht', 231: 'Dbl Crop Lettuce/Cantaloupe', 232: 'Dbl Crop Lettuce/Cotton',
  233: 'Dbl Crop Lettuce/Barley', 234: 'Dbl Crop Durum Wht/Sorghum', 235: 'Dbl Crop Barley/Sorghum',
  236: 'Dbl Crop WinWht/Sorghum', 237: 'Dbl Crop Barley/Corn', 238: 'Dbl Crop WinWht/Cotton',
  239: 'Dbl Crop Soybeans/Cotton', 240: 'Dbl Crop Soybeans/Oats', 241: 'Dbl Crop Corn/Soybeans', 242: 'Blueberries',
  243: 'Cabbage', 244: 'Cauliflower', 245: 'Celery', 246: 'Radishes', 247: 'Turnips', 248: 'Eggplants', 249: 'Gourds',
  250: 'Cranberries', 254: 'Dbl Crop Barley/Soybeans',
};

export function isCdlNonCrop(code: number): boolean {
  return CDL_NON_CROP.has(code);
}

/** Map a CDL class to the app's crop reference. Unmapped classes keep their raw CDL name. */
export function cropFromCdl(code: number, name?: string): CropRef {
  const single = CDL_TO_CATALOG[code];
  if (single) return { kind: 'catalog', id: single };
  const dbl = CDL_DOUBLE[code];
  if (dbl) return { kind: 'double', first: dbl[0], second: dbl[1] };
  return { kind: 'cdl-raw', code, name: name ?? CDL_CLASS_NAMES[code] ?? `CDL class ${code}` };
}
