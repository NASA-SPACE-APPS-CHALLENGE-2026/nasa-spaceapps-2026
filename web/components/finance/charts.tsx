'use client';

import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/**
 * Chart pieces shared by Finance, Simulator and Overview.
 * Two fixed series colours (validated: CVD ΔE 24.7, contrast ≥ 3:1 on white). Colour follows the plan, never its rank.
 */
export const SERIES = {
  proposed: { label: 'PlotTwist plan', color: '#2a78d6' },
  current: { label: 'Current rotation', color: '#eb6834' },
} as const;

const GRID = '#e3ebe5';
const AXIS_TEXT = '#4a5a50';

export function money(v: number, opts: { sign?: boolean; cents?: boolean } = {}): string {
  const abs = Math.abs(v);
  const s = abs.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: opts.cents ? 2 : 0, minimumFractionDigits: opts.cents ? 2 : 0 });
  if (v < -0.005) return `−${s}`;
  return opts.sign && v > 0.005 ? `+${s}` : s;
}

function compact(v: number): string {
  const abs = Math.abs(v);
  const s = abs >= 1_000_000 ? `$${(abs / 1_000_000).toFixed(1)}M` : abs >= 10_000 ? `$${Math.round(abs / 1000)}K` : `$${Math.round(abs).toLocaleString('en-US')}`;
  return v < 0 ? `−${s}` : s;
}

export function Legend({ items = [SERIES.proposed, SERIES.current] }: { items?: ReadonlyArray<{ label: string; color: string }> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-ink-soft" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

interface TipPayload {
  dataKey?: string | number;
  value?: number;
  color?: string;
}

function ChartTip({ active, payload, label, format }: { active?: boolean; payload?: TipPayload[]; label?: string | number; format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-parcel border border-line bg-panel px-3 py-2 text-[13.5px] shadow-md">
      <p className="font-semibold text-ink">{label}</p>
      {payload.map((p) => {
        const s = SERIES[p.dataKey as keyof typeof SERIES];
        return (
          <p key={String(p.dataKey)} className="flex items-center gap-2 text-ink-soft">
            <span className="h-2 w-2 rounded-full" style={{ background: s?.color ?? p.color }} aria-hidden />
            {s?.label ?? p.dataKey}: <span className="font-semibold tabular-nums text-ink">{format(Number(p.value))}</span>
          </p>
        );
      })}
    </div>
  );
}

/** Rounded at the data end, square at the zero baseline, for positive and negative values. */
function RoundedBar(props: { x?: number; y?: number; width?: number; height?: number; fill?: string; value?: number | number[] }) {
  const { x = 0, y = 0, width = 0, height = 0, fill } = props;
  const v = Array.isArray(props.value) ? props.value[1] - props.value[0] : Number(props.value ?? 0);
  const h = Math.abs(height);
  if (!h || !width) return null;
  const top = height < 0 ? y + height : y;
  const r = Math.min(4, h, width / 2);
  const d =
    v >= 0
      ? `M${x},${top + h} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + width - r},${top} Q${x + width},${top} ${x + width},${top + r} L${x + width},${top + h} Z`
      : `M${x},${top} L${x + width},${top} L${x + width},${top + h - r} Q${x + width},${top + h} ${x + width - r},${top + h} L${x + r},${top + h} Q${x},${top + h} ${x},${top + h - r} Z`;
  return <path d={d} fill={fill} />;
}

export interface PairPoint {
  label: string;
  current: number;
  proposed: number;
}

/** Columns per year (or per row label) for the two plans. */
export function PairColumns({ data, height = 260, format = (v: number) => money(v), title }: { data: PairPoint[]; height?: number; format?: (v: number) => string; title: string }) {
  return (
    <figure aria-label={title}>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: AXIS_TEXT, fontSize: 13 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: AXIS_TEXT, fontSize: 12.5 }} tickFormatter={compact} width={64} />
            <ReferenceLine y={0} stroke="#b9c9bd" />
            <Tooltip cursor={{ fill: 'rgba(29,43,34,0.05)' }} content={<ChartTip format={format} />} />
            <Bar dataKey="proposed" fill={SERIES.proposed.color} maxBarSize={24} shape={<RoundedBar />} isAnimationActive={false} />
            <Bar dataKey="current" fill={SERIES.current.color} maxBarSize={24} shape={<RoundedBar />} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Two lines over time (cumulative profit). */
export function PairLines({ data, height = 260, title, marker }: { data: PairPoint[]; height?: number; title: string; marker?: string }) {
  return (
    <figure aria-label={title}>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: AXIS_TEXT, fontSize: 12 }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: AXIS_TEXT, fontSize: 12.5 }} tickFormatter={compact} width={64} />
            <ReferenceLine y={0} stroke="#b9c9bd" />
            {marker && <ReferenceLine x={marker} stroke="#75847a" strokeDasharray="0" label={{ value: 'Break-even', position: 'insideTopRight', fill: AXIS_TEXT, fontSize: 12 }} />}
            <Tooltip cursor={{ stroke: '#b9c9bd', strokeWidth: 1 }} content={<ChartTip format={(v) => money(v)} />} />
            <Line type="monotone" dataKey="proposed" stroke={SERIES.proposed.color} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="current" stroke={SERIES.current.color} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Bad–good range with a dot at the typical value, one row per plan (plain SVG so it scales to any width). */
export function RangeRows({ rows, format = (v: number) => money(v) }: { rows: Array<{ key: keyof typeof SERIES; bad: number; typical: number; good: number }>; format?: (v: number) => string }) {
  const lo = Math.min(0, ...rows.map((r) => r.bad));
  const hi = Math.max(0, ...rows.map((r) => r.good));
  const span = hi - lo || 1;
  const pct = (v: number) => `${((v - lo) / span) * 100}%`;
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <div key={r.key}>
          <p className="text-[14px] font-semibold text-ink">{SERIES[r.key].label}</p>
          <div className="relative mt-2 h-6" role="img" aria-label={`${SERIES[r.key].label}: bad year ${format(r.bad)}, typical ${format(r.typical)}, good year ${format(r.good)}`}>
            <span className="absolute inset-y-0 w-px bg-line-strong" style={{ left: pct(0) }} aria-hidden />
            <span className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full opacity-35" style={{ left: pct(r.bad), width: `calc(${pct(r.good)} - ${pct(r.bad)})`, background: SERIES[r.key].color }} aria-hidden />
            <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: pct(r.typical), background: SERIES[r.key].color }} aria-hidden />
          </div>
          <div className="mt-1 flex justify-between text-[12.5px] tabular-nums text-ink-soft">
            <span>Bad {format(r.bad)}</span>
            <span className="font-semibold text-ink">Typical {format(r.typical)}</span>
            <span>Good {format(r.good)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
