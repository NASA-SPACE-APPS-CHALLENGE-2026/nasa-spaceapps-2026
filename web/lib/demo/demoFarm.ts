import { area as turfArea, feature, featureCollection, intersect } from '@turf/turf';
import type { Feature, Polygon } from 'geojson';
import { setSeasonCrop, addOlderSeason } from '../domain/cropHistory';
import { createField } from '../domain/field';
import type { CropRef, Field, FieldGeometry } from '../domain/types';

/**
 * Demo farm east of Ames, Iowa. Boundaries were traced on USGS National Map imagery (zoom 15) along visible
 * field edges, roads and the railroad, and do not overlap each other. Crop histories are made-up examples of
 * common Iowa rotations — they are labeled as demo data in the app and are not this land's real history.
 */
export const DEMO_FILE_NAME = 'FieldShift demo farm (example data)';

const C = (id: string): CropRef => ({ kind: 'catalog', id });

interface DemoField {
  name: string;
  ring: Array<[number, number]>;
  /** 2026, 2025, 2024, 2023, 2022 */
  crops: [CropRef, CropRef, CropRef, CropRef, CropRef];
}

export const DEMO_FIELDS: DemoField[] = [
  {
    name: 'North quarter',
    ring: [[-93.501682, 42.034497], [-93.492, 42.034497], [-93.492, 42.027786], [-93.501682, 42.027915], [-93.501682, 42.034497]],
    crops: [C('soybeans'), C('corn'), C('soybeans'), C('corn'), C('soybeans')],
  },
  {
    name: 'East quarter',
    ring: [[-93.491697, 42.034497], [-93.482576, 42.034497], [-93.482576, 42.027401], [-93.491697, 42.027626], [-93.491697, 42.034497]],
    crops: [C('corn'), C('soybeans'), C('corn'), C('corn'), C('corn')],
  },
  {
    name: 'Railroad 80',
    ring: [[-93.501639, 42.027433], [-93.491005, 42.027272], [-93.491005, 42.023291], [-93.501639, 42.023291], [-93.501639, 42.027433]],
    crops: [C('corn'), C('soybeans'), C('corn'), C('soybeans'), C('corn')],
  },
  {
    name: 'Home 80',
    // Notched around the farmstead on the east side.
    ring: [[-93.511581, 42.034433], [-93.502158, 42.034433], [-93.502158, 42.032667], [-93.503844, 42.032667], [-93.503844, 42.030098], [-93.502158, 42.030098], [-93.502158, 42.028525], [-93.511581, 42.028525], [-93.511581, 42.034433]],
    crops: [C('corn'), C('soybeans'), C('corn'), C('oats'), C('corn')],
  },
  {
    name: 'West 40',
    ring: [[-93.518584, 42.033855], [-93.513137, 42.033855], [-93.513137, 42.028942], [-93.518584, 42.028942], [-93.518584, 42.033855]],
    crops: [C('corn'), C('alfalfa'), C('alfalfa'), C('alfalfa'), C('corn')],
  },
  {
    name: 'Creek field',
    ring: [[-93.482101, 42.034433], [-93.472937, 42.034433], [-93.472937, 42.030451], [-93.482101, 42.030451], [-93.482101, 42.034433]],
    crops: [C('soybeans'), C('corn'), C('soybeans'), C('corn'), C('soybeans')],
  },
];

export function demoGeometry(d: DemoField): FieldGeometry {
  return { type: 'Polygon', coordinates: [d.ring] };
}

export function isDemoField(f: Field): boolean {
  return f.importMeta?.fileName === DEMO_FILE_NAME;
}

/** Build the demo fields with confirmed example crop histories (2022–2026). */
export function buildDemoFarm(now = new Date()): Field[] {
  return DEMO_FIELDS.map((d, i) => {
    let field = createField({ name: d.name, geometry: demoGeometry(d), definedBy: 'import', importMeta: { fileName: DEMO_FILE_NAME, sourceFeatureIndex: i }, now });
    let crops = addOlderSeason(field.crops); // 2025–2022
    const years = [crops.current.year, ...crops.history.map((s) => s.year)];
    years.forEach((year, k) => {
      crops = setSeasonCrop(crops, year, d.crops[k]);
    });
    field = { ...field, crops, cdl: { status: 'done', message: 'Demo farm: these crops are example data, not detected from USDA maps.', checkedAt: now.toISOString() } };
    return field;
  });
}

/** Why the demo farm can't be loaded right now, or null when it can. */
export function demoBlocker(existing: Field[]): string | null {
  if (existing.some(isDemoField)) return 'The demo farm is already loaded.';
  const demo = DEMO_FIELDS.map((d) => feature(demoGeometry(d)) as Feature<Polygon>);
  for (const f of existing) {
    if (f.boundary === 'approximate') continue;
    for (const d of demo) {
      try {
        const hit = intersect(featureCollection([d, feature(f.feature.geometry) as Feature<Polygon>]));
        if (hit && turfArea(hit) > 400) return `Your field "${f.name}" overlaps the demo farm's land.`;
      } catch {
        // invalid geometry: ignore for this check
      }
    }
  }
  return null;
}
