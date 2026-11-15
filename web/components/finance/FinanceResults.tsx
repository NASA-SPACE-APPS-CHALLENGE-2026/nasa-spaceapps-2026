'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FarmAnalysis, PartialLine, PlanYear } from '@/lib/domain/finance/analysis';
import type { WeatherState } from '@/lib/client/store';
import { Legend, money, PairColumns, PairLines, RangeRows, SERIES } from './charts';
import { ConfidenceBadge, OriginBadge, Section, Segmented } from './ui';

const perAcre = (y: PlanYear, v: number) => (y.acres ? v / y.acres : 0);
const sum = (l: PartialLine[]) => l.reduce((s, x) => s + x.amount, 0);

export function Headline({ a, compact = false }: { a: FarmAnalysis; compact?: boolean }) {
  if (a.unmodeled.length > 0) return <IncompleteFinance a={a} compact={compact} />;
  const { low, high, mid, wholeFarm, horizon } = a.headline;
  const tone = mid > 0.5 ? 'text-field' : mid < -0.5 ? 'text-alert' : 'text-ink';
  return (
    <div className={`grid gap-3 ${compact ? '' : 'sm:grid-cols-2'}`} data-testid="finance-headline">
      <div className="rounded-[var(--radius-panel)] border border-line bg-panel p-4">
        <p className="text-[14.5px] font-semibold text-ink-soft">Change in net return per acre, per year</p>
        <p className={`mt-1 font-plate text-3xl tabular-nums ${tone}`}>
          {money(low, { sign: true })} to {money(high, { sign: true })}
        </p>
        <p className="mt-1 text-[14px] text-ink-soft">Most likely {money(mid, { sign: true })} per acre per year with the PlotTwist plan.</p>
      </div>
      <div className="rounded-[var(--radius-panel)] border border-line bg-panel p-4">
        <p className="text-[14.5px] font-semibold text-ink-soft">Whole farm over {horizon} years</p>
        <p className={`mt-1 font-plate text-3xl tabular-nums ${tone}`}>{money(wholeFarm, { sign: true })}</p>
        <p className="mt-1 text-[14px] text-ink-soft">
          {a.acres.toLocaleString('en-US', { maximumFractionDigits: 1 })} acres, {a.years[0]}–{a.years[a.years.length - 1]}. <ConfidenceBadge c={a.confidence.headline} />
        </p>
      </div>
    </div>
  );
}

export function FinanceResults({ a, weather, planned, fieldCount, lastYear }: { a: FarmAnalysis; weather: WeatherState | undefined; planned: number; fieldCount: number; lastYear?: { totalRevenue?: number; totalCosts?: number; fromRecords?: { revenue: boolean; costs: boolean } } }) {
  const [metric, setMetric] = useState<'net' | 'revenue'>('net');
  const cols = a.years.map((year, i) => ({
    label: String(year),
    current: metric === 'net' ? perAcre(a.current[i], a.current[i].net) : perAcre(a.current[i], a.current[i].revenue + a.current[i].programs),
    proposed: metric === 'net' ? perAcre(a.proposed[i], a.proposed[i].net) : perAcre(a.proposed[i], a.proposed[i].revenue + a.proposed[i].programs),
  }));
  const cum = a.cash.points.map((p) => ({ label: p.label, current: p.current.cumulative, proposed: p.proposed.cumulative }));
  const be = a.cash.breakEven;

  if (a.unmodeled.length > 0) {
    return <IncompleteFinance a={a} />;
  }

  return (
    <div className="space-y-5">
      {planned === 0 && (
        <p className="rounded-[var(--radius-panel)] border border-wheat/40 bg-wheat-tint px-4 py-3 text-[15px] text-wheat-deep">
          None of your fields has a plan yet, so both columns show your current rotation. <Link href="/rotation" className="font-semibold underline underline-offset-2">Make a plan in Rotation Explorer</Link>.
        </p>
      )}
      {planned > 0 && planned < fieldCount && <p className="text-[14.5px] text-ink-soft">{fieldCount - planned} of {fieldCount} fields have no plan yet; they stay on their current rotation in both columns.</p>}
      <Headline a={a} />

      <Section id="projection" title="Projection" confidence={a.confidence.comparison} aside={<Segmented label="Show" value={metric} onChange={setMetric} options={[{ value: 'net', label: 'Net return' }, { value: 'revenue', label: 'Revenue' }]} />}>
        <p className="text-[14px] text-ink-soft">{metric === 'net' ? 'Net return' : 'Revenue (including cost share)'} per acre for each season of the plan.</p>
        <div className="mt-2">
          <Legend />
        </div>
        <PairColumns data={cols} title={`${metric === 'net' ? 'Net return' : 'Revenue'} per acre by year`} />
      </Section>

      <Section id="compare" title="Side by side" confidence={a.confidence.comparison}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[14px] tabular-nums">
            <thead>
              <tr className="text-left text-ink-soft">
                <th scope="col" className="py-2 pr-2 font-semibold">Year</th>
                <th scope="col" className="px-2 font-semibold">Plan</th>
                <th scope="col" className="px-2 text-right font-semibold">Revenue / ac</th>
                <th scope="col" className="px-2 text-right font-semibold">Operating costs / ac</th>
                <th scope="col" className="px-2 text-right font-semibold">Net / ac</th>
                <th scope="col" className="pl-2 text-right font-semibold">Whole farm net</th>
              </tr>
            </thead>
            <tbody>
              {a.years.map((year, i) => (
                <YearRows key={year} year={year} c={a.current[i]} p={a.proposed[i]} />
              ))}
              <tr className="border-t-2 border-line-strong font-semibold">
                <td className="py-2 pr-2" colSpan={5}>
                  Total difference over {a.years.length} years
                </td>
                <td className="pl-2 text-right">{money(a.headline.wholeFarm, { sign: true })}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {lastYear?.totalRevenue !== undefined && lastYear.totalCosts !== undefined && a.current[0] && (
          <p className="mt-3 text-[14.5px] text-ink-soft" data-testid="last-year-check">
            Check: last year {lastYear.fromRecords?.revenue || lastYear.fromRecords?.costs ? 'your imported books show' : 'you reported'} {money(lastYear.totalRevenue)} revenue and {money(lastYear.totalCosts)} costs (net {money(lastYear.totalRevenue - lastYear.totalCosts)}). PlotTwist models your current rotation in {a.current[0].year} at {money(a.current[0].revenue + a.current[0].programs)} revenue and {money(a.current[0].operating + a.current[0].land)} costs (net {money(a.current[0].net)}). If these are far apart, adjust your yields, prices or costs under Your numbers.
          </p>
        )}
      </Section>

      <Section id="partial" title="Partial budget" confidence={a.confidence.partial}>
        <p className="text-[14px] text-ink-soft">What changes for the whole farm over {a.years.length} years if you switch to the PlotTwist plan.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <PartialBox title="Added revenue" lines={a.partial.addedRevenue} sign={1} />
          <PartialBox title="Added costs" lines={a.partial.addedCosts} sign={-1} />
          <PartialBox title="Reduced costs" lines={a.partial.reducedCosts} sign={1} />
          <PartialBox title="Reduced revenue" lines={a.partial.reducedRevenue} sign={-1} />
        </div>
        <p className="mt-4 border-t border-line pt-3 text-[16px] font-semibold">
          Net change: <span className="tabular-nums">{money(a.partial.net, { sign: true })}</span>
        </p>
      </Section>

      <Section id="cash" title="Cash flow" confidence={a.confidence.cash}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[var(--radius-control)] bg-paper p-3">
            <p className="text-[13.5px] font-semibold text-ink-soft">Break-even</p>
            <p className="text-[17px] font-semibold">{be === 'start' ? 'Never behind your current rotation' : be ? `${be.label}` : `Not within ${a.years.length} years`}</p>
          </div>
          <div className="rounded-[var(--radius-control)] bg-paper p-3">
            <p className="text-[13.5px] font-semibold text-ink-soft">Deepest dip</p>
            <p className="text-[17px] font-semibold tabular-nums">{a.cash.deepestDip < -0.5 ? `${money(a.cash.deepestDip)} (${a.cash.deepestDipLabel})` : 'No dip'}</p>
          </div>
        </div>
        <p className="mt-4 text-[14px] text-ink-soft">Cumulative profit, whole farm, season by season.</p>
        <div className="mt-2">
          <Legend />
        </div>
        <PairLines data={cum} title="Cumulative profit by season" marker={be && be !== 'start' ? be.label : undefined} />
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-2 text-[14.5px] font-semibold text-sky-deep">Money in and out by season</summary>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13.5px] tabular-nums">
              <thead>
                <tr className="text-left text-ink-soft">
                  <th scope="col" className="py-1.5 pr-2 font-semibold">Season</th>
                  <th scope="col" className="px-2 text-right font-semibold">Current: in</th>
                  <th scope="col" className="px-2 text-right font-semibold">Current: out</th>
                  <th scope="col" className="px-2 text-right font-semibold">Plan: in</th>
                  <th scope="col" className="px-2 text-right font-semibold">Plan: out</th>
                  <th scope="col" className="pl-2 text-right font-semibold">Plan ahead by</th>
                </tr>
              </thead>
              <tbody>
                {a.cash.points.map((p) => (
                  <tr key={p.label} className="border-t border-line">
                    <th scope="row" className="py-1.5 pr-2 text-left font-normal">{p.label}</th>
                    <td className="px-2 text-right">{money(p.current.in)}</td>
                    <td className="px-2 text-right">{money(p.current.out)}</td>
                    <td className="px-2 text-right">{money(p.proposed.in)}</td>
                    <td className="px-2 text-right">{money(p.proposed.out)}</td>
                    <td className="pl-2 text-right font-semibold">{money(p.difference, { sign: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Section>

      <Section id="risk" title="Weather risk (40 years of NASA weather)" confidence={a.risk ? a.confidence.risk : undefined}>
        {!a.risk ? (
          <p className="text-[15px] text-ink-soft">{weather?.status === 'loading' ? 'Loading 40 years of NASA POWER weather for your farm…' : weather?.status === 'unavailable' ? 'NASA weather history is not available right now.' : 'Turn on public data lookups to see weather risk.'}</p>
        ) : (
          <>
            <p className="text-[14px] text-ink-soft">Average net return per acre per year if each of the last {a.risk.years} years’ weather (1985–2024) happened again. Bad and good are the 20th and 80th percentiles.</p>
            <div className="mt-4">
              <RangeRows rows={[{ key: 'proposed', ...a.risk.proposed }, { key: 'current', ...a.risk.current }]} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(['proposed', 'current'] as const).map((k) => (
                <div key={k} className="rounded-[var(--radius-control)] bg-paper p-3 text-[14.5px]">
                  <p className="flex items-center gap-2 font-semibold">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: SERIES[k].color }} aria-hidden />
                    {SERIES[k].label}
                  </p>
                  <p className="mt-1">
                    Losing years: <strong>{a.risk![k].losingYears}</strong> of {a.risk!.years}
                  </p>
                  <p>
                    Worst year: <strong className="tabular-nums">{money(a.risk![k].worst)}</strong> per acre (weather like {a.risk![k].worstYear})
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[14px] text-ink-soft">
              Stress years at this farm: corn {a.risk.stressYears.corn.length}, soybeans {a.risk.stressYears.soybeans.length}, small grains {a.risk.stressYears.oats.length} of {a.risk.years}.
            </p>
          </>
        )}
      </Section>

      <Section id="savings" title="Savings and support" confidence={a.confidence.savings}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[var(--radius-control)] bg-paper p-3">
            <p className="text-[13.5px] font-semibold text-ink-soft">Nitrogen fertilizer saved</p>
            <p className="text-[17px] font-semibold tabular-nums">
              {Math.round(a.savings.nLbs).toLocaleString('en-US')} lb N ({money(a.savings.nDollars, { sign: true })})
            </p>
          </div>
          <div className="rounded-[var(--radius-control)] bg-paper p-3">
            <p className="text-[13.5px] font-semibold text-ink-soft">Cost share available</p>
            <p className="text-[17px] font-semibold tabular-nums">{money(a.savings.costShare)}</p>
            <p className="text-[13.5px] text-ink-soft">{a.savings.costShareTiming}</p>
          </div>
        </div>
        <h3 className="mt-4 text-[15px] font-semibold">Programs worth asking about</h3>
        <ul className="mt-2 space-y-2">
          {a.savings.programs.map((p) => (
            <li key={p.name} className="text-[14.5px]">
              <strong>{p.name}.</strong> {p.text}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="sensitivity" title="What if prices or yields change?" confidence={a.confidence.sensitivity}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[14px] tabular-nums">
            <thead>
              <tr className="text-left text-ink-soft">
                <th scope="col" className="py-2 pr-2 font-semibold">If…</th>
                <th scope="col" className="px-2 text-right font-semibold">Current net / ac / yr</th>
                <th scope="col" className="px-2 text-right font-semibold">Plan net / ac / yr</th>
                <th scope="col" className="pl-2 text-right font-semibold">Plan ahead by</th>
              </tr>
            </thead>
            <tbody>
              {a.sensitivity.rows.map((r) => (
                <tr key={r.label} className={`border-t border-line ${r.group === 'base' ? 'font-semibold' : ''}`}>
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal">{r.label}</th>
                  <td className="px-2 text-right">{money(r.current)}</td>
                  <td className="px-2 text-right">{money(r.proposed)}</td>
                  <td className={`pl-2 text-right ${r.difference < 0 ? 'text-alert' : ''}`}>{money(r.difference, { sign: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="mt-5 text-[15px] font-semibold">Break-even price and yield</h3>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[520px] text-[14px] tabular-nums">
            <thead>
              <tr className="text-left text-ink-soft">
                <th scope="col" className="py-2 pr-2 font-semibold">Crop</th>
                <th scope="col" className="px-2 text-right font-semibold">Cost / ac</th>
                <th scope="col" className="px-2 text-right font-semibold">Break-even price</th>
                <th scope="col" className="pl-2 text-right font-semibold">Break-even yield</th>
              </tr>
            </thead>
            <tbody>
              {a.sensitivity.breakEven.map((b) => (
                <tr key={b.crop} className="border-t border-line">
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal">{b.crop}</th>
                  <td className="px-2 text-right">{money(b.costPerAcre)}</td>
                  <td className="px-2 text-right">
                    {money(b.breakEvenPrice, { cents: true })}/{b.unit} <span className="text-ink-faint">(expecting {money(b.price, { cents: true })})</span>
                  </td>
                  <td className="pl-2 text-right">
                    {Math.round(b.breakEvenYield)} {b.unit} <span className="text-ink-faint">(expecting {Math.round(b.yieldBu)})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="transparency" title="Every assumption">
        <ul className="flex flex-wrap gap-2 text-[13.5px]" aria-label="Data confidence per result">
          {(
            [
              ['Headline', a.confidence.headline],
              ['Side by side', a.confidence.comparison],
              ['Cash flow', a.confidence.cash],
              ['Weather risk', a.confidence.risk],
              ['Savings', a.confidence.savings],
            ] as const
          ).map(([k, c]) => (
            <li key={k} className="inline-flex items-center gap-1.5">
              {k}: <ConfidenceBadge c={c} />
            </li>
          ))}
        </ul>
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-2 text-[14.5px] font-semibold text-sky-deep">Show all {a.transparency.length} values, their sources and dates</summary>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13.5px]">
              <thead>
                <tr className="text-left text-ink-soft">
                  <th scope="col" className="py-1.5 pr-2 font-semibold">Value</th>
                  <th scope="col" className="px-2 text-right font-semibold">Used</th>
                  <th scope="col" className="px-2 font-semibold">From</th>
                  <th scope="col" className="px-2 font-semibold">Source and date</th>
                  <th scope="col" className="pl-2 font-semibold">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {a.transparency.map((t) => (
                  <tr key={t.id} className="border-t border-line align-top">
                    <th scope="row" className="py-1.5 pr-2 text-left font-normal">{t.label}</th>
                    <td className="whitespace-nowrap px-2 text-right tabular-nums">
                      {t.value.toLocaleString('en-US', { maximumFractionDigits: 2 })} <span className="text-ink-faint">{t.unit}</span>
                    </td>
                    <td className="px-2">
                      <OriginBadge origin={t.origin} />
                    </td>
                    <td className="px-2 text-ink-soft">
                      {t.source.url ? (
                        <a href={t.source.url} target="_blank" rel="noopener noreferrer" className="text-sky-deep underline underline-offset-2">
                          {t.source.name}
                        </a>
                      ) : (
                        t.source.name
                      )}
                      , {t.source.date}
                    </td>
                    <td className="pl-2">
                      <ConfidenceBadge c={t.confidence} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Section>
    </div>
  );
}

function IncompleteFinance({ a, compact = false }: { a: FarmAnalysis; compact?: boolean }) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-wheat/40 bg-wheat-tint p-4" data-testid="finance-incomplete">
      <p className="font-semibold text-wheat-deep">Financial projection needs complete crop data</p>
      <p className="mt-1 text-[14.5px] text-ink-soft">
        No estimate is shown for {a.unmodeled.join('; ')}. Add a supported crop budget before using the profit graphs; missing seasons are never replaced with rent or a placeholder value.
      </p>
      {!compact && (
        <Link href="/fields" className="mt-2 inline-flex min-h-10 items-center font-semibold text-sky-deep underline underline-offset-2">
          Review crop history
        </Link>
      )}
    </div>
  );
}

function YearRows({ year, c, p }: { year: number; c: PlanYear; p: PlanYear }) {
  const row = (y: PlanYear, key: 'current' | 'proposed', first: boolean) => (
    <tr className={first ? 'border-t border-line' : ''}>
      {first && (
        <th scope="rowgroup" rowSpan={3} className="py-1.5 pr-2 text-left align-top font-semibold">
          {year}
        </th>
      )}
      <td className="px-2 py-1.5">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px]" style={{ background: SERIES[key].color }} aria-hidden />
          {SERIES[key].label}
        </span>
      </td>
      <td className="px-2 text-right">{money(perAcre(y, y.revenue + y.programs))}</td>
      <td className="px-2 text-right">{money(perAcre(y, y.operating))}</td>
      <td className="px-2 text-right">{money(perAcre(y, y.net))}</td>
      <td className="pl-2 text-right">{money(y.net)}</td>
    </tr>
  );
  return (
    <>
      {row(p, 'proposed', true)}
      {row(c, 'current', false)}
      <tr className="text-ink-soft">
        <td className="px-2 pb-2 text-[13px]">Difference</td>
        <td />
        <td />
        <td className="px-2 pb-2 text-right text-[13px] font-semibold">{money(perAcre(p, p.net) - perAcre(c, c.net), { sign: true })}</td>
        <td className="pl-2 pb-2 text-right text-[13px] font-semibold">{money(p.net - c.net, { sign: true })}</td>
      </tr>
    </>
  );
}

function PartialBox({ title, lines, sign }: { title: string; lines: PartialLine[]; sign: 1 | -1 }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-line p-3">
      <h3 className="flex justify-between text-[15px] font-semibold">
        {title}
        <span className="tabular-nums">{money(sign * sum(lines), { sign: true })}</span>
      </h3>
      {lines.length ? (
        <ul className="mt-2 space-y-1 text-[14px] text-ink-soft">
          {lines.map((l) => (
            <li key={l.label} className="flex justify-between gap-3">
              <span>{l.label}</span>
              <span className="tabular-nums">{money(l.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[14px] text-ink-faint">None</p>
      )}
    </div>
  );
}
