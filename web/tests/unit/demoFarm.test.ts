import { area, feature, featureCollection, intersect, kinks } from '@turf/turf';
import type { Feature, Polygon } from 'geojson';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { acresFromM2, squareAroundPoint } from '@/lib/domain/acreage';
import { createField } from '@/lib/domain/field';
import { validateGeometry } from '@/lib/domain/validation';
import { buildDemoFarm, DEMO_FIELDS, demoBlocker, demoGeometry, isDemoField } from '@/lib/demo/demoFarm';

const poly = (g: unknown) => feature(g as Polygon) as Feature<Polygon>;

describe('demo farm', () => {
  it('has valid, realistically sized boundaries with no overlaps', () => {
    const geoms = DEMO_FIELDS.map(demoGeometry);
    for (const g of geoms) {
      expect(validateGeometry(g)).toEqual([]);
      expect(kinks(g as Polygon).features).toHaveLength(0);
      const ac = acresFromM2(area(g));
      expect(ac).toBeGreaterThan(20);
      expect(ac).toBeLessThan(200);
    }
    for (let i = 0; i < geoms.length; i++) {
      for (let j = i + 1; j < geoms.length; j++) {
        const hit = intersect(featureCollection([poly(geoms[i]), poly(geoms[j])]));
        expect(hit ? area(hit) : 0, `${DEMO_FIELDS[i].name} × ${DEMO_FIELDS[j].name}`).toBe(0);
      }
    }
  });

  it('builds fields with confirmed 2022–2026 example crops, labeled as demo data', () => {
    const fields = buildDemoFarm(new Date('2026-11-15T00:00:00Z'));
    expect(fields).toHaveLength(DEMO_FIELDS.length);
    for (const f of fields) {
      expect(isDemoField(f)).toBe(true);
      expect(f.boundary).toBe('drawn');
      expect([f.crops.current, ...f.crops.history].map((s) => s.year)).toEqual([2026, 2025, 2024, 2023, 2022]);
      expect([f.crops.current, ...f.crops.history].every((s) => s.status === 'confirmed' && s.crop)).toBe(true);
      expect(f.cdl.status).toBe('done');
    }
  });

  it('is blocked when already loaded or when a real field overlaps it', () => {
    expect(demoBlocker([])).toBeNull();
    expect(demoBlocker(buildDemoFarm())).toMatch(/already loaded/);
    const overlapping = createField({ name: 'Mine', geometry: squareAroundPoint([-93.497, 42.031], 40), definedBy: 'polygon' });
    overlapping.pin = undefined;
    expect(demoBlocker([{ ...overlapping, boundary: 'drawn' }])).toMatch(/"Mine" overlaps/);
    const far = createField({ name: 'Far', geometry: squareAroundPoint([-93.6, 42.2], 40), definedBy: 'polygon' });
    expect(demoBlocker([{ ...far, boundary: 'drawn' }])).toBeNull();
  });

  it('does not overlap the sample import file', () => {
    const sample = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'samples', 'sample-farm.geojson'), 'utf8'));
    const samplePolys = sample.features.filter((f: Feature) => f.geometry?.type === 'Polygon').map((f: Feature) => poly(f.geometry));
    expect(samplePolys.length).toBeGreaterThanOrEqual(2);
    for (const s of samplePolys) {
      for (const d of DEMO_FIELDS) {
        const hit = intersect(featureCollection([s, poly(demoGeometry(d))]));
        expect(hit ? area(hit) : 0).toBe(0);
      }
    }
  });
});
