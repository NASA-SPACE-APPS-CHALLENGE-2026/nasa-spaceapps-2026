import { centroid } from '@turf/turf';
import type { Feature, Geometry } from 'geojson';
import type { LonLat } from '../../domain/types';
import { norm, toDate, toNumber } from '../mapping';

/**
 * Attribute names used by yield and as-applied shapefile exports (JD Operations Center, Climate FieldView,
 * Ag Leader SMS, CNH AFS), lower-cased. The first match wins.
 */
const YIELD_KEYS = ['yld_vol_dr', 'yld_bu_ac', 'dry_yield', 'dryyield', 'vryieldvol', 'yld_vol_dry', 'yield_bu_a', 'yld_vol', 'yield_vol', 'yieldvol', 'yield'];
const YIELD_MASS_KEYS = ['yld_mass_d', 'yld_mass_dr', 'drymass', 'yld_mass'];
const MOIST_KEYS = ['moisture', 'moist', 'moisture_p', 'grain_mois', 'crop_moist'];
const DATE_KEYS = ['date', 'isotime', 'time', 'datetime', 'harv_date', 'harvest_da', 'app_date', 'appl_date', 'plant_date', 'start'];
const CROP_KEYS = ['crop', 'crop_type', 'crop_name', 'commodity'];
const PRODUCT_KEYS = ['product', 'prod_name', 'variety', 'hybrid', 'material', 'chemical', 'fert_name'];
/** [key, unit] — as-applied rate attributes; JD and FieldView use US units when exported for US accounts. */
const RATE_KEYS: Array<[string, string]> = [
  ['rt_apd_ms', 'lb/ac'],
  ['rt_apd_ma', 'lb/ac'],
  ['rt_apd_vol', 'gal/ac'],
  ['rt_apd_ct', 'seeds/ac'],
  ['rate_mass', 'lb/ac'],
  ['rate_vol', 'gal/ac'],
  ['seed_rate', 'seeds/ac'],
  ['seedrate', 'seeds/ac'],
  ['seeds_ac', 'seeds/ac'],
  ['appliedrate', ''],
  ['applied_ra', ''],
  ['ar_actual', ''],
  ['rate_appli', ''],
  ['act_rate', ''],
  ['rate', ''],
  ['tgt_rate', ''],
  ['target_rat', ''],
];
const UNIT_KEYS = ['unit', 'units', 'rate_unit', 'uom'];

function find(props: Record<string, unknown>, keys: string[]): string | undefined {
  const map = new Map(Object.keys(props).map((k) => [norm(k).replace(/ /g, '_'), k]));
  for (const k of keys) if (map.has(k)) return map.get(k);
  return undefined;
}

function pointOf(f: Feature<Geometry | null>): LonLat | null {
  const g = f.geometry;
  if (!g) return null;
  if (g.type === 'Point') return g.coordinates as LonLat;
  try {
    return centroid(f as Feature<Geometry>).geometry.coordinates as LonLat;
  } catch {
    return null;
  }
}

export interface MapPoint {
  point: LonLat;
  value: number;
  moisturePct?: number;
  date?: string;
  crop?: string;
  product?: string;
}

export type MapType = 'yield' | 'yield-mass' | 'application';

export interface MapRead {
  type: MapType | null;
  attribute?: string;
  unit: string;
  points: MapPoint[];
  attributes: string[];
}

/** Read a yield or as-applied map. `want` picks which attributes to look for. */
export function readMapFeatures(features: Array<Feature<Geometry | null>>, want: 'yield' | 'application'): MapRead {
  const sample = (features.find((f) => f.properties && Object.keys(f.properties).length)?.properties ?? {}) as Record<string, unknown>;
  const attributes = Object.keys(sample);
  let type: MapType | null = null;
  let attr: string | undefined;
  let unit = '';
  if (want === 'yield') {
    attr = find(sample, YIELD_KEYS);
    if (attr) {
      type = 'yield';
      unit = 'bu/ac';
    } else {
      attr = find(sample, YIELD_MASS_KEYS);
      if (attr) {
        type = 'yield-mass';
        unit = 'lb/ac';
      }
    }
  } else {
    for (const [k, u] of RATE_KEYS) {
      const hit = find(sample, [k]);
      if (hit) {
        attr = hit;
        type = 'application';
        const unitAttr = find(sample, UNIT_KEYS);
        unit = u || (unitAttr ? String(sample[unitAttr] ?? '') : '');
        break;
      }
    }
  }
  if (!attr || !type) return { type: null, unit: '', points: [], attributes };
  const moist = find(sample, MOIST_KEYS);
  const date = find(sample, DATE_KEYS);
  const crop = find(sample, CROP_KEYS);
  const product = find(sample, PRODUCT_KEYS);
  const points: MapPoint[] = [];
  for (const f of features) {
    const p = f.properties ?? {};
    const value = toNumber(p[attr] as string | number | null);
    const pt = pointOf(f);
    if (value === undefined || !pt || value <= 0) continue;
    points.push({
      point: pt,
      value,
      moisturePct: moist ? toNumber(p[moist] as string | number | null) : undefined,
      date: date ? toDate(p[date] as string | number | null) : undefined,
      crop: crop ? String(p[crop] ?? '') || undefined : undefined,
      product: product ? String(p[product] ?? '') || undefined : undefined,
    });
  }
  return { type, attribute: attr, unit, points, attributes };
}
