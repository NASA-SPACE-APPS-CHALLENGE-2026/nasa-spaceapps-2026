import { areaM2, geometryHash } from './acreage';
import { clearUnconfirmedDetections, defaultCrops } from './cropHistory';
import type { DefinedBy, Field, FieldGeometry, LocatedVia, LonLat } from './types';

export interface NewFieldInput {
  name: string;
  geometry: FieldGeometry;
  definedBy: DefinedBy;
  locatedVia?: LocatedVia;
  pin?: { center: LonLat; acres: number };
  importMeta?: { fileName: string; sourceFeatureIndex: number };
  now?: Date;
  id?: string;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createField(input: NewFieldInput): Field {
  const now = (input.now ?? new Date()).toISOString();
  const name = input.name.trim() || 'Untitled field';
  return {
    id: input.id ?? newId(),
    name,
    createdAt: now,
    updatedAt: now,
    feature: { type: 'Feature', properties: { name }, geometry: input.geometry },
    areaM2: areaM2(input.geometry),
    geometryHash: geometryHash(input.geometry),
    definedBy: input.definedBy,
    boundary: input.pin ? 'approximate' : 'drawn',
    locatedVia: input.locatedVia,
    pin: input.pin,
    importMeta: input.importMeta,
    crops: defaultCrops(),
    cdl: { status: 'idle' },
  };
}

/** Replace the shape. Unconfirmed CDL detections described the old shape, so they are cleared. */
export function withGeometry(
  field: Field,
  geometry: FieldGeometry,
  opts: { pin?: { center: LonLat; acres: number } | null; now?: Date } = {},
): Field {
  const hash = geometryHash(geometry);
  if (hash === field.geometryHash && opts.pin === undefined) return field;
  return {
    ...field,
    updatedAt: (opts.now ?? new Date()).toISOString(),
    feature: { ...field.feature, geometry },
    areaM2: areaM2(geometry),
    geometryHash: hash,
    pin: opts.pin === null ? undefined : (opts.pin ?? field.pin),
    definedBy: opts.pin === null && field.pin ? 'polygon' : field.definedBy,
    // Any shape the farmer edits or draws is a real boundary from now on.
    boundary: opts.pin ? 'approximate' : 'drawn',
    crops: hash === field.geometryHash ? field.crops : clearUnconfirmedDetections(field.crops),
    cdl: hash === field.geometryHash ? field.cdl : { status: 'idle' },
  };
}

export function renamed(field: Field, name: string, now = new Date()): Field {
  const clean = name.trim() || field.name;
  return { ...field, name: clean, feature: { ...field.feature, properties: { ...field.feature.properties, name: clean } }, updatedAt: now.toISOString() };
}
