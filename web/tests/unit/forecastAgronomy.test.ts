import { describe, expect, it } from 'vitest';
import { createField } from '@/lib/domain/field';
import {
  agronomyAssumptionSchema, canonicalUnit, convertQuantity, forecastAcreage, forecastAgronomy, normalizeCrop, prepareHarvestHistory,
  type AgronomyAssumption, type AgronomyRequest, type HarvestRecord, type LandRecord,
} from '@/lib/domain/finance/forecastAgronomy';
import { AMES_FIELD } from './helpers';

const land: LandRecord = { id: 'north', source: 'FSA acreage certification', acres: 100, unavailableAcres: 10, plantedAcres: 80 };
const harvest = (id: string, season: number, plantedAcres: number, harvestedAcres: number, quantity: number, extra: Partial<HarvestRecord> = {}): HarvestRecord =>
  ({ id, season, crop: 'corn', fieldId: 'north', source: 'Calibrated harvest monitor', plantedAcres, harvestedAcres, quantity, unit: 'bu', ...extra });
const assumption = (kind: AgronomyAssumption['kind'], value: number, extra: Partial<AgronomyAssumption> = {}): AgronomyAssumption =>
  ({ id: kind, source: 'Field agronomist', kind, value, ...extra });
function forecast(extra: Partial<AgronomyRequest> = {}) {
  return forecastAgronomy({
    fieldId: 'north', crop: 'corn', season: 2027, startYear: 2027, scenario: 'expected',
    acreage: forecastAcreage(undefined, land), assumptions: [],
    harvests: [harvest('old', 2024, 25, 20, 2000), harvest('recent', 2026, 75, 70, 9800 * 56, { unit: 'lb' })], ...extra,
  });
}

describe('field area and crop production units', () => {
  it('preserves a farmer correction and projects WGS84 geometry with holes and disconnected parcels', () => {
    const field = createField({ geometry: AMES_FIELD, name: 'Iowa', definedBy: 'import' });
    const gross = forecastAcreage(field).acres!;
    // Area of the fixture's longitude/latitude rectangle integrated on the WGS84 ellipsoid.
    expect(gross).toBeCloseTo(72.758628, 3);
    const coords = [[[-93.740, 42.007], [-93.736, 42.007], [-93.736, 42.009], [-93.740, 42.009], [-93.740, 42.007]]];
    if (AMES_FIELD.type !== 'Polygon') throw new Error('Fixture needs a polygon.');
    const withHole = forecastAcreage(undefined, { id: 'A', source: 'Survey map', geometry: { type: 'Polygon', coordinates: [...AMES_FIELD.coordinates, ...coords] } });
    expect(withHole.acres).toBeCloseTo(gross * 0.75, 2);
    const parts = [AMES_FIELD.coordinates, AMES_FIELD.coordinates.map(r => r.map(([x, y]) => [x + 0.01, y]))];
    expect(forecastAcreage(undefined, { id: 'A', source: 'Survey', geometry: { type: 'MultiPolygon', coordinates: parts } }).acres).toBeCloseTo(2 * gross, 2);
    const corrected = forecastAcreage(field, { ...land, acres: 103 }, 102);
    expect(corrected.acres).toBe(102);
    expect(corrected.usableAcres).toBe(92);
    expect(corrected.trace.join(' ')).toMatch(/Farmer acreage correction/);
    expect(corrected.harvestedAcres).toBeNull();
  });

  it('flags invalid boundaries and contradictory areas', () => {
    const bad = forecastAcreage(undefined, { id: 'crossed', source: 'Map', geometry: { type: 'Polygon', coordinates: [[[0,0],[1,1],[0,1],[1,0],[0,0]]] } });
    expect(bad.acres).toBeNull();
    expect(bad.issues.join(' ')).toMatch(/crosses itself/);
    const impossible = forecast({ acreage: forecastAcreage(undefined, { ...land, plantedAcres: 110 }) });
    expect(impossible.production).toBeNull();
    expect(impossible.issues.join(' ')).toMatch(/exceeds available land/);
  });

  it('normalizes catalog crop aliases and uses crop-specific bushel trade weights', () => {
    expect(normalizeCrop('Field Corn')).toBe('corn');
    expect(normalizeCrop('wheat')).toBe('wheat');
    expect(canonicalUnit('soybean')).toBe('bu');
    expect(convertQuantity(1, 'short ton', 'cwt', 'alfalfa')).toBe(20);
    expect(convertQuantity(1, 'tonne', 'kg', 'alfalfa')).toBeCloseTo(1000, 9);
    expect(convertQuantity(1, 'bushel', 'pounds', 'corn')).toBe(56);
    expect(convertQuantity(1, 'bushel', 'lb', 'soybeans')).toBe(60);
    expect(convertQuantity(1, 'bu', 'lb', 'oats')).toBe(32);
    expect(convertQuantity(1, 'bu', 'lb', 'alfalfa')).toBeNull();
    expect(convertQuantity(5, 'cartons', 'lb', 'peaches')).toBeNull();
  });
});

describe('sourced yield, acreage, and rotation', () => {
  it('uses harvested-acre weights, distinct planted/harvested acres, and sourced recency weights', () => {
    const result = forecast({ assumptions: [assumption('recencyWeight', 2, { season: 2026, id: 'w26' })] });
    expect(result.plantedAcres).toBe(80);
    expect(result.harvestedAcres).toBe(72);
    expect(result.yieldPerAcre).toBe((2000 + 2 * 9800) / (20 + 2 * 70));
    expect(result.production).toBe(72 * 135);
    expect(result.confidence).toBe('low');
    expect(result.trace.join(' ')).toContain('w26');
    expect(result.trace.join(' ')).toContain('8.00 planted acres expected to remain unharvested');
  });

  it('keeps validation separate from history, excludes future records, and never fabricates plantable acreage or uncertainty', () => {
    const one = harvest('one', 2025, 60, 55, 6600);
    const records = [one, one, harvest('future', 2027, 20, 20, 8000), harvest('bad', 2024, 2, 10, 100)];
    const value = forecast({ harvests: records, assumptions: [assumption('benchmark', 130, { crop: 'corn' })] });
    expect(value.yieldPerAcre).toBe(120);
    expect(value.issues.join(' ')).toMatch(/Duplicate harvest/);
    expect(value.issues.join(' ')).toMatch(/conflicts with acreage/);
    expect(value.trace.join(' ')).toMatch(/comparison for sparse history/);
    expect(forecast({ scenario: 'optimistic', harvests: records }).yieldPerAcre).toBeNull();
    const gap = forecast({ acreage: forecastAcreage(undefined, { id: 'north', acres: 45, source: 'Survey' }), harvests: [] });
    expect(gap.plantedAcres).toBeNull(); expect(gap.harvestedAcres).toBeNull(); expect(gap.production).toBeNull();
    const harvestOnly = forecast({
      acreage: forecastAcreage(undefined, { id: 'north', acres: 70, source: 'Survey' }),
      harvests: [{ ...one, plantedAcres: undefined }],
    });
    expect(harvestOnly.plantedAcres).toBeNull();
    expect(harvestOnly.harvestedAcres).toBe(55);
    expect(harvestOnly.production).toBe(6600);
  });

  it('bounds uncertainty using observed seasonal yields and applies scenario weather deltas to the central yield once', () => {
    expect(forecast({ scenario: 'conservative' }).yieldPerAcre).toBe(100);
    expect(forecast({ scenario: 'optimistic' }).yieldPerAcre).toBe(140);
    const weather = assumption('weather', -5, { season: 2027, scenario: 'conservative', unit: 'bu/ac' });
    expect(forecast({ scenario: 'conservative', assumptions: [weather] }).yieldPerAcre).toBe(11800 / 90 - 5);
    expect(forecast({ scenario: 'expected', assumptions: [weather] }).yieldPerAcre).toBe(11800 / 90);
    expect(forecast({ scenario: 'conservative', assumptions: [assumption('yield', 140)] }).production).toBeNull();
    expect(forecast({ scenario: 'optimistic', harvests: [], assumptions: [assumption('benchmark', 140)] }).production).toBeNull();
  });

  it('conditions repeated field observations on the preceding crop and handles a measured soil or management effect separately', () => {
    const rows = Array.from({ length: 6 }, (_, i) => harvest(`r${i}`, 2020+i, 80, 80, 80 * (i % 2 ? 130 : 115), { previousCrop: i % 2 ? 'soybean' : 'corn' }));
    const withSoy = forecast({ previousCrop: 'soybeans', harvests: rows, assumptions: [assumption('management', 3, { season: 2027 })] });
    const withCorn = forecast({ previousCrop: 'corn', harvests: rows });
    expect(withSoy.yieldPerAcre).toBe(133);
    expect(withCorn.yieldPerAcre).toBe(115);
    expect(withSoy.trace.join(' ')).toMatch(/Observed rotation adjustment/);
    const benchmark = assumption('benchmark', 150, { previousCrop: 'soybeans' });
    const rotation = assumption('rotation', 7, { previousCrop: 'soybeans' });
    expect(forecast({ previousCrop: 'soybeans', harvests: [], assumptions: [benchmark, rotation] }).yieldPerAcre).toBe(150);
    expect(forecast({ harvests: rows, assumptions: [assumption('yield', 125), assumption('management', 3)] }).yieldPerAcre).toBe(125);
    expect(forecast({ previousCrop: 'soybeans', harvests: rows, assumptions: [rotation] }).yieldPerAcre).toBe(130);
  });

  it('applies only additional harvest loss and flags extreme measured production without removing it', () => {
    const records = [0, 1, 2, 3, 4].map(i => harvest(String(i), 2020 + i, 80, 80, (i === 4 ? 300 : 100) * 80, { harvestLossQuantity: 125 }));
    const result = forecast({ harvests: records, assumptions: [assumption('harvestLoss', 4, { unit: 'bu/ac' })] });
    expect(result.yieldPerAcre).toBe(136);
    expect(result.issues.join(' ')).toMatch(/unusual yield/);
    expect(result.trace.join(' ')).toMatch(/125 bu lost/);
    expect(result.production).toBe(136 * 80);
  });

  it('recovers the predecessor from an unambiguous adjacent field season and cites that record', () => {
    const records = Array.from({ length: 9 }, (_, i) => {
      const crop = i % 3 === 0 ? 'soybeans' : 'corn';
      const yieldPerAcre = crop === 'soybeans' ? 45 : i % 3 === 1 ? 160 : 120;
      return harvest(`year-${2015 + i}`, 2015 + i, 80, 80, 80 * yieldPerAcre, { crop });
    });
    const result = forecast({ previousCrop: 'soybeans', harvests: records });
    const history = prepareHarvestHistory(records, 2027);
    expect(forecast({ previousCrop: 'soybeans', harvests: records, history })).toEqual(result);
    expect(history.byCrop.get('soybeans')).toHaveLength(3);
    expect(result.yieldPerAcre).toBe(160);
    expect(result.trace.join(' ')).toMatch(/preceding season's harvest: year-2015/);
    expect(records.some(r => r.previousCrop)).toBe(false);
  });

  it('respects zero harvests, bounded area efficiency, fallow plans, conflicts and invalid units', () => {
    expect(forecast({ acreage: forecastAcreage(undefined, { ...land, harvestedAcres: 0 }) }).production).toBe(0);
    expect(forecast({ assumptions: [assumption('harvestEfficiency', 0.5)] }).harvestedAcres).toBe(40);
    expect(forecast({ crop: 'fallow' }).production).toBe(0);
    expect(forecast({ assumptions: [assumption('yield', 120), assumption('yield', 140, { id: 'contradiction' })] }).yieldPerAcre).toBeNull();
    expect(forecast({ assumptions: [assumption('yield', 10, { unit: 'crates' })] }).yieldPerAcre).toBeNull();
    expect(agronomyAssumptionSchema.safeParse(assumption('harvestEfficiency', 2)).success).toBe(false);
    expect(agronomyAssumptionSchema.safeParse(assumption('recencyWeight', 2)).success).toBe(false);
  });
});
