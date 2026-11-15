'use client';

import Link from 'next/link';
import { ASSUMPTION_BY_ID } from '@/lib/domain/finance/assumptions';
import { useFarm } from '@/lib/client/StoreProvider';
import { useEffectiveFinance } from '@/lib/client/useEffectiveFinance';

/** What applied imports currently change, so the farmer can see the effect in one place. */
export function ImportsSummary() {
  const { imports, fields } = useFarm();
  const { imported } = useEffectiveFinance();
  if (!imports.length) return null;
  const params = Object.entries(imported.overrides);
  const fieldNotes = Object.entries(imported.fields).flatMap(([id, v]) => {
    const name = fields.find((f) => f.id === id)?.name ?? 'A field';
    return [v.nRateCorn !== undefined ? `${name}: ${v.nRateCorn} lb N/ac on corn` : null, v.tillage ? `${name}: ${v.tillage}` : null].filter((x): x is string => !!x);
  });
  const total = params.length + fieldNotes.length + (imported.lastYear.totalRevenue !== undefined ? 1 : 0) + (imported.lastYear.totalCosts !== undefined ? 1 : 0);
  return (
    <section aria-labelledby="applied-h" className="mt-6 rounded-parcel border border-field/30 bg-field-tint p-5" data-testid="imports-summary">
      <h2 id="applied-h" className="font-plate text-xl text-field">
        What your records change
      </h2>
      {total === 0 ? (
        <p className="mt-1 text-[15px]">Your imported records are kept, but no values from them are in use. Use “Change” on a file to pick some.</p>
      ) : (
        <>
          <p className="mt-1 text-[15px]">
            {total} value{total === 1 ? '' : 's'} from your files {total === 1 ? 'is' : 'are'} in use in Finance, Overview and the Simulator. Numbers you type in Finance still win.
          </p>
          <ul className="mt-3 grid gap-x-6 gap-y-1 text-[14.5px] sm:grid-cols-2">
            {imported.lastYear.totalRevenue !== undefined && <li>Last year’s revenue: ${imported.lastYear.totalRevenue.toLocaleString('en-US')}</li>}
            {imported.lastYear.totalCosts !== undefined && <li>Last year’s costs: ${imported.lastYear.totalCosts.toLocaleString('en-US')}</li>}
            {params.map(([id, v]) => (
              <li key={id}>
                {ASSUMPTION_BY_ID[id]?.label ?? id}: {v.toLocaleString('en-US')} {ASSUMPTION_BY_ID[id]?.unit}
              </li>
            ))}
            {fieldNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <Link href="/finance" className="mt-3 inline-flex min-h-11 items-center font-semibold text-field underline-offset-2 hover:underline">
            See the effect in Finance
          </Link>
        </>
      )}
    </section>
  );
}
