'use client';

import { useState } from 'react';
import { MONTH_SHORT } from '@/lib/domain/management';
import { ECOLOGY_SOURCES, type EcologicalSide, type CoverState } from '@/lib/domain/ecology';
import { SECTION, Segmented } from '../finance/ui';

// AP's paired chart palette, comparison panels, hover details and seasonal timeline,
// adapted to main's actual Planner horizon and the shared ecological calculation results.
export const ECO_SERIES = [{ label: 'Current rotation', color: '#647d78' }, { label: 'Proposed Planner rotation', color: '#347a52' }];
export const fmt = (v: number | null) => v === null ? 'Unavailable' : v.toLocaleString('en-US', { maximumFractionDigits: 1 });
export function ComparisonLegend() {
  return <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft">{ECO_SERIES.map((s) => <span key={s.label} className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-sm" style={{ background: s.color }} aria-hidden />{s.label}</span>)}</div>;
}

/** Responsive paired bars adapted from AP's RotationComparisonChart / Finance NetChart.
 * Missing values never become zero. Signed axes support a negative partial N balance.
 */
export function ComparisonBars({ rows, unit }: { rows: Array<{ label: string; current: number | null; proposed: number | null }>; unit: string }) {
  const all = rows.flatMap((r) => [r.current, r.proposed]).filter((v): v is number => v !== null);
  const min = Math.min(0, ...all), max = Math.max(1, ...all);
  const position = (n: number) => (n - min) / (max - min) * 100;
  const zero = position(0);
  return <div className="mt-4 space-y-4">{rows.map((r) => <div key={r.label}>
    <p className="mb-1 text-sm font-semibold">{r.label}</p>
    {[r.current, r.proposed].map((v, i) => <div key={i} className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3">
      <div className="relative h-5 rounded bg-paper" role="img" aria-label={`${r.label}, ${ECO_SERIES[i].label}: ${fmt(v)} ${v === null ? '' : unit}`}>
        <span className="absolute inset-y-0 border-l border-line-strong" style={{ left: `${zero}%` }} />
        {v !== null && <div className="absolute top-1 h-3 rounded-sm" style={{ left: `${Math.min(zero, position(v))}%`, width: `${Math.abs(position(v) - zero)}%`, background: ECO_SERIES[i].color }} title={`${ECO_SERIES[i].label}: ${fmt(v)} ${unit}`} />}
      </div><span className="text-right text-xs tabular-nums">{fmt(v)}{v !== null && ` ${unit}`}</span>
    </div>)}
  </div>)}</div>;
}
function Interpretation({ children }: { children: React.ReactNode }) { return <div className="mt-4 rounded-xl bg-paper p-3 text-sm leading-relaxed text-ink-soft">{children}</div>; }
function Source({ href, children }: { href: string; children: React.ReactNode }) { return <a href={href} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-sky-deep underline">{children}</a>; }
function QualitativePair({ current, proposed, kind }: { current: EcologicalSide; proposed: EcologicalSide; kind: 'erosion' | 'organic' }) {
  return <div className="mt-4 grid gap-3 sm:grid-cols-2">{[current, proposed].map((s, i) => <div key={i} className="rounded-xl border border-line p-4" style={{ borderTop: `4px solid ${ECO_SERIES[i].color}` }}>
    <p className="text-xs font-semibold text-ink-soft">{ECO_SERIES[i].label}</p>
    <p className="mt-2 font-plate text-xl">{kind === 'erosion' ? s.erosion : s.organic}</p>
    <p className="mt-2 text-sm">{fmt(s.livingDays)} living-cover days/year · {s.factors.tillage} tillage · residue {s.factors.residue}</p>
    {kind === 'organic' && <p className="mt-1 text-sm">Cover crops in {s.diversity.coverYears} of {s.seasons.length} years</p>}
  </div>)}</div>;
}

const COVER: Record<CoverState, { label: string; color: string }> = {
  cash: { label: 'Cash crop', color: '#347a52' }, cover: { label: 'Cover crop', color: '#2b7fd0' },
  residue: { label: 'Residue retained (assumed)', color: '#c9971f' }, gap: { label: 'No living cover', color: '#e9e1d3' }, unknown: { label: 'Unknown', color: '#d6dce1' },
};
export function CropCoverTimeline({ current, proposed }: { current: EcologicalSide; proposed: EcologicalSide }) {
  const [detail, setDetail] = useState('Tap or focus a month to inspect its planned cover.');
  return <>
    <div className="mt-4 space-y-5">{[current, proposed].map((side, i) => <div key={i}>
      <p className="mb-2 text-sm font-semibold">{ECO_SERIES[i].label}</p>
      <div className="grid grid-cols-[2.5rem_repeat(12,minmax(0,1fr))] gap-1" aria-hidden><span />{MONTH_SHORT.map((m) => <span key={m} className="text-center text-[10px]">{m[0]}</span>)}</div>
      {side.seasons.map((s) => <div key={s.year} className="mt-1 grid grid-cols-[2.5rem_repeat(12,minmax(0,1fr))] gap-1">
        <span className="self-center text-xs tabular-nums">{s.year}</span>
        {side.timeline.months.filter((m) => m.year === s.year).map((m) => {
          const text = `${ECO_SERIES[i].label}, ${MONTH_SHORT[m.month - 1]} ${m.year}: ${m.detail}; about ${m.days} days.`;
          return <button key={m.month} type="button" className="min-h-8 rounded-sm border border-black/10" style={{ background: COVER[m.state].color }} aria-label={text} title={text} onFocus={() => setDetail(text)} onClick={() => setDetail(text)} onMouseEnter={() => setDetail(text)} />;
        })}
      </div>)}
    </div>)}</div>
    <p className="mt-3 min-h-12 text-sm text-ink-soft" role="status">{detail}</p>
    <div className="flex flex-wrap gap-3 text-xs">{Object.values(COVER).map((s) => <span key={s.label} className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-sm" style={{ background: s.color }} aria-hidden />{s.label}</span>)}</div>
  </>;
}

export function EcologyCharts({ current: c, proposed: p, irrigated }: { current: EcologicalSide; proposed: EcologicalSide; irrigated: boolean }) {
  const [nMetric, setNMetric] = useState<'input' | 'removal' | 'balance'>('input');
  return <div className="space-y-5" data-testid="eco-results">
    <section className={SECTION} aria-labelledby="erosion-h">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">01 / Soil protection</p>
      <h2 id="erosion-h" className="mt-1 font-plate text-2xl">Soil erosion</h2>
      <QualitativePair current={c} proposed={p} kind="erosion" />
      <Interpretation>Current: {c.erosion.toLowerCase()}; proposed: {p.erosion.toLowerCase()}. The proposed plan has {fmt(p.gapDays)} days/year without planned living vegetation, compared with {fmt(c.gapDays)} currently. Tillage and retained residue affect protection during these gaps. {p.factors.slope === undefined ? 'Field slope is unavailable.' : `Mapped average slope is ${fmt(p.factors.slope)}%.`} {p.factors.wet ? 'Wet conditions add rainfall exposure, but rainfall erosivity has not been modeled.' : 'Weather is a scenario assumption, not a forecast.'} Review local conservation practices before interpreting this as a risk rating.</Interpretation>
      <p className="mt-3 text-sm text-ink-soft">Soil loss (tons/ac/year): unavailable. Soil-specific tolerance T: unavailable. Rainfall erosivity, soil erodibility, slope length, calibrated cover/practice factors and soil-specific T are missing. T is a tolerance benchmark, not a universal legal limit.</p>
      <Source href={ECOLOGY_SOURCES.erosion}>USDA NRCS erosion methodology</Source>
    </section>
    <section className={SECTION} aria-labelledby="som-h">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">02 / Long-term soil health</p>
      <h2 id="som-h" className="mt-1 font-plate text-2xl">Soil organic matter trend</h2>
      <QualitativePair current={c} proposed={p} kind="organic" />
      <Interpretation>Across {p.seasons[0]?.year}–{p.seasons.at(-1)?.year}, the proposed plan includes {p.diversity.coverYears} cover-crop years versus {c.diversity.coverYears}. With {p.factors.tillage} tillage and {p.factors.residue} residue management, its direction is “{p.organic.toLowerCase()}.” These are practice-based signals, not predicted percentage changes. Repeated soil tests are needed to determine whether organic matter is increasing, stable or decreasing.</Interpretation>
      <Source href={ECOLOGY_SOURCES.soil}>USDA NRCS soil health practices</Source>
    </section>
    <section className={SECTION} aria-labelledby="nitrogen-h">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">03 / Nutrient management</p>
      <h2 id="nitrogen-h" className="mt-1 font-plate text-2xl">Nitrogen inputs and partial balance</h2>
      <div className="mt-3"><Segmented label="Nitrogen measure" value={nMetric} onChange={setNMetric} options={[{ value: 'input', label: 'Fertilizer' }, { value: 'removal', label: 'Removal' }, { value: 'balance', label: 'Balance' }]} /></div>
      <div className="mt-3"><ComparisonLegend /></div>
      <ComparisonBars unit="lb N/ac" rows={p.nitrogen.map((n, i) => ({ label: String(n.year), current: c.nitrogen[i]?.[nMetric] ?? null, proposed: n[nMetric] }))} />
      <Interpretation>Annual fertilizer averages: current {fmt(c.fertilizer)}, proposed {fmt(p.fertilizer)} lb N/ac/year. Proposed harvested-grain removal averages {fmt(p.removal)}; its partial balance averages {fmt(p.balance)} lb N/ac/year. Balance means fertilizer minus grain removal, excluding fixation, mineralization, manure, deposition and losses. Negative values are not fertilizer recommendations; legume fixation is especially important. Yields are baseline assumptions and do not change automatically with weather.</Interpretation>
      <p className="mt-3 text-sm"><strong>Leaching concern:</strong> current {c.leaching.toLowerCase()}, proposed {p.leaching.toLowerCase()}. {p.factors.wet ? 'Wet conditions increase water-movement concerns.' : 'Normal or dry conditions do not rule out nitrogen loss.'} {p.factors.coarse && 'Sandy texture may allow faster drainage.'} {irrigated && 'Irrigation is enabled; excess irrigation could increase loss, but amount and timing are unknown.'} Proposed positive partial balances occur in {p.surplusYears.join(', ') || 'no fully modeled years'}. This is a qualitative screening, not pounds leached.</p>
      {[...new Set([...c.nitrogen, ...p.nitrogen].flatMap((n) => n.missing))].length > 0 && <p className="mt-2 text-sm text-wheat-deep">Missing: {[...new Set([...c.nitrogen, ...p.nitrogen].flatMap((n) => n.missing))].join('; ')}. Incomplete totals are unavailable.</p>}
      <Source href={ECOLOGY_SOURCES.nitrogen}>Grain nitrogen-removal coefficients</Source><span className="mx-2">·</span><Source href={ECOLOGY_SOURCES.leaching}>Leaching pathways</Source>
    </section>
    <section className={SECTION} aria-labelledby="cover-h">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">04 / The seasons between harvests</p>
      <h2 id="cover-h" className="mt-1 font-plate text-2xl">Living cover and seasonal gaps</h2>
      <CropCoverTimeline current={c} proposed={p} />
      <Interpretation>Planned living cover averages {fmt(c.livingDays)} days/year currently and {fmt(p.livingDays)} in the proposed plan. Longer living-cover periods can help protect soil and retain nutrients. Months include planting and harvest months in full, so day totals are approximate. Days without living vegetation are not necessarily bare soil. Check establishment, termination and residue coverage in the field.</Interpretation>
      <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-sky-deep">Calendar assumptions</summary><ul className="mt-2 list-disc space-y-1 pl-5">{[...new Set([...c.timeline.notes, ...p.timeline.notes])].map((n) => <li key={n}>{n}</li>)}<li>Planner tasks take precedence over regional calendar estimates. Repeated years beyond the saved plan use calendar estimates.</li></ul></details>
    </section>
    <section className={SECTION} aria-labelledby="diversity-h">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">05 / Rotation variety</p>
      <h2 id="diversity-h" className="mt-1 font-plate text-2xl">Crop rotation diversity</h2>
      <div className="mt-3"><ComparisonLegend /></div>
      <ComparisonBars unit="count" rows={[
        { label: 'Distinct cash-crop types', current: c.diversity.crops, proposed: p.diversity.crops },
        { label: 'Known families (including covers)', current: c.diversity.families, proposed: p.diversity.families },
        { label: 'Consecutive repeated-crop transitions', current: c.diversity.repeated, proposed: p.diversity.repeated },
        { label: 'Years with cover crops', current: c.diversity.coverYears, proposed: p.diversity.coverYears },
      ]} />
      <Interpretation>Proposed crops: {p.diversity.names.join(', ') || 'not entered'}. Covers: {p.diversity.coverNames.join(', ') || 'none'}. This is {p.diversity.crops} cash-crop types versus {c.diversity.crops} currently, with {p.diversity.repeated} repeated transitions versus {c.diversity.repeated}. Different crops may share pest hosts, especially within a family. Counts describe the plan; they are not a biodiversity or disease-elimination score. {p.diversity.unknownYears + c.diversity.unknownYears > 0 && 'Unknown crops make these counts incomplete.'}</Interpretation>
    </section>
  </div>;
}
