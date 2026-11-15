import type { Feature, MultiPolygon, Polygon } from 'geojson';

/**
 * FieldShift keeps three per-field layers in separate stores, all keyed by `fieldId`:
 *   1. Field            – shape + crop history (what the farmer draws / enters)
 *   2. FieldProfile     – automatically fetched public data (never typed by the farmer)
 *   3. ManagementAnswers – later farmer questionnaire answers (Milestone 2+)
 * Keeping them apart lets each layer evolve, refetch or be replaced by a database independently.
 */

export type FieldGeometry = Polygon | MultiPolygon;
export type FieldFeature = Feature<FieldGeometry>;
export type LonLat = [number, number];

export type DefinedBy = 'polygon' | 'pin' | 'coordinates' | 'zip-pin' | 'import';

// ---------- Layer 1: shape + crops ----------

export type CropRef =
  | { kind: 'catalog'; id: string }
  | { kind: 'double'; first: string; second: string }
  | { kind: 'other'; text: string }
  | { kind: 'cdl-raw'; code: number; name: string };

export type CdlMethod = 'zonal' | 'sampled';

export interface CdlDetection {
  cdlCode: number;
  cdlName: string;
  /** Share of sampled pixels / points that were this class, 0–100. */
  sharePct: number;
  method: CdlMethod;
  /** Pixels (zonal) or points (sampled) that went into the share. */
  sampleCount: number;
  /** True when CDL says the land is not cropland (developed, forest, water, wetland…). */
  nonCrop: boolean;
  fetchedAt: string;
}

export type SeasonStatus = 'confirmed' | 'detected' | 'empty';

export interface SeasonCrop {
  year: number;
  crop: CropRef | null;
  origin: 'farmer' | 'cdl';
  status: SeasonStatus;
  detection?: CdlDetection;
}

export interface FieldCrops {
  current: SeasonCrop;
  /** Prior seasons, most recent first. 1–5 entries. */
  history: SeasonCrop[];
}

export interface CdlRunState {
  status: 'idle' | 'loading' | 'done' | 'unavailable';
  message?: string;
  checkedAt?: string;
}

export interface Field {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  feature: FieldFeature;
  areaM2: number;
  geometryHash: string;
  definedBy: DefinedBy;
  pin?: { center: LonLat; acres: number };
  importMeta?: { fileName: string; sourceFeatureIndex: number };
  crops: FieldCrops;
  cdl: CdlRunState;
}

// ---------- Layer 2: automatic profile ----------

export type Honesty = 'Measured' | 'Estimated' | 'Check this info';

export type SourceId = 'power' | 'ssurgo' | 'elevation' | 'smap' | 'imerg' | 'ndvi';

export type SourceStatus = 'loading' | 'ok' | 'unavailable' | 'needs_token' | 'not_built';

export interface ProfileValue {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  honesty: Honesty;
  note?: string;
}

export interface SourceResult {
  sourceId: SourceId;
  sourceName: string;
  status: SourceStatus;
  /** When the underlying data was fetched from the provider (may be older than the request if cached). */
  fetchedAt?: string;
  message?: string;
  docsUrl: string;
  values: ProfileValue[];
}

export interface FieldProfile {
  fieldId: string;
  geometryHash: string;
  sources: Partial<Record<SourceId, SourceResult>>;
}

// ---------- Layer 3: management answers (placeholder for later milestones) ----------

export interface ManagementAnswers {
  fieldId: string;
  schemaVersion: number;
  answers: Record<string, unknown>;
  updatedAt: string;
}

// ---------- Settings ----------

export interface FarmSettings {
  /** When false, nothing about the field location is sent to public services. */
  externalLookups: boolean;
}
