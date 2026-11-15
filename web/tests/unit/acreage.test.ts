import { describe, expect, it } from 'vitest';
import {
  acresFromM2,
  areaM2,
  formatAcres,
  geometryHash,
  insideGeometry,
  M2_PER_ACRE,
  samplePointsInside,
  squareAroundPoint,
} from '@/lib/domain/acreage';
import type { FieldGeometry } from '@/lib/domain/types';

describe('acreage', () => {
  it('converts square metres to acres', () => {
    expect(acresFromM2(M2_PER_ACRE)).toBeCloseTo(1, 10);
    expect(acresFromM2(1_000_000)).toBeCloseTo(247.105, 2);
  });

  it('computes geodesic area of a known polygon (1/16 mile² ≈ 40 ac at the equator)', () => {
    // 0.00363° × 0.00363° at the equator ≈ 404 m × 404 m ≈ 40.3 ac
    const g: FieldGeometry = { type: 'Polygon', coordinates: [[[0, 0], [0.00363, 0], [0.00363, 0.00363], [0, 0.00363], [0, 0]]] };
    expect(acresFromM2(areaM2(g))).toBeGreaterThan(39.5);
    expect(acresFromM2(areaM2(g))).toBeLessThan(41);
  });

  it('subtracts holes and sums multipolygon parts', () => {
    const outer = [[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]];
    const hole = [[0.0025, 0.0025], [0.0075, 0.0025], [0.0075, 0.0075], [0.0025, 0.0075], [0.0025, 0.0025]];
    const solid = areaM2({ type: 'Polygon', coordinates: [outer] });
    const holed = areaM2({ type: 'Polygon', coordinates: [outer, hole] });
    expect(holed / solid).toBeCloseTo(0.75, 2);
    const multi = areaM2({ type: 'MultiPolygon', coordinates: [[outer], [outer.map(([x, y]) => [x + 1, y])]] });
    expect(multi / solid).toBeCloseTo(2, 2);
  });

  it.each([
    [40, 42.0],
    [160, 42.0],
    [0.5, 30.0],
    [2500, 47.5],
  ])('pin square of %s ac at lat %s has the requested area within 0.5%%', (acres, lat) => {
    const g = squareAroundPoint([-95, lat], acres);
    expect(Math.abs(acresFromM2(areaM2(g)) - acres) / acres).toBeLessThan(0.005);
  });

  it('pin square is centred on the pin and closed', () => {
    const g = squareAroundPoint([-93.6, 42.03], 40);
    if (g.type !== 'Polygon') throw new Error('expected polygon');
    const ring = g.coordinates[0];
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    const cx = (ring[0][0] + ring[2][0]) / 2;
    const cy = (ring[0][1] + ring[2][1]) / 2;
    expect(cx).toBeCloseTo(-93.6, 5);
    expect(cy).toBeCloseTo(42.03, 5);
  });

  it('rejects impossible pin acreages', () => {
    expect(() => squareAroundPoint([-93, 42], 0)).toThrow(RangeError);
    expect(() => squareAroundPoint([-93, 42], Number.NaN)).toThrow(RangeError);
    expect(() => squareAroundPoint([-93, 42], 1e7)).toThrow(RangeError);
  });

  it('formats acres for display', () => {
    expect(formatAcres(M2_PER_ACRE * 40)).toBe('40.0 ac');
    expect(formatAcres(M2_PER_ACRE * 1234.56)).toBe('1,234.6 ac');
    expect(formatAcres(M2_PER_ACRE * 0.25)).toBe('0.3 ac');
  });

  it('samples points strictly inside odd shapes', () => {
    // L-shape: bbox centre is outside the field
    const L: FieldGeometry = { type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.002], [0.002, 0.002], [0.002, 0.01], [0, 0.01], [0, 0]]] };
    const pts = samplePointsInside(L, 3, 9);
    expect(pts.length).toBeGreaterThanOrEqual(3);
    for (const p of pts) expect(insideGeometry(p, L)).toBe(true);
    const square = squareAroundPoint([-93, 42], 40);
    expect(samplePointsInside(square, 3, 9)).toHaveLength(9);
  });

  it('geometry hash is stable and changes with the shape', () => {
    const a = squareAroundPoint([-93, 42], 40);
    expect(geometryHash(a)).toBe(geometryHash(JSON.parse(JSON.stringify(a))));
    expect(geometryHash(a)).not.toBe(geometryHash(squareAroundPoint([-93, 42], 41)));
  });
});
