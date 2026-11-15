'use client';

import Link from 'next/link';
import { formatAcres } from '@/lib/domain/acreage';
import { needsCropReview } from '@/lib/domain/cropHistory';
import { cropLabel } from '@/lib/domain/crops';
import { isDemoField } from '@/lib/demo/demoFarm';
import type { FarmSettings, Field } from '@/lib/domain/types';
import { Badge } from '../ui/Badge';
import { Button, buttonClass } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { FieldShape } from '../ui/FieldShape';
import { RotationStrip } from '../ui/RotationStrip';

interface Props {
  fields: Field[];
  loaded: boolean;
  selectedId: string | null;
  settings: FarmSettings;
  onSelect: (id: string) => void;
  /** Pointer or keyboard focus on a field row (null when it leaves): lights up the field on the map. */
  onHover?: (id: string | null) => void;
  onAdd: () => void;
  onToggleLookups: (on: boolean) => void;
  onLoadDemo: () => void;
  /** Why the demo farm can't be loaded (already loaded, overlaps a field), or null. */
  demoBlocker: string | null;
}

export function FieldList({ fields, loaded, selectedId, settings, onSelect, onHover, onAdd, onToggleLookups, onLoadDemo, demoBlocker }: Props) {
  const drawn = fields.filter((f) => f.boundary !== 'approximate');
  const totalM2 = drawn.reduce((s, f) => s + f.areaM2, 0);
  return (
    <div className="flex min-h-full flex-col px-4 pb-4 pt-3 lg:px-5 lg:pt-6">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-plate text-[28px]">Your fields</h1>
          {fields.length > 0 && (
            <p className="mt-1 text-[15px] text-ink-soft">
              {fields.length} field{fields.length === 1 ? '' : 's'}
              {drawn.length > 0 && (
                <>
                  , <span className="font-semibold tabular-nums text-ink">{formatAcres(totalM2)}</span>
                </>
              )}
              {drawn.length < fields.length && (drawn.length === 0 ? ', no boundaries drawn yet' : ` (${fields.length - drawn.length} without a boundary)`)}
            </p>
          )}
        </div>
        {fields.length > 0 && (
          <Button onClick={onAdd} className="shrink-0">
            <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
              <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            Add field
          </Button>
        )}
      </div>

      {!loaded && (
        <p className="mt-6 text-[15px] text-ink-soft" role="status">
          Loading your fields…
        </p>
      )}

      {loaded && fields.length === 0 && (
        <EmptyState
          className="mt-6"
          title="Add your first field"
          action={<Button onClick={onAdd}>Add field</Button>}
          secondary={
            <Link href="/imports" className={buttonClass('ghost')}>
              Import boundary file
            </Link>
          }
        >
          <p>Find it by address, ZIP code or on the map, then trace its edges. Tell us what you grew, and PlotTwist looks up the weather, soil and terrain.</p>
        </EmptyState>
      )}
      {loaded && fields.length === 0 && !demoBlocker && (
        <p className="mt-4 text-[14.5px] text-ink-soft">
          Just exploring?{' '}
          <button type="button" onClick={onLoadDemo} className="min-h-10 font-semibold text-field underline underline-offset-2 hover:decoration-2">
            Load the demo farm
          </button>{' '}
          (6 example fields near Ames, Iowa).
        </p>
      )}

      {fields.length > 0 && (
        <ul className="mt-5 divide-y divide-line border-y border-line" aria-label="Fields" onMouseLeave={() => onHover?.(null)}>
          {fields.map((f) => {
            const review = needsCropReview(f.crops);
            const selected = f.id === selectedId;
            const now = f.crops.current;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onSelect(f.id)}
                  onMouseEnter={() => onHover?.(f.id)}
                  onFocus={() => onHover?.(f.id)}
                  onBlur={() => onHover?.(null)}
                  aria-current={selected ? 'true' : undefined}
                  className={`group relative -mx-2 block w-[calc(100%+1rem)] rounded-parcel px-2 py-4 text-left transition-colors hover:bg-panel focus-visible:bg-panel ${selected ? 'bg-panel' : ''}`}
                >
                  <span className={`absolute inset-y-3 left-0 w-[3px] rounded-full bg-field transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`} aria-hidden />
                  <span className="flex items-start gap-3">
                    <FieldShape geometry={f.feature.geometry} crop={now.crop} pinOnly={f.boundary === 'approximate'} size={52} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[17px] font-semibold leading-tight">{f.name}</span>
                        <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">{f.boundary === 'approximate' ? <span className="font-normal text-ink-soft">No boundary</span> : formatAcres(f.areaM2)}</span>
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[14.5px] text-ink-soft">
                        <span className="truncate">{now.crop ? `${now.year}: ${cropLabel(now.crop)}` : `${now.year}: crop not entered`}</span>
                        {isDemoField(f) && <Badge tone="neutral">Demo</Badge>}
                        {f.boundary === 'approximate' && <Badge tone="caution" icon="caution">Boundary not drawn</Badge>}
                        {review && <Badge tone="caution" icon="caution">Crops not confirmed</Badge>}
                      </span>
                    </span>
                  </span>
                  <RotationStrip crops={f.crops} size="md" className="mt-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {fields.length > 0 && !demoBlocker && (
        <p className="mt-4 text-[14px] text-ink-soft">
          <button type="button" onClick={onLoadDemo} className="min-h-10 font-semibold text-field hover:underline">
            Add the demo farm
          </button>{' '}
          (6 example fields near Ames, Iowa)
        </p>
      )}

      <div className="mt-auto pt-8">
        <label className="flex cursor-pointer items-start gap-3 border-t border-line pt-4">
          <input type="checkbox" checked={settings.externalLookups} onChange={(e) => onToggleLookups(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-field)]" />
          <span className="text-[14px] leading-snug text-ink-soft">
            <span className="block font-semibold text-ink">Look up public data for my fields</span>
            Sends each field&rsquo;s location to NASA, USDA and USGS to fetch weather, soil, terrain and crop history, and the addresses you type to address lookup services (Photon and the US Census Bureau). Fields stay saved in this browser only.
          </span>
        </label>
      </div>
    </div>
  );
}
