'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import type { Polygon } from 'geojson';
import { site } from '@/content/site';
import { AddressSearch } from '@/components/fields/AddressSearch';
import { useFarm, useStore } from '@/lib/client/StoreProvider';
import { acresFromM2, areaM2 } from '@/lib/domain/acreage';
import { createField } from '@/lib/domain/field';
import type { PlotMapHandle } from './PlotMap';

const PlotMap = dynamic(() => import('./PlotMap'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-soil" aria-hidden />,
});

/**
 * /plot: draw one field boundary on satellite imagery, watch its acres, name it and save it.
 * Saving adds a real field to the app (same as the Fields screen) and opens it there.
 */
export function PlotScreen() {
  const p = site.plot;
  const map = useRef<PlotMapHandle>(null);
  const store = useStore();
  const farm = useFarm();
  const router = useRouter();
  const nameId = useId();
  const [shape, setShape] = useState<{ geometry: Polygon; closed: boolean } | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);

  const acres = shape ? acresFromM2(areaM2(shape.geometry)) : 0;
  const canSave = !!shape?.closed && acres > 0 && !saving;

  const save = async () => {
    if (!shape || !canSave) return;
    setSaving(true);
    const field = createField({ name: name || p.namePlaceholder, geometry: shape.geometry, definedBy: 'polygon', locatedVia: 'map' });
    await store.addFields([field]);
    await store.rememberField(field.id);
    router.push('/fields');
  };

  return (
    <main className="relative h-dvh overflow-hidden bg-soil text-chalk">
      <h1 className="sr-only">{p.title}</h1>
      {mapFailed ? (
        <div className="grid h-full place-items-center px-6 text-center">
          <div className="max-w-md">
            <p className="text-xl font-semibold">{p.mapError}</p>
            <Link href="/fields" className="mt-6 inline-block rounded-full bg-sprout px-6 py-3 font-semibold text-soil">
              {site.cta.secondaryLabel}
            </Link>
          </div>
        </div>
      ) : (
        <PlotMap ref={map} onShape={(geometry, closed) => setShape(geometry ? { geometry, closed } : null)} onError={() => setMapFailed(true)} />
      )}

      {/* Top bar: back home + find a place */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-3 p-3 md:flex-row md:items-start md:p-5">
        <Link href="/" className="pointer-events-auto inline-flex h-11 shrink-0 items-center gap-2 self-start rounded-full bg-soil/85 px-4 text-[15px] font-medium backdrop-blur-md hover:bg-soil">
          <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 10H4M9 5l-5 5 5 5" />
          </svg>
          {p.back}
        </Link>
        <div className="pointer-events-auto w-full rounded-2xl bg-white p-1.5 text-ink shadow-lg md:max-w-md">
          <AddressSearch variant="toolbar" lookupsOn={farm.settings.externalLookups} onPick={(center) => map.current?.flyTo(center)} />
        </div>
      </div>

      {/* Bottom panel: hint, live acres, name, actions */}
      {!mapFailed && (
        <section aria-label={p.title} className="absolute inset-x-3 bottom-3 rounded-[24px] bg-soil/92 p-4 shadow-2xl backdrop-blur-md md:inset-x-auto md:bottom-6 md:left-6 md:w-[380px] md:p-5">
          <p className="text-[15px] leading-snug text-chalk-soft" aria-live="polite">
            {shape?.closed ? p.hintDone : p.hintStart}
          </p>
          <div className="mt-4 flex items-baseline gap-2" aria-live="polite">
            <span className="font-label text-[13px] text-chalk-soft">{p.areaLabel}</span>
            <span className="ml-auto text-4xl font-semibold tabular-nums tracking-[-0.03em]" data-testid="plot-acres">
              {acres.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span className="text-lg font-semibold">{p.areaUnit}</span>
          </div>
          <label htmlFor={nameId} className="mt-4 block font-label text-[13px] text-chalk-soft">
            {p.nameLabel}
          </label>
          <input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={p.namePlaceholder}
            maxLength={60}
            className="mt-1.5 h-11 w-full rounded-xl border border-chalk/20 bg-loam px-3 text-[16px] text-chalk placeholder:text-chalk-soft/70 focus:border-sprout"
          />
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => map.current?.clear()}
              disabled={!shape}
              className="h-12 flex-1 rounded-full border border-chalk/25 font-medium transition-colors hover:border-chalk/60 disabled:opacity-40"
            >
              {p.clear}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="h-12 flex-[1.4] rounded-full bg-sprout font-semibold text-soil transition-colors hover:bg-[#a3d05e] disabled:opacity-40"
            >
              {saving ? p.saving : p.save}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
