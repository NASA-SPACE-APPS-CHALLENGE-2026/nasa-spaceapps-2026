'use client';

import { useId } from 'react';
import { FINANCIAL_COST_CATEGORIES, type FinancialProjection, type ProjectionYear } from '@/lib/domain/finance';

const CURRENT_COLOR = '#647d78';
const PROPOSED_COLOR = '#347a52';
const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function money(value: number | null): string {
  return value === null ? 'Needs inputs' : MONEY.format(value);
}

function chartRange(values: number[]) {
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const spread = max - min || 1;
  return { min: min - spread * 0.08, max: max + spread * 0.08 };
}

function ChartEmpty({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-44 items-center justify-center rounded-xl bg-field-tint/45 px-5 py-8 text-center text-sm text-ink-soft">{children}</div>;
}

function Legend({ currentLabel, proposedLabel }: { currentLabel: string; proposedLabel: string }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-ink-soft">
      {[{ label: currentLabel, color: CURRENT_COLOR }, { label: proposedLabel, color: PROPOSED_COLOR }].map((item) => (
        <span key={item.label} className="inline-flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function NetChart({ current, proposed, cumulative, currentLabel, proposedLabel }: {
  current: FinancialProjection;
  proposed: FinancialProjection;
  cumulative: boolean;
  currentLabel: string;
  proposedLabel: string;
}) {
  const titleId = useId();
  const currentValues: Array<number | null> = [];
  const proposedValues: Array<number | null> = [];
  let currentSum = 0;
  let proposedSum = 0;
  for (let index = 0; index < Math.max(current.years.length, proposed.years.length); index++) {
    const currentYear = current.years[index];
    const proposedYear = proposed.years[index];
    if (currentYear?.netReturn === null || !currentYear) currentValues.push(null);
    else {
      currentSum += currentYear.netReturn;
      currentValues.push(cumulative ? currentSum : currentYear.netReturn);
    }
    if (proposedYear?.netReturn === null || !proposedYear) proposedValues.push(null);
    else {
      proposedSum += proposedYear.netReturn;
      proposedValues.push(cumulative ? proposedSum : proposedYear.netReturn);
    }
  }
  const completeValues = [...currentValues, ...proposedValues].filter((value): value is number => value !== null);
  if (!completeValues.length) return <ChartEmpty>Complete the yield, price, production-cost, and land inputs to see a reliable comparison.</ChartEmpty>;

  const width = 620;
  const left = 64;
  const right = 18;
  const top = 18;
  const bottom = 164;
  const plotWidth = width - left - right;
  const plotHeight = bottom - top;
  const { min, max } = chartRange(completeValues);
  const y = (value: number) => top + ((max - value) / (max - min)) * plotHeight;
  const zero = y(0);
  const years = current.years.map((item, index) => item.year === proposed.years[index]?.year ? String(item.year) : `S${index + 1}`);
  const groupWidth = plotWidth / Math.max(1, years.length);
  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);

  return (
    <div>
      <svg className="h-auto w-full" viewBox={`0 0 ${width} 210`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>{cumulative ? 'Cumulative net operating return' : 'Annual net operating return'} for the current rotation and selected alternative</title>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke="#dce5dc" strokeWidth="1" />
            <text x={left - 8} y={y(tick) + 4} textAnchor="end" fill="#62726a" fontSize="11">{MONEY.format(tick)}</text>
          </g>
        ))}
        <line x1={left} x2={width - right} y1={zero} y2={zero} stroke="#87948b" strokeWidth="1.5" />
        {years.map((year, index) => {
          const center = left + index * groupWidth + groupWidth / 2;
          const values = [currentValues[index], proposedValues[index]];
          return (
            <g key={`${year}-${index}`}>
              {cumulative ? values.map((value, seriesIndex) => {
                if (value === null) return null;
                const previous = index > 0 ? (seriesIndex === 0 ? currentValues[index - 1] : proposedValues[index - 1]) : null;
                const pointX = center + (seriesIndex === 0 ? -4 : 4);
                const pointY = y(value);
                const previousCenter = left + (index - 1) * groupWidth + groupWidth / 2 + (seriesIndex === 0 ? -4 : 4);
                return (
                  <g key={seriesIndex}>
                    {previous !== null && previous !== undefined && <line x1={previousCenter} y1={y(previous)} x2={pointX} y2={pointY} stroke={seriesIndex === 0 ? CURRENT_COLOR : PROPOSED_COLOR} strokeWidth="3" strokeLinecap="round" />}
                    <circle cx={pointX} cy={pointY} r="4.5" fill={seriesIndex === 0 ? CURRENT_COLOR : PROPOSED_COLOR} />
                  </g>
                );
              }) : values.map((value, seriesIndex) => {
                if (value === null) return null;
                const barWidth = Math.min(26, groupWidth * 0.24);
                const x = center + (seriesIndex === 0 ? -barWidth - 2 : 2);
                const valueY = y(value);
                const height = Math.max(2, Math.abs(zero - valueY));
                return <rect key={seriesIndex} x={x} y={Math.min(zero, valueY)} width={barWidth} height={height} rx="3" fill={seriesIndex === 0 ? CURRENT_COLOR : PROPOSED_COLOR} />;
              })}
              <text x={center} y={bottom + 18} textAnchor="middle" fill="#62726a" fontSize="12">{year}</text>
            </g>
          );
        })}
        <text x={left} y="202" fill="#62726a" fontSize="11">{cumulative ? 'Net return accumulated from season 1' : 'Net return · USD / field'}</text>
        <text x={width - right} y="202" textAnchor="end" fill="#62726a" fontSize="11">{cumulative ? 'Not discounted; no inflation assumed' : 'USD / field'}</text>
      </svg>
      <Legend currentLabel={currentLabel} proposedLabel={proposedLabel} />
    </div>
  );
}

export function AnnualNetChart(props: Omit<Parameters<typeof NetChart>[0], 'cumulative'>) {
  return <NetChart {...props} cumulative={false} />;
}

export function CumulativeNetChart(props: Omit<Parameters<typeof NetChart>[0], 'cumulative'>) {
  return <NetChart {...props} cumulative />;
}

export function RevenueCostChart({ current, proposed, currentLabel, proposedLabel }: {
  current: ProjectionYear | undefined;
  proposed: ProjectionYear | undefined;
  currentLabel: string;
  proposedLabel: string;
}) {
  const titleId = useId();
  if (!current || !proposed || current.revenue === null || current.costs === null || proposed.revenue === null || proposed.costs === null) {
    return <ChartEmpty>Year-one revenue and costs appear once both schedules have complete financial inputs.</ChartEmpty>;
  }
  const values = [current.revenue, current.costs, proposed.revenue, proposed.costs];
  const max = Math.max(1, ...values);
  const width = 620;
  const left = 72;
  const right = 18;
  const top = 18;
  const bottom = 164;
  const plotHeight = bottom - top;
  const series = [
    { label: currentLabel, revenue: current.revenue, costs: current.costs, color: CURRENT_COLOR },
    { label: proposedLabel, revenue: proposed.revenue, costs: proposed.costs, color: PROPOSED_COLOR },
  ];
  return (
    <div>
      <svg className="h-auto w-full" viewBox={`0 0 ${width} 210`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>Season-one revenue and operating costs for the current rotation and selected alternative</title>
        {[0, 0.25, 0.5, 0.75, 1].map((step) => {
          const y = bottom - plotHeight * step;
          return <g key={step}><line x1={left} x2={width - right} y1={y} y2={y} stroke="#dce5dc" /><text x={left - 8} y={y + 4} textAnchor="end" fill="#62726a" fontSize="11">{MONEY.format(max * step)}</text></g>;
        })}
        {series.map((item, index) => {
          const center = left + ((width - left - right) * (index + 0.5)) / series.length;
          const barWidth = 34;
          const revenueHeight = (item.revenue / max) * plotHeight;
          const costHeight = (item.costs / max) * plotHeight;
          return (
            <g key={item.label}>
              <rect x={center - barWidth - 3} y={bottom - revenueHeight} width={barWidth} height={revenueHeight} rx="3" fill={item.color} />
              <rect x={center + 3} y={bottom - costHeight} width={barWidth} height={costHeight} rx="3" fill={item.color} opacity="0.42" />
              <text x={center} y={bottom + 18} textAnchor="middle" fill="#33443b" fontSize="12">{index === 0 ? 'Current' : 'Alternative'}</text>
            </g>
          );
        })}
        <text x={left} y="202" fill="#62726a" fontSize="11">First season · USD / field</text>
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-ink-soft">
        {series.map((item) => <span key={item.label} className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />{item.label}: revenue / costs</span>)}
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-ink-faint/40" />Shaded bar = operating costs</span>
      </div>
    </div>
  );
}

const COST_LABELS: Record<string, string> = {
  aggregate: 'Operating costs entered as one total',
  'cash-rent': 'Cash rent',
  'share-rent': 'Landowner crop share',
  cover: 'Cover crop establishment',
  transition: 'One-time transition',
};
for (const category of FINANCIAL_COST_CATEGORIES) COST_LABELS[category.id] = category.label;

export function ExpenseBreakdown({ current, proposed, currentLabel, proposedLabel }: {
  current: ProjectionYear | undefined;
  proposed: ProjectionYear | undefined;
  currentLabel: string;
  proposedLabel: string;
}) {
  const categories = [...new Set([...Object.keys(current?.costBreakdown ?? {}), ...Object.keys(proposed?.costBreakdown ?? {})])];
  const max = Math.max(1, ...categories.flatMap((id) => [current?.costBreakdown[id as keyof ProjectionYear['costBreakdown']] ?? 0, proposed?.costBreakdown[id as keyof ProjectionYear['costBreakdown']] ?? 0]));
  if (!current || !proposed || current.costs === null || proposed.costs === null) {
    return <ChartEmpty>Complete both cost estimates to compare the first-season expense mix.</ChartEmpty>;
  }
  if (!categories.length) return <ChartEmpty>No expense categories were entered.</ChartEmpty>;
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-ink-soft">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CURRENT_COLOR }} />{currentLabel}</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PROPOSED_COLOR }} />{proposedLabel}</span>
      </div>
      <div className="space-y-4">
        {categories.map((id) => {
          const currentValue = current.costBreakdown[id as keyof ProjectionYear['costBreakdown']] ?? 0;
          const proposedValue = proposed.costBreakdown[id as keyof ProjectionYear['costBreakdown']] ?? 0;
          return (
            <div key={id}>
              <div className="mb-1 flex justify-between gap-3 text-[13px]">
                <span className="font-medium text-ink">{COST_LABELS[id] ?? id}</span>
                <span className="shrink-0 text-ink-soft">{money(currentValue)} / {money(proposedValue)}</span>
              </div>
              <div className="space-y-1">
                <div className="h-2 overflow-hidden rounded-full bg-field-tint"><div className="h-full rounded-full" style={{ width: `${(currentValue / max) * 100}%`, backgroundColor: CURRENT_COLOR }} /></div>
                <div className="h-2 overflow-hidden rounded-full bg-field-tint"><div className="h-full rounded-full" style={{ width: `${(proposedValue / max) * 100}%`, backgroundColor: PROPOSED_COLOR }} /></div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-[12px] text-ink-faint">First season · USD / field. Crop yields and costs use your per-acre entries across the full field area.</p>
    </div>
  );
}
