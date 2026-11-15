import { area as turfArea, bbox as turfBbox, centroid as turfCentroid, pointOnFeature } from '@turf/turf';
import type { FieldFeature, FieldGeometry, LonLat } from './types';

export const M2_PER_ACRE = 4046.8564224;
export const DEFAULT_PIN_ACRES = 40;
export const MIN_PIN_ACRES = 0.1;
export const MAX_PIN_ACRES = 10000;

export function acresFromM2(m2: number): number {
  return m2 / M2_PER_ACRE;
}

export function m2FromAcres(acres: number): number {
  return acres * M2_PER_ACRE;
}

/** Geodesic area of a polygon or multipolygon, in m². */
export function areaM2(geometry: FieldGeometry | FieldFeature): number {
  return turfArea(geometry);
}

export function formatAcres(m2: number): string {
  const ac = acresFromM2(m2);
  if (ac < 10) return `${ac.toFixed(1)} ac`;
  return `${ac.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} ac`;
}

const EARTH_RADIUS_M = 6378137;

/**
 * North-aligned square of the given acreage centred on a point (a "pin" field).
 * Uses a local equirectangular offset, accurate to well under 1% for fields up to thousands of acres.
 */
export function squareAroundPoint(center: LonLat, acres: number): FieldGeometry {
  if (!Number.isFinite(acres) || acres < MIN_PIN_ACRES || acres > MAX_PIN_ACRES) {
    throw new RangeError(`Acreage must be between ${MIN_PIN_ACRES} and ${MAX_PIN_ACRES}.`);
  }
  const [lon, lat] = center;
  const target = m2FromAcres(acres);
  const build = (half: number): FieldGeometry => {
    const dLat = (half / EARTH_RADIUS_M) * (180 / Math.PI);
    const dLon = (half / (EARTH_RADIUS_M * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);
    return squareRing(lon, lat, dLon, dLat);
  };
  // First guess from flat geometry, then one correction against the geodesic area (exact to ~0.01%).
  const guess = Math.sqrt(target) / 2;
  return build(guess * Math.sqrt(target / turfArea(build(guess))));
}

function squareRing(lon: number, lat: number, dLon: number, dLat: number): FieldGeometry {
  const ring: LonLat[] = [
    [lon - dLon, lat - dLat],
    [lon + dLon, lat - dLat],
    [lon + dLon, lat + dLat],
    [lon - dLon, lat + dLat],
    [lon - dLon, lat - dLat],
  ];
  return { type: 'Polygon', coordinates: [ring.map(([x, y]) => [round7(x), round7(y)])] };
}

function round7(n: number): number {
  return Math.round(n * 1e7) / 1e7;
}

/** A representative point guaranteed to be inside the field (centroid when it is inside). */
export function interiorPoint(geometry: FieldGeometry): LonLat {
  const c = turfCentroid(geometry).geometry.coordinates as LonLat;
  const p = pointOnFeature(geometry).geometry.coordinates as LonLat;
  return insideGeometry(c, geometry) ? c : p;
}

export function bboxOf(geometry: FieldGeometry): [number, number, number, number] {
  return turfBbox(geometry) as [number, number, number, number];
}

/** Ray-casting point-in-polygon, holes respected. */
export function insideGeometry([x, y]: LonLat, geometry: FieldGeometry): boolean {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.some((rings) => {
    if (!inRing(x, y, rings[0])) return false;
    for (let i = 1; i < rings.length; i++) if (inRing(x, y, rings[i])) return false;
    return true;
  });
}

function inRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Up to `max` points spread inside the field: an n×n grid over the bounding box, keeping the inside points,
 * densifying when a thin or odd shape leaves too few. Always returns at least one point.
 */
export function samplePointsInside(geometry: FieldGeometry, n = 3, max = 9): LonLat[] {
  const [minX, minY, maxX, maxY] = bboxOf(geometry);
  for (const size of [n, n + 2, n + 4]) {
    const pts: LonLat[] = [];
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const p: LonLat = [minX + ((i + 0.5) / size) * (maxX - minX), minY + ((j + 0.5) / size) * (maxY - minY)];
        if (insideGeometry(p, geometry)) pts.push(p);
      }
    }
    if (pts.length >= Math.min(max, n * n) || size === n + 4) {
      if (pts.length === 0) return [interiorPoint(geometry)];
      return evenlyPick(pts, max);
    }
  }
  return [interiorPoint(geometry)];
}

function evenlyPick<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const out: T[] = [];
  for (let k = 0; k < max; k++) out.push(items[Math.floor((k * items.length) / max)]);
  return out;
}

/** Stable short hash of the geometry (rounded to ~1 cm) used to invalidate profiles when the shape changes. */
export function geometryHash(geometry: FieldGeometry): string {
  const text = JSON.stringify(geometry.coordinates, (_k, v) => (typeof v === 'number' ? Math.round(v * 1e7) / 1e7 : v));
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}
