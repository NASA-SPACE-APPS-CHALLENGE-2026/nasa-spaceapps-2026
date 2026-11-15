'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useFarm } from '@/lib/client/StoreProvider';
import { useActiveField } from '@/lib/client/useActiveField';
import { useRotation } from '@/lib/client/useRotation';
import { activePlan } from '@/lib/domain/finance/farm';
import { simulate } from '@/lib/domain/finance/simulate';
import { cropKeyOf } from '@/lib/domain/finance/budget';
import { cropName } from '@/lib/domain/rotation/agronomy';
import { AnnualNetChart, CumulativeNetChart } from './FinanceCharts';
import { money } from './charts';
import { SECTION } from './ui';

/** Explicit field scenario context; the whole-farm Finance baseline below stays separate. */
export function ScenarioFinancePanel() {
  const { finance, plans } = useFarm();
  const { field } = useActiveField();
  const rotation = useRotation(field);
  const saved = field ? activePlan(plans, field.id) : undefined;
  const result = useMemo(() => {
    if (!field || !saved) return null;
    const sim = finance.simulator[field.id] ?? {};
    const tillage = sim.tillage ?? (rotation?.answers.tillage !== 'unsure' ? rotation?.answers.tillage : undefined);
    return simulate(field, saved, finance, { ...sim, tillage }).result;
  }, [field, saved, finance, rotation]);
  if (!field || !result) return <section className={SECTION}><p>Save a Planner plan for this field to view its scenario finances.</p><Link href="/planner" className="text-sky-deep underline">Open Planner</Link></section>;
  const missing = [...new Set([...result.current.seasons, ...result.proposed.seasons].flatMap((s) => s.crops.filter((id) => id !== 'fallow' && !cropKeyOf(id))))];
  const missingSeasons = [...result.current.seasons, ...result.proposed.seasons].some((s) => !s.crops.length);
  const incomplete = missing.length > 0 || missingSeasons;
  const current = { years: result.current.years.map((y) => ({ year: y.year, netReturn: incomplete ? null : y.net })) };
  const proposed = { years: result.proposed.years.map((y) => ({ year: y.year, netReturn: incomplete ? null : y.net })) };
  const chart = { current, proposed, currentLabel: 'Current rotation', proposedLabel: 'Proposed Planner rotation' };
  const difference = result.proposed.totalProfit - result.current.totalProfit;
  return <section className={`${SECTION} border-sky/40`} data-testid="scenario-finance">
    <p className="text-xs font-semibold uppercase tracking-widest text-sky-deep">From Scenario Simulator</p>
    <h2 className="mt-1 font-plate text-2xl">{field.name} · financial impact</h2>
    <p className="mt-2 text-sm text-ink-soft">{result.acres.toLocaleString('en-US', { maximumFractionDigits: 1 })} acres · {result.startYear}–{result.startYear + finance.horizon - 1}. Uses this field’s scenario crop sequence, acreage override, tillage, crop-specific N and baseline yields. Prices and costs use Finance assumptions. The whole-farm baseline below remains separate.</p>
    <p className="mt-2 text-sm text-ink-soft">Weather: {finance.simulator[field.id]?.scenario ?? 'normal'}. Finance retains its illustrative weather/yield and irrigation responses; these are planning assumptions, not forecasts or measured ecological effects.</p>
    {incomplete ? <p className="mt-3 rounded-xl bg-wheat-tint p-3 text-sm text-wheat-deep">Complete financial comparison unavailable: {missing.map(cropName).join(', ')}{missingSeasons && ' missing crop years'}. These crops do not yet have supported budgets. Ecology can still compare their cover and diversity.</p> : <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-paper p-3"><p className="text-sm">Current total net return</p><strong className="font-plate text-2xl">{money(result.current.totalProfit)}</strong></div><div className="rounded-xl bg-field-tint p-3"><p className="text-sm">Proposed total net return</p><strong className="font-plate text-2xl">{money(result.proposed.totalProfit)}</strong></div></div>
      <p className="mt-3 text-sm">{difference >= 0 ? `${money(difference)} higher net return` : `${money(-difference)} lower net return`} over {finance.horizon} years. {result.proposed.totalProfit < 0 ? 'The proposed plan still loses money; any improvement reduces the loss.' : 'The proposed plan has a positive modeled net return.'} Cost-share payments depend on program eligibility.</p>
      <div className="mt-5 grid gap-5 xl:grid-cols-2"><div><h3 className="font-semibold">Annual net return</h3><AnnualNetChart {...chart} /><p className="text-xs text-ink-soft">Revenue and modeled program payments minus costs, including land, on this field. Negative bars indicate losses.</p></div><div><h3 className="font-semibold">Cumulative net return</h3><CumulativeNetChart {...chart} /><p className="text-xs text-ink-soft">Accumulates the same yearly budgets. A higher line can still represent a smaller cumulative loss.</p></div></div>
      <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-sky-deep">Inspect annual values</summary><div className="overflow-x-auto"><table className="mt-2 w-full text-left"><thead><tr><th>Year</th><th>Current net</th><th>Proposed net</th></tr></thead><tbody>{result.current.years.map((y, i) => <tr key={y.year}><th className="py-2">{y.year}</th><td>{money(y.net)}</td><td>{money(result.proposed.years[i].net)}</td></tr>)}</tbody></table></div></details>
    </>}
    <Link href={`/simulator?field=${field.id}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-sky-deep">← Return to ecological comparison</Link>
  </section>;
}
