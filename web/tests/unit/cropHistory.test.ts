import { describe, expect, it } from 'vitest';
import {
  addOlderSeason,
  applyDetections,
  cdlYearsFor,
  clearUnconfirmedDetections,
  confirmAllDetected,
  confirmSeason,
  countUnconfirmed,
  CURRENT_SEASON,
  defaultCrops,
  MAX_HISTORY_YEARS,
  needsCropReview,
  removeOldestSeason,
  setSeasonCrop,
} from '@/lib/domain/cropHistory';
import { cropFromCdl, cropLabel } from '@/lib/domain/crops';
import type { CdlDetection } from '@/lib/domain/types';

const det = (code: number, name: string, extra: Partial<CdlDetection> = {}): CdlDetection => ({
  cdlCode: code,
  cdlName: name,
  sharePct: 80,
  method: 'sampled',
  sampleCount: 5,
  nonCrop: false,
  fetchedAt: '2026-11-14T00:00:00Z',
  ...extra,
});

describe('crop history', () => {
  it('defaults to the 2026 season plus three prior years, most recent first', () => {
    const c = defaultCrops();
    expect(c.current.year).toBe(CURRENT_SEASON);
    expect(c.history.map((s) => s.year)).toEqual([2025, 2024, 2023]);
    expect([c.current, ...c.history].every((s) => s.status === 'empty')).toBe(true);
  });

  it('adds older seasons up to five and removes down to one', () => {
    let c = defaultCrops();
    for (let i = 0; i < 10; i++) c = addOlderSeason(c);
    expect(c.history).toHaveLength(MAX_HISTORY_YEARS);
    expect(c.history.map((s) => s.year)).toEqual([2025, 2024, 2023, 2022, 2021]);
    for (let i = 0; i < 10; i++) c = removeOldestSeason(c);
    expect(c.history.map((s) => s.year)).toEqual([2025]);
  });

  it('only asks CDL for released years (2008–2025)', () => {
    let c = defaultCrops();
    c = addOlderSeason(addOlderSeason(c));
    expect(cdlYearsFor(c)).toEqual([2025, 2024, 2023, 2022, 2021]);
  });

  it('applies detections as unconfirmed "detected" rows', () => {
    const c = applyDetections(defaultCrops(), { 2025: det(5, 'Soybeans'), 2024: det(1, 'Corn'), 2023: null });
    expect(c.history[0]).toMatchObject({ year: 2025, status: 'detected', origin: 'cdl', crop: { kind: 'catalog', id: 'soybeans' } });
    expect(c.history[1].crop).toEqual({ kind: 'catalog', id: 'corn' });
    expect(c.history[2].status).toBe('empty');
    expect(countUnconfirmed(c)).toBe(2);
    expect(needsCropReview(c)).toBe(true);
  });

  it('never overwrites what the farmer entered or confirmed', () => {
    let c = setSeasonCrop(defaultCrops(), 2025, { kind: 'catalog', id: 'oats' });
    c = applyDetections(c, { 2024: det(1, 'Corn') });
    c = confirmSeason(c, 2024);
    c = applyDetections(c, { 2025: det(5, 'Soybeans'), 2024: det(5, 'Soybeans') });
    expect(c.history[0].crop).toEqual({ kind: 'catalog', id: 'oats' });
    expect(c.history[1]).toMatchObject({ status: 'confirmed', crop: { kind: 'catalog', id: 'corn' } });
  });

  it('editing a detected row confirms it as farmer-entered', () => {
    let c = applyDetections(defaultCrops(), { 2025: det(5, 'Soybeans') });
    c = setSeasonCrop(c, 2025, { kind: 'catalog', id: 'corn' });
    expect(c.history[0]).toMatchObject({ status: 'confirmed', origin: 'farmer', crop: { id: 'corn' } });
    expect(c.history[0].detection?.cdlName).toBe('Soybeans'); // still remember what CDL saw
  });

  it('confirm-all confirms only detected rows', () => {
    let c = applyDetections(defaultCrops(), { 2025: det(5, 'Soybeans'), 2024: det(1, 'Corn') });
    c = confirmAllDetected(c);
    expect(c.history.slice(0, 2).every((s) => s.status === 'confirmed')).toBe(true);
    expect(c.history[2].status).toBe('empty');
    expect(countUnconfirmed(c)).toBe(0);
  });

  it('clearing an entered crop returns the row to empty', () => {
    let c = setSeasonCrop(defaultCrops(), CURRENT_SEASON, { kind: 'other', text: 'Hemp' });
    expect(c.current.status).toBe('confirmed');
    c = setSeasonCrop(c, CURRENT_SEASON, null);
    expect(c.current.status).toBe('empty');
  });

  it('a boundary change drops only unconfirmed detections', () => {
    let c = applyDetections(defaultCrops(), { 2025: det(5, 'Soybeans'), 2024: det(1, 'Corn') });
    c = confirmSeason(c, 2024);
    c = clearUnconfirmedDetections(c);
    expect(c.history[0].status).toBe('empty');
    expect(c.history[1].status).toBe('confirmed');
  });
});

describe('CDL class mapping', () => {
  it('maps single crops, double crops, rotation states and unknown classes', () => {
    expect(cropFromCdl(1)).toEqual({ kind: 'catalog', id: 'corn' });
    expect(cropFromCdl(26)).toEqual({ kind: 'double', first: 'winter-wheat', second: 'soybeans' });
    expect(cropLabel(cropFromCdl(26))).toBe('Winter wheat → Soybeans (double crop)');
    expect(cropFromCdl(61)).toEqual({ kind: 'catalog', id: 'fallow' });
    expect(cropFromCdl(176)).toEqual({ kind: 'catalog', id: 'grass-pasture' });
    expect(cropFromCdl(142, 'Evergreen Forest')).toEqual({ kind: 'cdl-raw', code: 142, name: 'Evergreen Forest' });
    expect(cropFromCdl(69)).toEqual({ kind: 'cdl-raw', code: 69, name: 'Grapes' });
  });

  it('flags non-crop detections when applied', () => {
    const c = applyDetections(defaultCrops(), { 2025: det(122, 'Developed/Low Intensity', { nonCrop: true }) });
    expect(c.history[0].detection?.nonCrop).toBe(true);
    expect(cropLabel(c.history[0].crop)).toBe('Developed/Low Intensity');
  });
});
