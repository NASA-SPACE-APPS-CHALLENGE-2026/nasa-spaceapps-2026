import { area as turfArea, feature, featureCollection, intersect, kinks } from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { acresFromM2, areaM2, interiorPoint } from './acreage';
import type { FieldGeometry } from './types';

export type IssueLevel = 'error' | 'warning';

export interface GeometryIssue {
  level: IssueLevel;
  code: 'self-intersecting' | 'empty' | 'outside-conus' | 'too-small' | 'too-large' | 'overlap' | 'bad-coordinates';
  message: string;
}

export const MIN_REASONABLE_ACRES = 0.5;
export const MAX_REASONABLE_ACRES = 5000;

/** Rough box around the 48 contiguous states (CDL and SSURGO coverage are best here). */
const CONUS = { minLon: -125.0, maxLon: -66.9, minLat: 24.4, maxLat: 49.4 };

export function isInConus([lon, lat]: [number, number]): boolean {
  return lon >= CONUS.minLon && lon <= CONUS.maxLon && lat >= CONUS.minLat && lat <= CONUS.maxLat;
}

function coordsValid(geometry: FieldGeometry): boolean {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.every((rings) =>
    rings.every(
      (ring) =>
        ring.length >= 4 &&
        ring.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 180 && Math.abs(y) <= 90),
    ),
  );
}

/** Checks for a single shape on its own. Errors block saving; warnings are shown but allowed. */
export function validateGeometry(geometry: FieldGeometry): GeometryIssue[] {
  const issues: GeometryIssue[] = [];
  if (!coordsValid(geometry)) {
    return [
      {
        level: 'error',
        code: 'bad-coordinates',
        message: 'The shape has coordinates that are not valid latitude/longitude. It may use a projected coordinate system.',
      },
    ];
  }
  // Check crossings first: a symmetric bow tie's two lobes cancel out to zero area.
  if (kinks(geometry as Polygon).features.length > 0) {
    return [
      {
        level: 'error',
        code: 'self-intersecting',
        message: 'The boundary crosses itself (like a bow tie). Please redraw it so the edges do not cross.',
      },
    ];
  }
  const m2 = areaM2(geometry);
  if (!(m2 > 0)) {
    return [{ level: 'error', code: 'empty', message: 'The shape has no area. Draw at least three corners.' }];
  }
  const ac = acresFromM2(m2);
  if (ac < MIN_REASONABLE_ACRES) {
    issues.push({
      level: 'warning',
      code: 'too-small',
      message: `This field is only ${ac.toFixed(2)} acres. Check that the boundary is drawn around the whole field.`,
    });
  }
  if (ac > MAX_REASONABLE_ACRES) {
    issues.push({
      level: 'warning',
      code: 'too-large',
      message: `This field is ${Math.round(ac).toLocaleString('en-US')} acres. That is unusually large; check the boundary (or the file's map projection).`,
    });
  }
  if (!isInConus(interiorPoint(geometry))) {
    issues.push({
      level: 'warning',
      code: 'outside-conus',
      message:
        'This field is outside the lower 48 states. USDA crop history (CDL) and soil survey data may not be available here; everything else still works.',
    });
  }
  return issues;
}

/** Warn when a new or edited shape overlaps existing fields (more than a tenth of an acre). */
export function overlapIssues(
  geometry: FieldGeometry,
  others: Array<{ id: string; name: string; geometry: FieldGeometry }>,
): GeometryIssue[] {
  const issues: GeometryIssue[] = [];
  const self = feature(geometry) as Feature<Polygon | MultiPolygon>;
  for (const other of others) {
    let overlapM2 = 0;
    try {
      const inter = intersect(featureCollection([self, feature(other.geometry) as Feature<Polygon | MultiPolygon>]));
      overlapM2 = inter ? turfArea(inter) : 0;
    } catch {
      continue; // invalid geometry is reported elsewhere
    }
    if (acresFromM2(overlapM2) > 0.1) {
      issues.push({
        level: 'warning',
        code: 'overlap',
        message: `Overlaps "${other.name}" by about ${acresFromM2(overlapM2).toFixed(1)} acres.`,
      });
    }
  }
  return issues;
}

export function hasBlockingIssue(issues: GeometryIssue[]): boolean {
  return issues.some((i) => i.level === 'error');
}
