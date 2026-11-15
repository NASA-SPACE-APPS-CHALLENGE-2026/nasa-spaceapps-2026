'use client';

import Link from 'next/link';
import { formatAcres } from '@/lib/domain/acreage';
import { needsCropReview } from '@/lib/domain/cropHistory';
import { cropLabel } from '@/lib/domain/crops';
import type { FarmSettings, Field } from '@/lib/domain/types';
import { WheatRow } from '../art/Logo';
import { Button } from '../ui/Button';
import { RotationStrip } from './RotationStrip';

interface Props {
  fields: Field[];
  loaded: boolean;
  selectedId: string | null;
  settings: FarmSettings;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onToggleLookups: (on: boolean) => void;
}

export function FieldList({ fields, loaded, selectedId, settings, onSelect, onAdd, onToggleLookups }: Props) {
  const totalM2 = fields.reduce((s, f) => s + f.areaM2, 0);
  return (
    <div className="flex min-h-full flex-col p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-plate text-2xl">Your fields</h1>
          {fields.length > 0 && (
            <p className="text-[15px] text-ink-soft">
              {fields.length} field{fields.length === 1 ? '' : 's'}, {formatAcres(totalM2)}
            </p>
          )}
        </div>
        {fields.length > 0 && <Button onClick={onAdd}>Add field</Button>}
      </div>

      {loaded && fields.length === 0 && (
        <div className="mt-6 rounded-[var(--radius-panel)] border border-line bg-panel p-5">
          <WheatRow className="h-16 w-32" />
          <h2 className="mt-3 font-plate text-xl">Add your first field</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">
            Draw it on the satellite map, drop a pin, or start from a ZIP code. Then tell us what you grew. We look up the weather, soil and terrain for you.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={onAdd}>Add field</Button>
            <Link href="/imports" className="inline-flex min-h-12 items-center rounded-[var(--radius-control)] px-4 text-[15px] font-semibold text-sky-deep hover:bg-sky-tint">
              Import boundary file
            </Link>
          </div>
        </div>
      )}

      <ul className="mt-4 space-y-2" aria-label="Fields">
        {fields.map((f) => {
          const review = needsCropReview(f.crops);
          const selected = f.id === selectedId;
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onSelect(f.id)}
                aria-current={selected ? 'true' : undefined}
                className={`w-full rounded-[var(--radius-panel)] border bg-panel p-4 text-left transition-colors hover:border-sky ${selected ? 'border-sky ring-2 ring-sky/25' : 'border-line'}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[17px] font-semibold">{f.name}</span>
                  <span className="shrink-0 text-[15px] text-ink-soft">{formatAcres(f.areaM2)}</span>
                </div>
                <p className="mt-0.5 truncate text-[14.5px] text-ink-soft">
                  {f.crops.current.crop ? `${f.crops.current.year}: ${cropLabel(f.crops.current.crop)}` : `${f.crops.current.year}: crop not entered`}
                </p>
                <div className="mt-3">
                  <RotationStrip crops={f.crops} />
                </div>
                {review && <p className="mt-2 text-[13.5px] font-semibold text-wheat-deep">Crops not confirmed</p>}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto pt-6">
        <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-panel)] border border-line bg-panel p-3">
          <input type="checkbox" checked={settings.externalLookups} onChange={(e) => onToggleLookups(e.target.checked)} className="mt-1 h-5 w-5 accent-[var(--color-sky)]" />
          <span className="text-[14px] leading-snug text-ink-soft">
            <span className="block font-semibold text-ink">Look up public data for my fields</span>
            Sends each field&rsquo;s location to NASA, USDA and USGS to fetch weather, soil, terrain and crop history. Fields stay saved in this browser only.
          </span>
        </label>
      </div>
    </div>
  );
}
