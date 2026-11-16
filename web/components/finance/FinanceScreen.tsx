'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { cropsWithoutBuiltInBudget } from '@/lib/domain/finance/analysis';
import { cropKeyOf, type CropKey } from '@/lib/domain/finance/budget';
import { farmFieldInputs } from '@/lib/domain/finance/farm';
import { effectiveLastYear } from '@/lib/domain/finance/inputs';
import { useEffectiveFinance } from '@/lib/client/useEffectiveFinance';
import { useFarm, useStore } from '@/lib/client/StoreProvider';
import { useFarmAnalysis } from '@/lib/client/useFarmAnalysis';
import { NoFieldsYet } from '../ui/FieldPicker';
import { FinanceInputsForm } from './FinanceInputsForm';
import { FinanceResults } from './FinanceResults';
import { Segmented } from './ui';

export function FinanceScreen() {
  const store = useStore();
  const { fields, plans, finance, loaded } = useFarm();
  const { finance: effective, imported } = useEffectiveFinance();
  const { analysis, weather, planned } = useFarmAnalysis();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = params.get('tab') === 'inputs' ? 'inputs' : 'results';
  const setTab = (t: 'results' | 'inputs') => router.replace(`${pathname}${t === 'inputs' ? '?tab=inputs' : ''}`, { scroll: false });

  const { crops, ownCrops } = useMemo(() => {
    const inputs = farmFieldInputs(fields, plans, finance);
    const keys = new Set<CropKey>();
    for (const f of inputs) for (const s of [...f.current, ...f.proposed]) for (const id of s.crops) {
      const k = cropKeyOf(id);
      if (k) keys.add(k);
    }
    return {
      crops: (['corn', 'soybeans', 'oats', 'wheat', 'rice', 'sorghum', 'cotton'] as CropKey[]).filter((k) => keys.has(k)),
      ownCrops: cropsWithoutBuiltInBudget(inputs),
    };
  }, [fields, plans, finance]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 lg:py-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-plate text-3xl">Finance</h1>
            <p className="mt-1 max-w-3xl text-[16px] text-ink-soft">Your current rotation next to the PlotTwist plan from your Planner: money in, money out, and weather risk.</p>
          </div>
          {loaded && fields.length > 0 && <Segmented label="View" value={tab} onChange={setTab} options={[{ value: 'results', label: 'Results' }, { value: 'inputs', label: 'Your numbers' }]} />}
        </header>
        {!loaded ? (
          <p role="status">Loading your farm…</p>
        ) : !fields.length || !analysis ? (
          <NoFieldsYet what="Finance" text="Finance compares your current rotation with your plans, so it needs at least one field." />
        ) : tab === 'inputs' ? (
          <FinanceInputsForm inputs={finance} imported={imported} fields={fields} crops={crops} ownCrops={ownCrops} weather={weather?.status === 'ok' ? weather.history : undefined} onChange={(next) => void store.saveFinance(next)} />
        ) : (
          <FinanceResults a={analysis} weather={weather} planned={planned} fieldCount={fields.length} lastYear={effectiveLastYear(effective)} />
        )}
      </div>
    </div>
  );
}
