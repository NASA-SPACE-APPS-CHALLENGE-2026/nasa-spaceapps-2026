'use client';

import Link from 'next/link';
import { formatAcres } from '@/lib/domain/acreage';
import { needsCropReview } from '@/lib/domain/cropHistory';
import { cropColor } from '@/lib/domain/cropColors';
import { cropLabel } from '@/lib/domain/crops';
import { useLastFieldId } from '@/lib/client/session';
import { useFarm } from '@/lib/client/StoreProvider';
import { WheatRow } from '../art/Logo';
import { RotationStrip } from '../fields/RotationStrip';

/** A light, honest summary of what the farmer has entered so far. The full dashboard comes in a later milestone. */
export function OverviewScreen() {
  const { fields, loaded } = useFarm();
  const lastFieldId = useLastFieldId();
  const drawn = fields.filter((f) => f.boundary !== 'approximate');
  const totalM2 = drawn.reduce((s, f) => s + f.areaM2, 0);
  const review = fields.filter((f) => needsCropReview(f.crops));
  const noBoundary = fields.filter((f) => f.boundary === 'approximate');

  // Area by this season's crop.
  const byCrop = new Map<string, { label: string; color: string; m2: number; count: number }>();
  for (const f of drawn) {
    const c = f.crops.current.crop;
    const key = c ? JSON.stringify(c) : 'none';
    const row = byCrop.get(key) ?? { label: c ? cropLabel(c) : 'Not entered', color: c ? cropColor(c) : 'transparent', m2: 0, count: 0 };
    row.m2 += f.areaM2;
    row.count += 1;
    byCrop.set(key, row);
  }
  const cropRows = [...byCrop.values()].sort((a, b) => b.m2 - a.m2);
  const rotationField = fields.find((f) => f.id === lastFieldId) ?? fields[0];

  const action = (href: string, label: string, primary = false) => (
    <Link
      href={href}
      className={`inline-flex min-h-12 items-center rounded-[var(--radius-control)] px-5 font-semibold ${primary ? 'bg-sky text-white hover:bg-sky-deep' : 'border border-line-strong bg-panel text-sky-deep hover:border-sky'}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6 lg:px-8 lg:py-10">
        <h1 className="font-plate text-3xl">Overview</h1>
        {loaded && fields.length === 0 ? (
          <section className="mt-6 max-w-2xl rounded-[var(--radius-panel)] border border-line bg-panel p-6">
            <WheatRow className="h-16 w-32" />
            <h2 className="mt-3 font-plate text-xl">Start by adding your fields</h2>
            <p className="mt-1 text-[16px] leading-relaxed text-ink-soft">Trace each field on the satellite map or import a boundary file. FieldShift then pulls in weather, soil and crop history for each one.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {action('/fields', 'Add a field', true)}
              {action('/imports', 'Import data')}
            </div>
          </section>
        ) : (
          <>
            <p className="mt-1 text-[16px] text-ink-soft">
              {fields.length} field{fields.length === 1 ? '' : 's'}
              {drawn.length > 0 && `, ${formatAcres(totalM2)}`}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {rotationField && action(`/rotation?field=${encodeURIComponent(rotationField.id)}`, 'Explore rotation', true)}
              {action('/planner', 'Open planner')}
              {action('/fields', 'Add a field')}
              {action('/imports', 'Import data')}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <section className="rounded-[var(--radius-panel)] border border-line bg-panel p-5" aria-labelledby="ov-crops">
                <h2 id="ov-crops" className="font-plate text-xl">
                  This season (2026)
                </h2>
                <ul className="mt-3 space-y-2">
                  {cropRows.map((r) => (
                    <li key={r.label} className="flex items-center gap-3 text-[15px]">
                      <span className={`h-3.5 w-3.5 shrink-0 rounded-sm ${r.color === 'transparent' ? 'border border-dashed border-line-strong' : ''}`} style={{ background: r.color }} aria-hidden />
                      <span className="min-w-0 flex-1">{r.label}</span>
                      <span className="text-ink-soft">
                        {r.count} field{r.count === 1 ? '' : 's'}, {formatAcres(r.m2)}
                      </span>
                    </li>
                  ))}
                  {cropRows.length === 0 && <li className="text-[15px] text-ink-soft">No fields with a drawn boundary yet.</li>}
                </ul>
              </section>

              <section className="rounded-[var(--radius-panel)] border border-line bg-panel p-5" aria-labelledby="ov-todo">
                <h2 id="ov-todo" className="font-plate text-xl">
                  Needs your attention
                </h2>
                <ul className="mt-3 space-y-2 text-[15px]">
                  {review.length > 0 && (
                    <li>
                      <span className="font-semibold text-wheat-deep">{review.length}</span> field{review.length === 1 ? ' has' : 's have'} crops to confirm or enter.
                    </li>
                  )}
                  {noBoundary.length > 0 && (
                    <li>
                      <span className="font-semibold text-wheat-deep">{noBoundary.length}</span> field{noBoundary.length === 1 ? ' has' : 's have'} no drawn boundary yet.
                    </li>
                  )}
                  {review.length === 0 && noBoundary.length === 0 && <li className="text-ink-soft">Nothing right now.</li>}
                </ul>
                <Link href="/fields" className="mt-3 inline-flex min-h-11 items-center font-semibold text-sky-deep hover:underline">
                  Review fields
                </Link>
              </section>
            </div>

            <section className="mt-4 rounded-[var(--radius-panel)] border border-line bg-panel p-5" aria-labelledby="ov-rot">
              <h2 id="ov-rot" className="font-plate text-xl">
                Rotations
              </h2>
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {fields.map((f) => (
                  <li key={f.id}>
                    <Link href={`/rotation?field=${encodeURIComponent(f.id)}`} className="block rounded-[var(--radius-control)] border border-line p-3 hover:border-sky">
                      <span className="flex justify-between gap-2 text-[15px]">
                        <span className="truncate font-semibold">{f.name}</span>
                        <span className="shrink-0 text-ink-soft">Explore</span>
                      </span>
                      <span className="mt-2 block">
                        <RotationStrip crops={f.crops} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
            <p className="mt-6 text-[14px] text-ink-faint">The full farm dashboard (weather risk, plan progress and finances across fields) comes in a later milestone.</p>
          </>
        )}
      </div>
    </div>
  );
}
