'use client';

import { useState } from 'react';
import { cropName } from '@/lib/domain/rotation/agronomy';
import { MONTH_SHORT } from '@/lib/domain/management';
import { ECOLOGY_SOURCES, type EcologicalSide, type CoverState, type NitrogenYear } from '@/lib/domain/ecology';
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
export function ComparisonBars({ rows, unit }: { rows: Array<{ label: string; current: number | null; proposed: number | null; crops?: [string, string]; missing?: [string, string] }>; unit: string }) {
  const all = rows.flatMap((r) => [r.current, r.proposed]).filter((v): v is number => v !== null);
  const min = Math.min(0, ...all), max = Math.max(1, ...all);
  const position = (n: number) => (n - min) / (max - min) * 100;
  const zero = position(0);
  return <div className="mt-4 space-y-4">{rows.map((r) => <div key={r.label}>
    <p className="mb-1 text-sm font-semibold">{r.label}</p>
    {[r.current, r.proposed].map((v, i) => <div key={i} className="mb-2">
      {r.crops && <p className="mb-1 flex items-center gap-2 text-xs text-ink-soft"><i className="h-2 w-2 shrink-0 rounded-sm" style={{ background: ECO_SERIES[i].color }} aria-hidden />{ECO_SERIES[i].label}: {r.crops[i]}</p>}
      {v === null ? <p className="rounded-lg border border-dashed border-line px-3 py-2 text-sm text-ink-soft">{r.missing?.[i] || 'Enter the missing inputs to calculate this year.'}</p> : <div className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3">
        <div className="relative h-5 rounded bg-paper" role="img" aria-label={`${r.label}, ${ECO_SERIES[i].label}: ${fmt(v)} ${unit}`}>
          <span className="absolute inset-y-0 border-l border-line-strong" style={{ left: `${zero}%` }} />
          <div className="absolute top-1 h-3 rounded-sm" style={{ left: `${Math.min(zero, position(v))}%`, width: v === 0 ? '2px' : `${Math.abs(position(v) - zero)}%`, background: ECO_SERIES[i].color }} title={`${ECO_SERIES[i].label}: ${fmt(v)} ${unit}`} />
        </div><span className="text-right text-xs tabular-nums">{fmt(v)} {unit}</span>
      </div>}
    </div>)}
  </div>)}</div>;
}
function Interpretation({ children }: { children: React.ReactNode }) { return <div className="mt-4 rounded-xl bg-paper p-3 text-sm leading-relaxed text-ink-soft">{children}</div>; }
function Source({ href, children }: { href: string; children: React.ReactNode }) { return <a href={href} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-sky-deep underline">{children}</a>; }
function QualitativePair({ current, proposed, kind }: { current: EcologicalSide; proposed: EcologicalSide; kind: 'erosion' | 'organic' }) {
  return <div className="mt-4 grid gap-3 sm:grid-cols-2">{[current, proposed].map((s, i) => <div key={i} className="rounded-xl border border-line p-4" style={{ borderTop: `4px solid ${ECO_SERIES[i].color}` }}>
    <p className="text-xs font-semibold text-ink-soft">{ECO_SERIES[i].label}</p>
    <p className="mt-2 font-plate text-xl">{kind === 'erosion' ? s.erosion : s.organic}</p>
    <p className="mt-2 text-sm">{s.livingDays === null ? 'Crop dates needed' : `${fmt(s.livingDays)} living-cover days/year`} · {s.factors.tillage} tillage · residue {s.factors.residue}</p>
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
  return <div className="space-y-5" data-testid="eco-results">
    <section className={SECTION} aria-labelledby="erosion-h">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">01 / Soil protection</p>
      <h2 id="erosion-h" className="mt-1 font-plate text-2xl">Soil erosion</h2>
      <QualitativePair current={c} proposed={p} kind="erosion" />
      <Interpretation>{p.gapDays !== null && c.gapDays !== null ? `The proposed plan has about ${fmt(p.gapDays)} days/year without living cover, compared with ${fmt(c.gapDays)} currently.` : 'Complete crop choices and dates in Planner to compare seasonal cover.'} Tillage and retained residue also affect soil protection.</Interpretation>
      <details className="mt-3 text-sm text-ink-soft"><summary className="cursor-pointer font-semibold text-sky-deep">How soil protection is assessed</summary><p className="mt-2">This is a practice-based comparison, not a calibrated erosion forecast. {p.factors.slope === undefined ? 'No mapped slope is available.' : `Mapped average slope: ${fmt(p.factors.slope)}%.`} Soil-loss tonnage and soil-specific tolerance require rainfall erosivity, soil erodibility, slope length and local cover/practice factors. Weather is a scenario assumption.</p><Source href={ECOLOGY_SOURCES.erosion}>USDA NRCS erosion methodology</Source></details>
    </section>
    <section className={SECTION} aria-labelledby="som-h">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">02 / Long-term soil health</p>
      <h2 id="som-h" className="mt-1 font-plate text-2xl">Soil organic matter trend</h2>
      <QualitativePair current={c} proposed={p} kind="organic" />
      <Interpretation>The proposed plan includes cover crops in {p.diversity.coverYears} of {p.seasons.length} years. These practice-based signals describe potential direction; repeated soil tests are needed to measure change.</Interpretation>
      <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-sky-deep">Soil organic matter methods</summary><p className="mt-2 text-ink-soft">The comparison uses tillage, residue retention and cover-crop frequency. It does not predict a percentage change.</p><Source href={ECOLOGY_SOURCES.soil}>USDA NRCS soil health practices</Source></details>
    </section>
    <NitrogenComparison current={c} proposed={p} irrigated={irrigated} />
    <section className={SECTION} aria-labelledby="cover-h">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">04 / The seasons between harvests</p>
      <h2 id="cover-h" className="mt-1 font-plate text-2xl">Living cover and seasonal gaps</h2>
      <CropCoverTimeline current={c} proposed={p} />
      <Interpretation>{c.livingDays !== null && p.livingDays !== null ? `Planned living cover averages ${fmt(c.livingDays)} days/year currently and ${fmt(p.livingDays)} in the proposed plan.` : 'Complete crop choices and dates in Planner to calculate living-cover averages.'} Months include planting and harvest months in full, so totals are approximate. Days without living vegetation may still have residue cover.</Interpretation>
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


type NitrogenMetric = 'input' | 'removal' | 'balance';
function missingFor(n: NitrogenYear | undefined, metric: NitrogenMetric) {
  if (!n || n.missing.includes('Crop sequence')) return 'Choose a crop for this year in the rotation.';
  const messages = n.needs.flatMap((need) => {
    const inputs = [metric !== 'removal' && need.rate ? 'fertilizer rate' : '', metric !== 'input' && need.yield ? 'expected yield' : ''].filter(Boolean);
    return [...(inputs.length ? [`Enter ${cropName(need.crop)} ${inputs.join(' and ')}.`] : []), ...(metric !== 'input' && need.coefficient ? [`${cropName(need.crop)} grain-removal model is not supported.`] : [])];
  });
  return messages.join(' ');
}
function NitrogenComparison({ current: c, proposed: p, irrigated }: { current: EcologicalSide; proposed: EcologicalSide; irrigated: boolean }) {
  const [metric, setMetric] = useState<NitrogenMetric>('input');
  const title = { input: 'fertilizer', removal: 'grain removal', balance: 'partial balance' }[metric];
  const key = metric === 'input' ? 'fertilizer' : metric;
  const needs = [...new Set([...c.nitrogen, ...p.nitrogen].flatMap((n) => n.needs.filter((x) => (metric !== 'removal' && x.rate) || (metric !== 'input' && x.yield)).map((x) => x.crop)))];
  const rice = [...c.seasons, ...p.seasons].some((s) => s.crops.includes('rice'));
  return <section className={SECTION} aria-labelledby="nitrogen-h">
    <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">03 / Nutrient management</p>
    <h2 id="nitrogen-h" className="mt-1 font-plate text-2xl">Nitrogen inputs and partial balance</h2>
    <p className="mt-2 text-sm text-ink-soft">{metric === 'input' ? 'Applied fertilizer by crop year. A zero means no fertilizer in the entered or reference rate.' : metric === 'removal' ? 'Expected harvested-grain nitrogen, calculated from yield and a published crop coefficient.' : 'Fertilizer minus expected grain removal. This partial balance is not a fertilizer recommendation.'}</p>
    <div className="mt-3"><Segmented label="Nitrogen measure" value={metric} onChange={setMetric} options={[{ value: 'input', label: 'Fertilizer' }, { value: 'removal', label: 'Removal' }, { value: 'balance', label: 'Balance' }]} /></div>
    {needs.length > 0 && <div className="mt-4 rounded-xl border border-wheat/40 bg-wheat-tint p-3 text-sm"><p className="font-semibold">Complete your crop inputs</p><p className="mt-1">The rotation is loaded. Add the missing values below to finish this comparison.</p><div className="mt-2 flex flex-wrap gap-2">{needs.map((id) => <button key={id} type="button" className="min-h-11 rounded-lg border border-line-strong bg-panel px-3 font-semibold text-sky-deep" onClick={() => {
      const group = document.getElementById(`crop-input-${id}`);
      const rateMissing = [...c.nitrogen, ...p.nitrogen].some((n) => n.needs.some((x) => x.crop === id && x.rate));
      group?.querySelectorAll('input')[metric === 'removal' || !rateMissing ? 1 : 0]?.focus();
    }}>Enter {cropName(id)} inputs</button>)}</div></div>}
    <ComparisonBars unit="lb N/ac" rows={p.nitrogen.map((n) => {
      const current = c.nitrogen.find((v) => v.year === n.year);
      return { label: String(n.year), current: current?.[metric] ?? null, proposed: n[metric], crops: [c.seasons.find((s) => s.year === n.year)?.crops.map(cropName).join(' → ') || 'Crop not entered', p.seasons.find((s) => s.year === n.year)?.crops.map(cropName).join(' → ') || 'Crop not entered'], missing: [missingFor(current, metric), missingFor(n, metric)] };
    })} />
    <div className="mt-4 grid gap-3 sm:grid-cols-2">{[c, p].map((side, i) => <div key={i} className="rounded-xl bg-paper p-3"><p className="text-xs text-ink-soft">{ECO_SERIES[i].label} · annual {title}</p>{side[key] === null ? <><p className="mt-1 font-semibold">Inputs needed</p><p className="mt-1 text-xs text-ink-soft">{side.nitrogen.filter((n) => n[metric] !== null).length} of {side.nitrogen.length} years calculated. Average requires every year.</p></> : <p className="mt-1 font-semibold tabular-nums">{fmt(side[key])} lb N/ac/year</p>}</div>)}</div>
    <details className="mt-4 text-sm text-ink-soft"><summary className="cursor-pointer font-semibold text-sky-deep">Calculation details and sources</summary>
      <p className="mt-2">Rates and expected yields come from your scenario entries or the labeled Finance assumptions, not from the boundary file. The same crop inputs apply to both rotations. Yields do not change automatically with weather.</p>
      <p className="mt-2">Balance excludes nitrogen fixation, soil mineralization, manure, deposition and losses. Negative balances, especially for legumes, do not directly indicate a fertilizer need.</p>
      {rice && <p className="mt-2">Rice yield uses cwt/ac (100 lb). Its grain coefficient is 0.57 lb N per 45-lb bushel, converted to approximately 1.267 lb N/cwt.</p>}
      <ul className="mt-2 space-y-2">{[c, p].map((side, i) => <li key={i}><strong>{ECO_SERIES[i].label} rates:</strong> {[...new Set(side.nitrogen.flatMap((n) => n.inputSources))].join('; ') || 'Enter crop rates.'}</li>)}</ul>
      <Source href={ECOLOGY_SOURCES.nitrogen}>Delaware grain coefficients</Source><span className="mx-2">·</span><Source href={ECOLOGY_SOURCES.rowCrops}>Arkansas rice and sorghum coefficients</Source>
    </details>
    <details className="mt-3 text-sm text-ink-soft"><summary className="cursor-pointer font-semibold text-sky-deep">Nitrogen-loss considerations</summary>
      <p className="mt-2">{rice ? 'Rice nitrogen losses depend on flooding, drainage and application timing. This comparison does not model rice water management or quantify nitrogen lost.' : `Current: ${c.leaching.toLowerCase()}. Proposed: ${p.leaching.toLowerCase()}. This is a qualitative screening, not pounds leached.`} {irrigated && 'Irrigation amount and timing have not been entered.'}</p>
      {!rice && <p className="mt-2">Wet conditions and sandy soils can increase drainage concerns. Normal or dry conditions do not rule out loss. {p.surplusYears.length > 0 && `Fertilizer exceeds modeled grain removal in ${p.surplusYears.join(', ')}; this is not a measured loss.`}</p>}
      <Source href={ECOLOGY_SOURCES.leaching}>Nitrogen loss pathways</Source>
    </details>
  </section>;
}
