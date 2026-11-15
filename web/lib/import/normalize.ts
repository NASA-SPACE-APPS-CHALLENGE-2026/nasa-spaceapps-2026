import type { Polygon } from 'geojson';
import { DEFAULT_PIN_ACRES, squareAroundPoint } from '../domain/acreage';
import type { FieldGeometry, LonLat } from '../domain/types';
import { type GeometryIssue, validateGeometry } from '../domain/validation';
import type { AnyFeature } from './parse';

export interface BoundaryCandidate {
  key: string;
  sourceIndex: number;
  partIndex?: number;
  properties: Record<string, unknown>;
  geometry: FieldGeometry;
  kind: 'boundary' | 'pin';
  pinCenter?: LonLat;
  issues: GeometryIssue[];
}

export interface SkippedFeature {
  sourceIndex: number;
  reason: string;
}

export interface NormalizeOptions {
  splitMultiPolygons: boolean;
}

const NAME_PATTERNS = [/^name$/i, /^field[_\s-]?name$/i, /^field$/i, /^label$/i, /^title$/i, /^field[_\s-]?id$/i, /^id$/i, /name/i, /field/i];

/** Property columns that could hold a field name, best guess first. */
export function nameColumns(items: Array<{ properties: Record<string, unknown> }>): { columns: string[]; best: string | null } {
  const seen = new Set<string>();
  for (const f of items) {
    for (const [k, v] of Object.entries(f.properties ?? {})) {
      if (v === null || v === undefined || v === '' || typeof v === 'object') continue;
      seen.add(k);
    }
  }
  const columns = [...seen];
  for (const re of NAME_PATTERNS) {
    const hit = columns.find((c) => re.test(c));
    if (hit) return { columns, best: hit };
  }
  return { columns, best: null };
}

export function candidateName(c: BoundaryCandidate, column: string | null, ordinal: number): string {
  const raw = column ? c.properties[column] : undefined;
  const base = raw !== undefined && raw !== null && String(raw).trim() ? String(raw).trim().slice(0, 80) : `Imported field ${ordinal}`;
  return c.partIndex !== undefined ? `${base} (part ${c.partIndex + 1})` : base;
}

function stripZ(coords: unknown): unknown {
  if (Array.isArray(coords) && typeof coords[0] === 'number') return [coords[0], coords[1]];
  return Array.isArray(coords) ? coords.map(stripZ) : coords;
}

function tidy(g: FieldGeometry): FieldGeometry {
  const close = (r: number[][]) => {
    const [a, b] = [r[0], r[r.length - 1]];
    return a && b && (a[0] !== b[0] || a[1] !== b[1]) ? [...r, a] : r;
  };
  const flat = { ...g, coordinates: stripZ(g.coordinates) } as FieldGeometry;
  if (flat.type === 'Polygon') return { type: 'Polygon', coordinates: flat.coordinates.map(close) };
  return { type: 'MultiPolygon', coordinates: flat.coordinates.map((p) => p.map(close)) };
}

/**
 * Turn parsed features into field candidates.
 * Polygons → boundaries; MultiPolygons → one field, or one per part when splitting; Points → 40-acre square pins;
 * lines and empty geometries are skipped with a reason. Crop attributes are deliberately ignored.
 */
export function normalizeFeatures(features: AnyFeature[], opts: NormalizeOptions): { candidates: BoundaryCandidate[]; skipped: SkippedFeature[] } {
  const candidates: BoundaryCandidate[] = [];
  const skipped: SkippedFeature[] = [];
  const push = (sourceIndex: number, properties: Record<string, unknown>, raw: FieldGeometry, kind: 'boundary' | 'pin', partIndex?: number, pinCenter?: LonLat) => {
    const geometry = kind === 'boundary' ? tidy(raw) : raw;
    candidates.push({
      key: `${sourceIndex}${partIndex !== undefined ? `.${partIndex}` : ''}`,
      sourceIndex,
      partIndex,
      properties,
      geometry,
      kind,
      pinCenter,
      issues: validateGeometry(geometry),
    });
  };

  features.forEach((f, i) => {
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const g = f.geometry;
    if (!g) {
      skipped.push({ sourceIndex: i, reason: 'No geometry' });
      return;
    }
    switch (g.type) {
      case 'Polygon':
        push(i, props, g, 'boundary');
        break;
      case 'MultiPolygon':
        if (opts.splitMultiPolygons && g.coordinates.length > 1) {
          g.coordinates.forEach((rings, p) => push(i, props, { type: 'Polygon', coordinates: rings } as Polygon, 'boundary', p));
        } else {
          push(i, props, g.coordinates.length === 1 ? { type: 'Polygon', coordinates: g.coordinates[0] } : g, 'boundary');
        }
        break;
      case 'Point': {
        const center: LonLat = [g.coordinates[0], g.coordinates[1]];
        if (!Number.isFinite(center[0]) || !Number.isFinite(center[1]) || Math.abs(center[0]) > 180 || Math.abs(center[1]) > 90) {
          skipped.push({ sourceIndex: i, reason: 'Point has invalid coordinates' });
          break;
        }
        push(i, props, squareAroundPoint(center, DEFAULT_PIN_ACRES), 'pin', undefined, center);
        break;
      }
      case 'GeometryCollection': {
        const polys = g.geometries.filter((x) => x.type === 'Polygon' || x.type === 'MultiPolygon') as FieldGeometry[];
        if (!polys.length) skipped.push({ sourceIndex: i, reason: 'Not a boundary (no polygons in this geometry collection)' });
        else polys.forEach((p, k) => push(i, props, p, 'boundary', polys.length > 1 ? k : undefined));
        break;
      }
      case 'LineString':
      case 'MultiLineString':
        skipped.push({ sourceIndex: i, reason: 'Not a boundary (a line, not a closed shape)' });
        break;
      default:
        skipped.push({ sourceIndex: i, reason: `Not a boundary (${g.type})` });
    }
  });
  return { candidates, skipped };
}
