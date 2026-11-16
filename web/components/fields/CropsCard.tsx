'use client';

import { addOlderSeason, LATEST_CDL_YEAR, MAX_HISTORY_YEARS, MIN_HISTORY_YEARS, removeOldestSeason, setSeasonCrop } from '@/lib/domain/cropHistory';
import Link from 'next/link';
import { isDemoField } from '@/lib/demo/demoFarm';
import { cropKeyOf } from '@/lib/domain/finance/budget';
import { financeCropIds } from '@/lib/domain/finance/plans';
import { cropName } from '@/lib/domain/rotation/agronomy';
import type { Field, FieldCrops, SeasonCrop } from '@/lib/domain/types';
import { CropPicker } from './CropPicker';
import { RotationStrip } from './RotationStrip';

interface Props {
  field: Field;
  lookupsOn: boolean;
  onChange: (crops: FieldCrops) => void;
  onRetryDetection: () => void;
}

export function CropsCard({ field, lookupsOn, onChange, onRetryDetection }: Props) {
  const { crops } = field;
  const demo = isDemoField(field);

  return (
    <section aria-labelledby="crops-h" className="border-t border-line pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="crops-h" className="font-plate text-lg">
          Crops
        </h3>
        <span className="text-sm text-ink-faint">
          {crops.history[crops.history.length - 1]?.year}–{crops.current.year}
        </span>
      </div>
      <div className="mt-3">
        <RotationStrip crops={crops} size="md" />
      </div>

      <CdlStatus field={field} lookupsOn={lookupsOn} onRetry={onRetryDetection} />

      <div className="mt-4 space-y-4">
        <SeasonRow demo={demo} label="This season" season={crops.current} onPick={(c) => onChange(setSeasonCrop(crops, crops.current.year, c))} />
        <div className="border-t border-line pt-3">
          <p className="mb-3 text-[15px] font-semibold">Earlier seasons</p>
          <div className="space-y-4">
            {crops.history.map((s) => (
              <SeasonRow demo={demo} key={s.year} season={s} onPick={(c) => onChange(setSeasonCrop(crops, s.year, c))} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={crops.history.length >= MAX_HISTORY_YEARS}
          onClick={() => onChange(addOlderSeason(crops))}
          className="min-h-12 rounded-parcel px-3 text-[15px] font-semibold text-field hover:bg-field-tint disabled:opacity-40"
        >
          Add {(crops.history[crops.history.length - 1]?.year ?? crops.current.year) - 1}
        </button>
        <button
          type="button"
          disabled={crops.history.length <= MIN_HISTORY_YEARS}
          onClick={() => onChange(removeOldestSeason(crops))}
          className="min-h-12 rounded-parcel px-3 text-[15px] font-semibold text-ink-soft hover:bg-paper disabled:opacity-40"
        >
          Remove {crops.history[crops.history.length - 1]?.year}
        </button>
      </div>
    </section>
  );
}

function CdlStatus({ field, lookupsOn, onRetry }: { field: Field; lookupsOn: boolean; onRetry: () => void }) {
  const { cdl } = field;
  const box = 'mt-3 rounded-parcel px-3 py-2 text-[14.5px] leading-snug';
  if (!lookupsOn) return <p className={`${box} bg-paper text-ink-soft`}>Public data lookups are off, so past crops are not detected. Enter them by hand.</p>;
  if (cdl.status === 'loading' || cdl.status === 'idle') {
    return (
      <p className={`${box} flex items-center gap-2 bg-field-tint text-field`} role="status">
        <span className="spinner" aria-hidden /> Checking USDA crop maps (Cropland Data Layer) for this field, up to {LATEST_CDL_YEAR}…
      </p>
    );
  }
  if (cdl.status === 'unavailable') {
    return (
      <div className={`${box} bg-alert-tint text-[#7a2c1d]`} role="status">
        <p>{cdl.message ?? 'USDA crop history is not available right now.'} You can enter past crops by hand.</p>
        <button type="button" onClick={onRetry} className="mt-1 min-h-10 font-semibold underline underline-offset-2">
          Try detection again
        </button>
      </div>
    );
  }
  const again = (
    <button type="button" onClick={onRetry} className="min-h-10 text-[14px] font-semibold text-field hover:underline">
      Check the crop maps again
    </button>
  );
  if (cdl.message) {
    return (
      <div className="mt-3">
        <p className={`${box} !mt-0 bg-wheat-tint text-wheat-deep`}>{cdl.message}</p>
        {again}
      </div>
    );
  }
  return <div className="mt-2">{again}</div>;
}

function SeasonRow({ season, label, demo, onPick }: { season: SeasonCrop; label?: string; demo?: boolean; onPick: (c: SeasonCrop['crop']) => void }) {
  const d = season.origin === 'cdl' ? season.detection : undefined;
  return (
    <div data-testid={`season-${season.year}`}>
      <div className="flex items-center gap-3">
        <div className="w-14 shrink-0">
          <div className="font-plate text-lg leading-none">{season.year}</div>
          {label && <div className="mt-1 text-[12.5px] text-ink-faint">{label}</div>}
        </div>
        <CropPicker value={season.crop} onChange={onPick} label={`Crop in ${season.year}`} />
      </div>
      {d && (
        <p className="ml-[68px] mt-1.5 text-[13.5px] text-ink-soft">
          From USDA crop maps: {d.cdlName}
          {d.method === 'zonal' ? `, ${d.sharePct}% of the field` : `, ${Math.round((d.sharePct / 100) * d.sampleCount)} of ${d.sampleCount} spots checked`}
        </p>
      )}
      {d?.nonCrop && (
        <p className="ml-[68px] mt-1 text-[13.5px] text-wheat-deep">USDA maps show this spot as {d.cdlName.toLowerCase()}, not cropland. Check that the boundary is on your field.</p>
      )}
      {season.status === 'confirmed' && season.origin === 'farmer' && <p className="ml-[68px] mt-1.5 text-[13.5px] text-ink-faint">{demo ? 'Example data (demo farm)' : 'You entered this'}</p>}
      <NoBudgetNote season={season} />
    </div>
  );
}

/** Tells the farmer when a crop has no Finance budget, so its seasons are left out of profit projections. */
function NoBudgetNote({ season }: { season: SeasonCrop }) {
  const ids = (financeCropIds(season.crop) ?? []).filter((id) => id !== 'fallow' && !cropKeyOf(id));
  if (!ids.length) return null;
  const names = ids.map(cropName).join(' and ');
  return (
    <p className="ml-[68px] mt-1.5 text-[13.5px] text-wheat-deep" data-testid={`no-budget-${season.year}`}>
      Finance has no published budget for {names}. Profit projections leave this crop out unless you{' '}
      <Link href="/finance?tab=inputs#own-budgets" className="font-semibold underline underline-offset-2">
        enter your own numbers
      </Link>
      .
    </p>
  );
}
