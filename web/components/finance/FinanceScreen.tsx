'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useFarm, useStore } from '@/lib/client/StoreProvider';
import { useRevenueForecast } from '@/lib/client/useRevenueForecast';
import { RecordImportCard } from '../imports/RecordImportCard';
import { NoFieldsYet } from '../ui/FieldPicker';
import { FinanceResults } from './FinanceResults';
import { Segmented } from './ui';

export function FinanceScreen() {
  const store = useStore();
  const { loaded, finance, fields, forecastRecords } = useFarm();
  const hasData = fields.length > 0 || Object.values(forecastRecords).some(rows => rows.length > 0);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const updateQuery = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  };
  const tab = params.get('tab') === 'inputs' ? 'inputs' : 'results';
  const requestedYear = Number(params.get('start'));
  const validYear = Number.isInteger(requestedYear) && requestedYear >= 1800 && requestedYear <= 9989;
  const { forecast, startYear } = useRevenueForecast(finance.horizon, validYear ? requestedYear : undefined);
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 lg:py-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div><h1 className="font-plate text-3xl">Finance</h1>
            <p className="mt-1 max-w-3xl text-[16px] text-ink-soft">Compare the crop revenue and operating return of your current and proposed rotations.</p>
          </div>
          <Link href="/imports" className="font-semibold text-sky-deep hover:underline">Farm records →</Link>
        </header>
        {loaded ? <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented label="View" value={tab} onChange={t => updateQuery('tab', t === 'inputs' ? 'inputs' : null)} options={[{ value: 'results', label: 'Results' }, { value: 'inputs', label: 'Your numbers' }]} />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold">First season
                <input type="number" key={startYear} defaultValue={startYear} min={1800} max={9989} step={1} className="min-h-11 w-23 rounded border border-line-strong bg-panel px-2"
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  onBlur={e => {
                    if (!e.currentTarget.value.trim()) updateQuery('start', null);
                    else if (e.currentTarget.validity.valid) updateQuery('start', e.currentTarget.value);
                    else e.currentTarget.value = String(startYear);
                  }} /></label>
              <Segmented label="Planning horizon" value={finance.horizon} onChange={horizon => void store.saveFinance({ ...finance, horizon })} options={[{ value: 3, label: '3 years' }, { value: 5, label: '5 years' }, { value: 10, label: '10 years' }]} />
            </div>
          </div>
          {tab === 'inputs' ? <div className="space-y-4" data-testid="finance-inputs">
            <p className="text-sm text-ink-soft">Use the field and crop IDs from your imports. Enter a growing season for annual assumptions, or leave it blank to apply the assumption across seasons.</p>
            <div className="grid min-w-0 gap-4 md:grid-cols-2"><RecordImportCard dataset="agronomy" /><RecordImportCard dataset="markets" /></div>
            <p className="text-sm"><Link href="/imports" className="font-semibold text-sky-deep underline">Edit field acreage and imported rotation sequences</Link> or <Link href="/planner" className="font-semibold text-sky-deep underline">open the Planner</Link> to change a field’s proposed plan.</p>
          </div> : forecast && hasData ? <FinanceResults forecast={forecast} />
            : <><NoFieldsYet what="Finance" text="Add a field boundary or import a field acreage record to start a farm forecast." /><Link className="font-semibold text-sky-deep underline" href="/imports">Import farm records</Link></>}
        </> : <p role="status">Loading your farm…</p>}
      </div>
    </div>
  );
}
