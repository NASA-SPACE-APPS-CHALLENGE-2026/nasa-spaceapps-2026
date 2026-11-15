'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { RevenueForecast } from '@/lib/domain/finance/forecast';
import { Legend, money, PairColumns } from './charts';
import { Section, Segmented } from './ui';

const outlooks = ['conservative', 'expected', 'optimistic'] as const;
type Outlook = typeof outlooks[number];
type Scenario = RevenueForecast['scenarios'][Outlook];
const outlookName = { conservative: 'Conservative', expected: 'Expected', optimistic: 'Optimistic' };
const planNames = { current: 'Current', proposed: 'Proposed' } as const;
const usd = (n: number | null, signed = false) => n === null ? '—' : money(n, { sign: signed, cents: true });
const number = (n: number | null) => n === null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const headers = ['Current gross', 'Proposed gross', 'Change in gross', 'Change in expenses', 'Change in net return'];
const scenarioCells = (s: Pick<Scenario, 'current' | 'proposed' | 'delta'>) =>
  [usd(s.current.grossRevenue), usd(s.proposed.grossRevenue), usd(s.delta.grossRevenue, true), usd(s.delta.expenses, true), usd(s.delta.netReturn, true)];

function Table({ title, columns, rows }: { title: string; columns: string[]; rows: ReactNode[][] }) {
  return <div className="min-w-0 overflow-x-auto">
    <table className="w-full border-collapse text-sm tabular-nums">
      <caption className="sr-only">{title}</caption>
      <thead><tr>{columns.map((col, i) => <th key={col} scope="col" className={`whitespace-nowrap border-b border-line px-2 py-2 font-semibold text-ink-soft ${i ? 'text-right' : 'text-left'}`}>{col}</th>)}</tr></thead>
      <tbody className="divide-y divide-line">{rows.map((cells, index) => <tr key={index} className="even:bg-paper/50">
        <th scope="row" className="whitespace-nowrap px-2 py-2 text-left font-medium">{cells[0]}</th>
        {cells.slice(1).map((cell, i) => <td key={i} className="whitespace-nowrap px-2 py-2 text-right">{cell}</td>)}
      </tr>)}</tbody>
    </table>
  </div>;
}

export function Headline({ forecast, outlook = 'expected', compact = false }: { forecast: RevenueForecast; outlook?: Outlook; compact?: boolean }) {
  const scenario = forecast.scenarios[outlook];
  const metrics = [{ label: 'Gross crop revenue', key: 'grossRevenue' }, { label: 'Operating expenses', key: 'expenses' }, { label: 'Net operating return', key: 'netReturn' }] as const;
  return <div data-testid="finance-headline">
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-plate text-xl">Whole farm over {forecast.horizon} years</h2>
      <span className="text-sm text-ink-soft">{outlookName[outlook]} · {forecast.startYear}–{forecast.startYear + forecast.horizon - 1}</span>
    </div>
    <div className={`grid min-w-0 gap-3 ${compact ? '' : 'md:grid-cols-3'}`}>
      {metrics.map(({ key, label }) => <div key={key} className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-panel p-4">
        <p className="text-sm font-semibold text-ink-soft">{label}</p>
        <p className="mt-1 break-words font-plate text-2xl tabular-nums">{usd(scenario.proposed[key])}</p>
        <p className="text-xs text-ink-soft">Proposed rotation</p>
        <dl className="mt-3 space-y-1 border-t border-line pt-2 text-sm tabular-nums">
          <div className="flex flex-wrap justify-between gap-x-2"><dt>Current</dt><dd>{usd(scenario.current[key])}</dd></div>
          <div className="flex flex-wrap justify-between gap-x-2"><dt>Change</dt><dd className="font-semibold">{usd(scenario.delta[key], true)}{key === 'grossRevenue' && scenario.delta.revenueChangePct !== null && ` (${number(scenario.delta.revenueChangePct)}%)`}</dd></div>
        </dl>
      </div>)}
    </div>
  </div>;
}

const financialNames: Record<keyof RevenueForecast['financials'], string> = {
  cropSales: 'Crop sales', cashReceived: 'Cash received on crop sales', receivable: 'Crop accounts receivable', unsettled: 'Unsettled crop sales',
  government: 'Government payments', insurance: 'Insurance proceeds', financing: 'Financing proceeds', transfers: 'Account transfers',
  operating: 'Operating expenses', supplierPayments: 'Supplier payments', interest: 'Interest', depreciation: 'Depreciation', tax: 'Taxes', rent: 'Land rent', capital: 'Capital expenditures',
};

function LedgerDetails({ forecast }: { forecast: RevenueForecast }) {
  const [season, setSeason] = useState('all');
  const periods = Object.keys(forecast.bySeason).sort().reverse();
  const selection = periods.includes(season) ? season : 'all';
  const ledger = selection === 'all' ? forecast.financials : forecast.bySeason[selection];
  return <Section id="ledger" title="Imported payments and inventory">
    <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">Payment records
      <select className="min-h-10 rounded border border-line-strong bg-panel px-2" value={selection} onChange={e => setSeason(e.target.value)}>
        <option value="all">All imported seasons</option>{periods.map(year => <option key={year}>{year}</option>)}
      </select></label>
    <p className="my-2 text-sm text-ink-soft">These amounts summarize the imported ledger. Government payments, insurance, financing and transfers are reported separately from forecast crop sales.</p>
    <Table title="Historical financial categories" columns={['Category', 'Amount']} rows={(Object.keys(financialNames) as Array<keyof typeof ledger>).map(key => [financialNames[key], usd(ledger[key])])} />
    <h3 className="mt-4 font-plate text-lg">Input inventory</h3>
    {forecast.inventory.length ? <Table title="Input inventory by lot" columns={['Product / lot', 'Unit', 'Opening', 'Purchased', 'Used', 'Ending', 'Unit cost', 'Ending value', 'Source']}
      rows={forecast.inventory.map(lot => [`${lot.product} · ${lot.id}`, lot.unit, number(lot.beginning), number(lot.purchased), number(lot.used), number(lot.ending), usd(lot.unitCost), usd(lot.endingValue), lot.source])} />
      : <p className="mt-1 text-sm text-ink-soft">No inventory lots available.</p>}
  </Section>;
}

const metricLabels = { grossRevenue: 'Gross crop revenue', expenses: 'Operating expenses', netReturn: 'Net operating return' };
type MetricKey = keyof typeof metricLabels;
function MetricSelect({ value, onChange, label }: { value: MetricKey; onChange: (value: MetricKey) => void; label: string }) {
  return <label className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold">{label}
    <select className="min-h-10 rounded border border-line-strong bg-panel px-2" value={value} onChange={e => onChange(e.target.value as MetricKey)}>
      {Object.entries(metricLabels).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
    </select></label>;
}
function Contributions({ scenario, year }: { scenario: Scenario; year: Scenario['years'][number] }) {
  const [scope, setScope] = useState<'year' | 'all'>('year');
  const [metric, setMetric] = useState<MetricKey>('grossRevenue');
  const data = scope === 'year' ? year : scenario;
  const rows = (items: typeof data.fieldChanges) => items.map(item => [item.name, usd(item.current[metric]), usd(item.proposed[metric]), usd(item[metric], true)]);
  return <Section id="contributions" title="Contributions to the change" aside={<Segmented label="Contribution period" value={scope} onChange={setScope} options={[{ value: 'year', label: String(year.year) }, { value: 'all', label: 'All years' }]} />}>
    <MetricSelect label="Contribution metric" value={metric} onChange={setMetric} />
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <Table title="Field contributions" columns={['Field', 'Current', 'Proposed', 'Change']} rows={rows(data.fieldChanges)} />
      <Table title="Crop contributions" columns={['Crop', 'Current', 'Proposed', 'Change']} rows={rows(data.cropChanges)} />
    </div>
  </Section>;
}

export function FinanceResults({ forecast }: { forecast: RevenueForecast }) {
  const [outlook, setOutlook] = useState<Outlook>('expected');
  const [selectedYear, setSelectedYear] = useState(forecast.startYear);
  const [plan, setPlan] = useState<keyof typeof planNames>('proposed');
  const [period, setPeriod] = useState<'annual' | 'cumulative'>('annual');
  const [metric, setMetric] = useState<MetricKey>('grossRevenue');
  const s = forecast.scenarios[outlook];
  const year = s.years.find(y => y.year === selectedYear) ?? s.years[0];
  const projection = year[plan];
  const series = s.years.map(y => ({ label: String(y.year), current: (period === 'annual' ? y.current.totals : y.cumulative.current)[metric],
    proposed: (period === 'annual' ? y.proposed.totals : y.cumulative.proposed)[metric] }));
  const chartData = series.flatMap(p => p.current !== null && p.proposed !== null ? [{ ...p, current: p.current, proposed: p.proposed }] : []);
  const issues = [...new Set(forecast.issues)];
  if (!year.current.fields.length && !year.proposed.fields.length) return <div className="space-y-4">
    <Section id="missing-fields" title="Add a field first">
      <p className="text-ink-soft">Import a field boundary or acreage record to connect your ledger to a crop rotation.</p>
      <Link href="/imports" className="mt-2 inline-block font-semibold text-sky-deep underline">Add field records</Link>
      {issues.length > 0 && <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Review records ({issues.length})</summary><ul className="ml-5 list-disc">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></details>}
    </Section>
    <LedgerDetails forecast={forecast} />
  </div>;
  return <div className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink-soft">Farm area {number(forecast.landAcres)} ac · Available to plant {number(forecast.usableAcres)} ac</p>
      <Segmented label="Scenario" value={outlook} onChange={setOutlook} options={outlooks.map(value => ({ value, label: outlookName[value] }))} />
    </div>
    <Headline forecast={forecast} outlook={outlook} />
    <p className="text-sm text-ink-soft">A dash means the supporting records are incomplete. Gross crop revenue covers projected crop sales. Net operating return deducts operating expenses. Financing, depreciation, taxes, land rent and capital purchases are reported in the ledger.</p>
    {issues.length > 0 && <details className="rounded-[var(--radius-panel)] border border-wheat/40 bg-wheat-tint px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold">Review data and assumptions ({issues.length})</summary>
      <ul className="my-3 ml-5 max-h-80 list-disc space-y-1 overflow-y-auto">{issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>
      <Link href="/imports" className="font-semibold text-sky-deep underline">Review imported records</Link>
    </details>}
    <Section id="scenarios" title="Scenario comparison">
      <p className="mb-2 text-sm text-ink-soft">Whole-farm totals for the selected horizon. Observed variation and sourced assumptions determine the range. Matching values can reflect limited evidence.</p>
      <Table title="Financial outlook by scenario" columns={['Scenario', ...headers]} rows={outlooks.map(o => [outlookName[o], ...scenarioCells(forecast.scenarios[o])])} />
    </Section>
    <Section id="projection" title="Returns by growing season" aside={<Segmented label="Annual or cumulative" value={period} onChange={setPeriod} options={[{ value: 'annual', label: 'Annual' }, { value: 'cumulative', label: 'Cumulative' }]} />}>
      <MetricSelect label="Compare" value={metric} onChange={setMetric} />
      {chartData.length === series.length && <><Legend /><PairColumns title={`${period} ${metricLabels[metric]} by year`} data={chartData} /></>}
      <Table title={`${period} ${metricLabels[metric]}`} columns={['Year', 'Current rotation', 'Proposed rotation', 'Change']} rows={s.years.map(y => {
        const row = period === 'annual' ? { current: y.current.totals, proposed: y.proposed.totals, delta: y.delta } : y.cumulative;
        return [y.year, usd(row.current[metric]), usd(row.proposed[metric]), usd(row.delta[metric], true)];
      })} />
    </Section>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <label className="flex items-center gap-2 text-sm font-semibold">Inspect growing season <select className="min-h-11 rounded border border-line-strong bg-panel px-3" value={year.year} onChange={e => setSelectedYear(Number(e.target.value))}>
        {s.years.map(y => <option key={y.year}>{y.year}</option>)}</select></label>
      <Segmented label="Rotation details" value={plan} onChange={setPlan} options={[{ value: 'current', label: 'Current rotation' }, { value: 'proposed', label: 'Proposed rotation' }]} />
    </div>
    <Section id="production" title={`Production and returns · ${year.year}`}>
      <h3 className="mb-1 font-semibold">By field · {planNames[plan]} rotation</h3>
      <Table title="Field production and financials" columns={['Field', 'Previous crop', 'Crop', 'Planted ac', 'Harvested ac', 'Yield / ac', 'Production', 'Revenue / harvested ac', 'Gross revenue', 'Operating expenses', 'Net return', 'Yield confidence', 'Price confidence']}
        rows={projection.fields.map(f => [f.name, f.previousCrop ?? '—', f.crop, number(f.plantedAcres), number(f.harvestedAcres), `${number(f.yieldPerAcre)} ${f.unit}`, `${number(f.production)} ${f.unit}`, usd(f.revenuePerAcre), usd(f.grossRevenue), usd(f.expenses), usd(f.netReturn), f.confidence, f.priceConfidence])} />
      <h3 className="mb-1 mt-4 font-semibold">By crop</h3>
      <Table title="Crop sales and production" columns={['Crop', 'Production', 'Gross revenue', 'Operating expenses', 'Net return']}
        rows={projection.crops.map(c => [c.crop, `${number(c.production)} ${c.unit}`, usd(c.grossRevenue), usd(c.expenses), usd(c.netReturn)])} />
    </Section>
    <Contributions year={year} scenario={s} />
    <Section id="transparency" title="Calculation details">
      <p className="mb-2 text-sm text-ink-soft">Review the source quantities, prices, operating costs and equipment constraints for the selected field season.</p>
      {projection.fields.map((f, i) => <details key={`${f.fieldId}-${i}`} className="border-t border-line py-2 text-sm">
        <summary className="cursor-pointer font-semibold">{f.name} · {f.crop} · {f.confidence} yield confidence</summary>
        <dl className="my-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{[
          ['Contracted quantity', `${number(f.contractedQuantity)} ${f.unit}`], ['Uncontracted quantity', `${number(f.uncontractedQuantity)} ${f.unit}`],
          ['Blended selling price', f.pricePerUnit === null ? '—' : `${f.pricePerUnit.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 })}/${f.unit}`],
          ['Price confidence', f.priceConfidence], ['Known operating costs', usd(f.knownExpenses)],
        ].map(([label, val]) => <div key={label}><dt className="text-ink-soft">{label}</dt><dd className="font-semibold">{val}</dd></div>)}</dl>
        <ul className="ml-4 list-disc space-y-1">{Object.entries(f.expenseBreakdown).map(([kind, v]) => <li key={kind}>{kind} · {usd(v)}</li>)}{f.trace.map((line, j) => <li key={j}>{line}</li>)}</ul>
        {f.issues.length > 0 && <div className="mt-3"><h3 className="font-semibold">Review</h3><ul className="ml-4 list-disc">{f.issues.map((line, j) => <li key={j}>{line}</li>)}</ul></div>}
      </details>)}
    </Section>
    <LedgerDetails forecast={forecast} />
  </div>;
}
