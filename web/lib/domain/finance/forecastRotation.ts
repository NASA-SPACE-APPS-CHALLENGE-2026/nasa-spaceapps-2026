import type { CropRef, Field, Plan } from '../types';
import { detectCycle } from '../rotation/strategies';
import type { HarvestRecord, LandRecord } from './forecastAgronomy';
import { normalizeCrop } from './forecastAgronomy';

export interface CropSeason { year: number; crops: string[]; cover?: string }
export interface FieldSchedule { previousCrop?: string; previousCover?: string; seasons: CropSeason[]; source: string }

function cropNames(ref: CropRef | null): string[] {
  if (!ref) return [];
  if (ref.kind === 'double') return [ref.first, ref.second].map(normalizeCrop);
  return [normalizeCrop(ref.kind === 'catalog' ? ref.id : ref.kind === 'other' ? ref.text : ref.name)];
}

/** A known double crop uses the same land sequentially. Unordered harvest lines cannot establish that sequence. */
export function fieldSchedule(field: Field | undefined, land: LandRecord | undefined, harvests: HarvestRecord[], plan: Plan | undefined, startYear: number, horizon: number, proposed: boolean): FieldSchedule {
  const years = Array.from({ length: horizon }, (_, i) => startYear + i);
  const history = new Map<number, string[]>();
  for (const h of harvests) {
    if (h.season >= startYear) continue;
    const crops = history.get(h.season) ?? [];
    const crop = normalizeCrop(h.crop);
    if (!crops.includes(crop)) crops.push(crop);
    history.set(h.season, crops);
  }
  for (const [year, crops] of history) if (crops.length > 1) history.set(year, []);
  for (const season of field ? [...field.crops.history, field.crops.current] : []) {
    const crops = cropNames(season.crop);
    if (season.year < startYear && crops.length && (season.origin === 'farmer' || !history.has(season.year))) history.set(season.year, crops);
  }
  const previous = history.get(startYear - 1);
  const previousCrop = land?.previousCrop ?? previous?.[previous.length - 1];
  const previousCover = land?.previousCover;
  const declared = (proposed && land?.proposedRotation?.length ? land.proposedRotation : land?.currentRotation)?.map(normalizeCrop);
  let source: string;
  let seasons: CropSeason[];
  if (declared?.length) {
    source = `${land!.source}: repeating ${proposed && land?.proposedRotation?.length ? 'proposed' : 'current'} sequence, beginning in ${startYear}.`;
    seasons = years.map((year, i) => ({ year, crops: [declared[i % declared.length]] }));
  } else {
    // Work backwards from the immediately preceding season. Never bridge a gap as consecutive crops.
    const recent: string[][] = [];
    for (let year = startYear - 1; history.get(year)?.length; year--) recent.unshift(history.get(year)!);
    const cycle = detectCycle(recent);
    source = cycle.length
      ? `Current rotation repeats the last observed crop cycle through ${startYear - 1}: ${cycle.map((s) => s.join(' + ')).join(' → ')}.`
      : 'Current rotation is missing. Enter a crop sequence or consecutive growing-season records.';
    seasons = years.map((year, i) => ({ year, crops: cycle.length ? cycle[i % cycle.length] : [] }));
  }
  if (proposed && plan?.seasons.length) {
    const ordered = [...plan.seasons].sort((a, b) => a.year - b.year);
    const first = ordered[0].year, last = ordered[ordered.length - 1].year;
    const byYear = new Map(ordered.map((s) => [s.year, s]));
    seasons = years.map((year) => {
      const ref = year > last ? first + (year - first) % (last - first + 1) : year;
      const s = byYear.get(ref);
      return { year, crops: s ? cropNames(s.crop) : [], cover: s?.cover?.species };
    });
    source = `Planner: ${plan.name} (${plan.id}, updated ${plan.updatedAt}); seasons beyond ${last} repeat the saved sequence with its covers.`;
  } else if (proposed && !land?.proposedRotation?.length) source += ' No alternative rotation entered; the proposed sequence follows the current one.';
  return { previousCrop, previousCover, seasons, source };
}
