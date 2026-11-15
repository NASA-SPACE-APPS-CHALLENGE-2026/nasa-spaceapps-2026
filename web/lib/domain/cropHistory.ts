import { cropFromCdl } from './crops';
import type { CdlDetection, CropRef, FieldCrops, SeasonCrop } from './types';

/** The season the farmer just grew. Nov 2026: harvest done, planning targets 2027. */
export const CURRENT_SEASON = 2026;
export const DEFAULT_HISTORY_YEARS = 3;
export const MAX_HISTORY_YEARS = 5;
export const MIN_HISTORY_YEARS = 1;
/** Latest year USDA has released a Cropland Data Layer for (2026 is released early 2027). */
export const LATEST_CDL_YEAR = 2025;
export const EARLIEST_CDL_YEAR = 2008;

function emptySeason(year: number): SeasonCrop {
  return { year, crop: null, origin: 'farmer', status: 'empty' };
}

export function defaultCrops(current = CURRENT_SEASON, years = DEFAULT_HISTORY_YEARS): FieldCrops {
  return {
    current: emptySeason(current),
    history: Array.from({ length: years }, (_, i) => emptySeason(current - 1 - i)),
  };
}

/** Add the next-older season. No-op at the maximum. */
export function addOlderSeason(crops: FieldCrops): FieldCrops {
  if (crops.history.length >= MAX_HISTORY_YEARS) return crops;
  const oldest = crops.history.length ? crops.history[crops.history.length - 1].year : crops.current.year;
  return { ...crops, history: [...crops.history, emptySeason(oldest - 1)] };
}

/** Remove the oldest season. No-op at the minimum. */
export function removeOldestSeason(crops: FieldCrops): FieldCrops {
  if (crops.history.length <= MIN_HISTORY_YEARS) return crops;
  return { ...crops, history: crops.history.slice(0, -1) };
}

function mapSeason(crops: FieldCrops, year: number, fn: (s: SeasonCrop) => SeasonCrop): FieldCrops {
  if (crops.current.year === year) return { ...crops, current: fn(crops.current) };
  return { ...crops, history: crops.history.map((s) => (s.year === year ? fn(s) : s)) };
}

/** The farmer picked or typed a crop. Editing counts as confirming. */
export function setSeasonCrop(crops: FieldCrops, year: number, crop: CropRef | null): FieldCrops {
  return mapSeason(crops, year, (s) => ({
    ...s,
    crop,
    origin: 'farmer',
    status: crop ? 'confirmed' : 'empty',
    // Keep the detection so the UI can still say what CDL saw.
    detection: s.detection,
  }));
}

export function confirmSeason(crops: FieldCrops, year: number): FieldCrops {
  return mapSeason(crops, year, (s) => (s.status === 'detected' && s.crop ? { ...s, status: 'confirmed' } : s));
}

export function confirmAllDetected(crops: FieldCrops): FieldCrops {
  const confirm = (s: SeasonCrop): SeasonCrop => (s.status === 'detected' && s.crop ? { ...s, status: 'confirmed' } : s);
  return { current: confirm(crops.current), history: crops.history.map(confirm) };
}

export function countUnconfirmed(crops: FieldCrops): number {
  return [crops.current, ...crops.history].filter((s) => s.status === 'detected').length;
}

/** "Needs crops" when anything is detected-but-unconfirmed or the current crop is missing. */
export function needsCropReview(crops: FieldCrops): boolean {
  return countUnconfirmed(crops) > 0 || crops.current.status === 'empty';
}

export function cdlYearsFor(crops: FieldCrops): number[] {
  return [crops.current, ...crops.history]
    .map((s) => s.year)
    .filter((y) => y >= EARLIEST_CDL_YEAR && y <= LATEST_CDL_YEAR);
}

/**
 * Apply CDL detections. Farmer-entered or confirmed seasons are never overwritten;
 * empty or still-unconfirmed detected seasons take the new detection.
 */
export function applyDetections(crops: FieldCrops, detections: Record<number, CdlDetection | null>): FieldCrops {
  const apply = (s: SeasonCrop): SeasonCrop => {
    if (!(s.year in detections)) return s;
    if (s.status === 'confirmed') return s;
    const d = detections[s.year];
    if (!d) return s.status === 'detected' ? emptySeason(s.year) : s;
    return { year: s.year, crop: cropFromCdl(d.cdlCode, d.cdlName), origin: 'cdl', status: 'detected', detection: d };
  };
  return { current: apply(crops.current), history: crops.history.map(apply) };
}

/** After a boundary change, drop unconfirmed detections (they described the old shape). */
export function clearUnconfirmedDetections(crops: FieldCrops): FieldCrops {
  const clear = (s: SeasonCrop): SeasonCrop => (s.status === 'detected' ? emptySeason(s.year) : s);
  return { current: clear(crops.current), history: crops.history.map(clear) };
}
