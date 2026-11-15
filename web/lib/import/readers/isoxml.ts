import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { LonLat } from '../../domain/types';

/**
 * ISO 11783-10 task data (ISOXML) from ISOBUS displays: TASKDATA.XML alone or a zip with TASKDATA.XML and the
 * binary time logs (TLGxxxxx.XML + .BIN). Uses the isoxml library (dev4Agriculture, Apache-2.0) for parsing and
 * time-log decoding; DDI meanings, units and resolutions come from its copy of the ISOBUS data dictionary.
 */

/** Conversions from ISOBUS SI units to US farm units. */
export const MG_M2_TO_LB_AC = (4046.8564224 * 2.20462262) / 1e6; // mg/m² → lb/ac
export const MM3_M2_TO_GAL_AC = (4046.8564224 * 264.172052) / 1e9; // mm³/m² → gal/ac
export const ML_M2_TO_BU_AC = (4046.8564224 / 1000) / 35.2390702; // ml/m² → bu/ac (volume)
export const PER_M2_TO_PER_AC = 4046.8564224; // /m² → /ac

/** Pounds per bushel for converting a mass yield to bushels. */
export const TEST_WEIGHT: Record<string, number> = { corn: 56, soybeans: 60, 'winter-wheat': 60, 'spring-wheat': 60, 'durum-wheat': 60, oats: 32, barley: 48, rye: 56, sorghum: 56, sunflower: 28, canola: 50 };

export type MeasureKind = 'yield-mass' | 'yield-volume' | 'yield-dry-mass' | 'moisture' | 'rate-mass' | 'rate-volume' | 'rate-count';

export interface Measure {
  ddi: number;
  name: string;
  kind: MeasureKind;
  /** Setpoint (planned) or actual (as applied / measured). */
  actual: boolean;
  /** Mean over logged points with a valid position, in `unit`. */
  mean: number;
  unit: string;
  points: number;
}

export interface IsoTask {
  name: string;
  partfieldName?: string;
  boundary?: Polygon | MultiPolygon;
  /** First time-log date, YYYY-MM-DD. */
  date?: string;
  products: string[];
  cropName?: string;
  measures: Measure[];
  /** Positions with yield (bu/ac needs the crop's test weight, so raw lb/ac or bu/ac volume is kept). */
  yieldPoints: Array<{ point: LonLat; lbPerAc?: number; buPerAc?: number; moisturePct?: number }>;
  /** True when rates came from a prescription grid or treatment zones, not a time log. */
  planned: boolean;
}

const KIND: Record<number, { kind: MeasureKind; actual: boolean }> = {
  1: { kind: 'rate-volume', actual: false },
  2: { kind: 'rate-volume', actual: true },
  6: { kind: 'rate-mass', actual: false },
  7: { kind: 'rate-mass', actual: true },
  11: { kind: 'rate-count', actual: false },
  12: { kind: 'rate-count', actual: true },
  83: { kind: 'yield-volume', actual: true },
  84: { kind: 'yield-mass', actual: true },
  99: { kind: 'moisture', actual: true },
  181: { kind: 'yield-dry-mass', actual: true },
};

function convert(kind: MeasureKind, v: number): { v: number; unit: string } {
  switch (kind) {
    case 'rate-mass':
    case 'yield-mass':
    case 'yield-dry-mass':
      return { v: v * MG_M2_TO_LB_AC, unit: 'lb/ac' };
    case 'rate-volume':
      return { v: v * MM3_M2_TO_GAL_AC, unit: 'gal/ac' };
    case 'rate-count':
      return { v: v * PER_M2_TO_PER_AC, unit: 'seeds/ac' };
    case 'yield-volume':
      return { v: v * ML_M2_TO_BU_AC, unit: 'bu/ac' };
    case 'moisture':
      return { v: v / 10000, unit: '%' };
  }
}

// Minimal shapes of the isoxml entities this reader touches.
interface Ent {
  attributes: Record<string, unknown>;
}
interface Ref {
  xmlId: string;
  entity?: Ent;
}
interface TimeLogEnt extends Ent {
  parseBinaryFile(): {
    valuesInfo: Array<{ DDINumber: number; DDEntityName: string; scale: number; offset: number; valueKey: string }>;
    timeLogs: Array<{ time: Date; position: { PositionNorth: number; PositionEast: number }; values: Record<string, number>; isValidPosition: boolean }>;
  };
}
interface PartfieldEnt extends Ent {
  toGeoJSON(): MultiPolygon;
}

const MAX_POINTS = 50000;

export async function readIsoxml(bytes: Uint8Array, isZip: boolean): Promise<{ tasks: IsoTask[]; warnings: string[] }> {
  const { ISOXMLManager } = await import('isoxml');
  const mgr = new ISOXMLManager();
  if (isZip) await mgr.parseISOXMLFile(bytes, 'application/zip');
  else await mgr.parseISOXMLFile(new TextDecoder().decode(bytes), 'text/xml');
  // Letter-case notes about file names are harmless (the file is still found), so they are not shown.
  const warnings = mgr
    .getWarnings()
    .filter((w) => !/letter case/i.test(w))
    .slice(0, 5)
    .map((w) => `ISOXML note: ${w}`);
  const root = mgr.rootElement as unknown as Ent;
  const tasks: IsoTask[] = [];
  const name = (ref: unknown, key: string): string | undefined => {
    const r = ref as Ref | undefined;
    const e = r?.entity ?? (r?.xmlId ? (mgr.getEntityByXmlId(r.xmlId) as unknown as Ent) : undefined);
    const v = e?.attributes[key];
    return typeof v === 'string' ? v : undefined;
  };
  for (const t of ((root.attributes.Task as Ent[]) ?? [])) {
    const a = t.attributes;
    const pfRef = a.PartfieldIdRef as Ref | undefined;
    const pf = (pfRef?.entity ?? (pfRef?.xmlId ? mgr.getEntityByXmlId(pfRef.xmlId) : undefined)) as unknown as PartfieldEnt | undefined;
    let boundary: Polygon | MultiPolygon | undefined;
    try {
      const g = pf?.toGeoJSON();
      if (g && g.coordinates?.length) boundary = g.coordinates.length === 1 ? { type: 'Polygon', coordinates: g.coordinates[0] } : g;
    } catch {
      /* partfield without a boundary */
    }
    const cropRef = pf?.attributes.CropTypeIdRef;
    const products = ((a.ProductAllocation as Ent[]) ?? []).map((pa) => name(pa.attributes.ProductIdRef, 'ProductDesignator')).filter((x): x is string => !!x);
    const task: IsoTask = {
      name: String(a.TaskDesignator ?? 'Task'),
      partfieldName: pf ? String(pf.attributes.PartfieldDesignator ?? '') || undefined : undefined,
      boundary,
      products: [...new Set(products)],
      cropName: cropRef ? name(cropRef, 'CropTypeDesignator') : undefined,
      measures: [],
      yieldPoints: [],
      planned: false,
    };

    // Time logs: average each DDI of interest over points with a valid position.
    const sums = new Map<number, { sum: number; n: number; name: string }>();
    for (const tl of ((a.TimeLog as TimeLogEnt[]) ?? [])) {
      let info;
      try {
        info = tl.parseBinaryFile();
      } catch (e) {
        warnings.push(`A time log in "${task.name}" could not be decoded (${(e as Error).message}).`);
        continue;
      }
      const keys = info.valuesInfo.filter((v) => KIND[v.DDINumber]);
      let count = 0;
      for (const rec of info.timeLogs) {
        if (!rec.isValidPosition) continue;
        if (!task.date && rec.time) task.date = new Date(rec.time).toISOString().slice(0, 10);
        const yp: { point: LonLat; lbPerAc?: number; buPerAc?: number; moisturePct?: number } = { point: [rec.position.PositionEast, rec.position.PositionNorth] };
        let hasYield = false;
        for (const k of keys) {
          const raw = rec.values[k.valueKey];
          if (raw === undefined || !Number.isFinite(raw)) continue;
          const value = raw * (k.scale ?? 1) + (k.offset ?? 0);
          const s = sums.get(k.DDINumber) ?? { sum: 0, n: 0, name: k.DDEntityName };
          s.sum += value;
          s.n++;
          sums.set(k.DDINumber, s);
          const kind = KIND[k.DDINumber].kind;
          if (kind === 'yield-mass' || kind === 'yield-dry-mass') {
            yp.lbPerAc = convert(kind, value).v;
            hasYield = true;
          } else if (kind === 'yield-volume') {
            yp.buPerAc = convert(kind, value).v;
            hasYield = true;
          } else if (kind === 'moisture') yp.moisturePct = convert(kind, value).v;
        }
        if (hasYield && task.yieldPoints.length < MAX_POINTS) task.yieldPoints.push(yp);
        if (++count > MAX_POINTS * 4) break;
      }
    }
    for (const [ddi, s] of sums) {
      const { kind, actual } = KIND[ddi];
      const c = convert(kind, s.sum / s.n);
      task.measures.push({ ddi, name: s.name, kind, actual, mean: c.v, unit: c.unit, points: s.n });
    }

    // No time log: fall back to the prescription (treatment zones' process data values).
    if (!task.measures.length) {
      const zones = (a.TreatmentZone as Ent[]) ?? [];
      const def = a.DefaultTreatmentZoneCode;
      const zone = zones.find((z) => z.attributes.TreatmentZoneCode === def) ?? zones[0];
      for (const pdv of ((zone?.attributes.ProcessDataVariable as Ent[]) ?? [])) {
        const ddi = parseInt(String(pdv.attributes.ProcessDataDDI ?? ''), 16);
        const k = KIND[ddi];
        const v = Number(pdv.attributes.ProcessDataValue);
        if (!k || !Number.isFinite(v)) continue;
        const { DDEntities } = await ddEntities();
        const scale = DDEntities[String(ddi)]?.bitResolution ?? 1;
        const c = convert(k.kind, v * scale);
        task.measures.push({ ddi, name: DDEntities[String(ddi)]?.name ?? `DDI ${ddi}`, kind: k.kind, actual: false, mean: c.v, unit: c.unit, points: 0 });
        task.planned = true;
      }
    }
    tasks.push(task);
  }
  if (!tasks.length) warnings.push('The ISOXML file has no tasks, so there is nothing to read.');
  return { tasks, warnings };
}

async function ddEntities(): Promise<{ DDEntities: Record<string, { name: string; bitResolution: number }> }> {
  const mod = (await import('isoxml/dist/DDEntities.js')) as unknown as { default: Record<string, { name: string; bitResolution: number }> };
  return { DDEntities: mod.default };
}

/** Field boundary as a GeoJSON feature, for matching a partfield to a PlotTwist field. */
export function boundaryFeature(t: IsoTask): Feature<Polygon | MultiPolygon> | null {
  return t.boundary ? { type: 'Feature', properties: { name: t.partfieldName ?? t.name }, geometry: t.boundary } : null;
}
