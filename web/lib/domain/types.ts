import type { Feature, MultiPolygon, Polygon } from 'geojson';

/**
 * PlotTwist keeps three per-field layers in separate stores, all keyed by `fieldId`:
 *   1. Field            – shape + crop history (what the farmer draws / enters)
 *   2. FieldProfile     – automatically fetched public data (never typed by the farmer)
 *   3. ManagementAnswers – later farmer questionnaire answers (Milestone 2+)
 * Keeping them apart lets each layer evolve, refetch or be replaced by a database independently.
 */

export type FieldGeometry = Polygon | MultiPolygon;
export type FieldFeature = Feature<FieldGeometry>;
export type LonLat = [number, number];

/** How the boundary was made. 'pin' | 'coordinates' | 'zip-pin' only exist on legacy (v1) approximate squares. */
export type DefinedBy = 'polygon' | 'pin' | 'coordinates' | 'zip-pin' | 'import';

/** How the farmer found the field on the map before drawing it. */
export type LocatedVia = 'address' | 'zip' | 'pin' | 'coordinates' | 'map';

/** 'drawn' = the farmer drew or imported the real boundary. 'approximate' = legacy auto-square around a pin. */
export type BoundaryKind = 'drawn' | 'approximate';

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
  /** The browser could not reach our own server (offline, page closed mid-request): retry automatically. */
  transient?: boolean;
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
  boundary: BoundaryKind;
  locatedVia?: LocatedVia;
  pin?: { center: LonLat; acres: number };
  importMeta?: { fileName: string; sourceFeatureIndex: number };
  crops: FieldCrops;
  cdl: CdlRunState;
}

// ---------- Layer 2: automatic profile ----------

export type SourceId = 'power' | 'ssurgo' | 'elevation' | 'smap' | 'imerg' | 'ndvi';

export type SourceStatus = 'loading' | 'ok' | 'unavailable' | 'needs_token' | 'not_built';

export interface ProfileValue {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
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
  /** Set by the browser when our own server could not be reached; retried automatically next time. */
  transient?: boolean;
  /** NASA POWER only: 1991–2020 monthly normals, used by Rotation Explorer (not shown as profile rows). */
  climate?: ClimateNormals;
}

/** Monthly 1991–2020 normals for the field's POWER grid cell, January first (12 entries each). */
export interface ClimateNormals {
  monthlyMeanTempF: number[];
  monthlyRainIn: number[];
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

// ---------- Layer 4: plans (Planner) ----------

export type PlanTaskKind = 'plant' | 'harvest' | 'cover-plant' | 'cover-terminate' | 'soil-test' | 'scout' | 'note';

export interface PlanTask {
  id: string;
  /** 1 = January … 12 = December. */
  month: number;
  kind: PlanTaskKind;
  label: string;
}

export interface PlanCover {
  /** Cover crop id from the cover-crop table (lib/domain/rotation/coverCrops.ts) or free text. */
  species: string;
  name: string;
}

export interface PlanSeason {
  year: number;
  crop: CropRef | null;
  /** A cover crop planted after this season's cash crop. */
  cover?: PlanCover;
  tasks: PlanTask[];
}

export type StrategyId = 'keep' | 'cover' | 'small-grains';

export interface Plan {
  id: string;
  fieldId: string;
  strategyId: StrategyId | 'custom';
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Oldest first. */
  seasons: PlanSeason[];
}

// ---------- Settings ----------

export interface FarmSettings {
  /** When false, nothing about the field location is sent to public services. */
  externalLookups: boolean;
  /** The field the farmer last worked on; Rotation Explorer and Planner open it by default. */
  lastFieldId?: string;
}
