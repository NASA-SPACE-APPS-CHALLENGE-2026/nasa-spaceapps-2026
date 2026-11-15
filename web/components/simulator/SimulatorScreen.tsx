'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { acresFromM2 } from '@/lib/domain/acreage';
import { CROP_CATALOG, DOUBLE_CROP_OPTIONS } from '@/lib/domain/crops';
import { activePlan } from '@/lib/domain/finance/farm';
import { buildParams, type CropScenarioInput, type SimulatorInputs, type WeatherScenario } from '@/lib/domain/finance/inputs';
import { nitrogenRate, type SeasonPlan, type Tillage } from '@/lib/domain/finance/budget';
import { currentPlanSeasons, firstPlanYear, proposedPlanSeasons, thisSeason } from '@/lib/domain/finance/plans';
import { assessEcology, ecologicalTradeoffs, expectedYield, YIELD_UNITS } from '@/lib/domain/ecology';
import { cropName } from '@/lib/domain/rotation/agronomy';
import { seasonLabel } from '@/lib/domain/rotation/strategies';
import { useFarm, useStore } from '@/lib/client/StoreProvider';
import { useActiveField } from '@/lib/client/useActiveField';
import { useRotation } from '@/lib/client/useRotation';
import { NumberField, SECTION, Segmented } from '../finance/ui';
import { FieldPicker, NoFieldsYet } from '../ui/FieldPicker';
import { EcologyCharts, ComparisonLegend, fmt } from './SimulatorCharts';

const SELECT = 'mt-1 block min-h-11 w-full min-w-0 rounded-[var(--radius-control)] border border-line-strong bg-panel px-3 text-base';
const BLUE = 'inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-sky px-4 py-2 text-sm font-semibold text-white hover:bg-sky-deep';

export function SimulatorScreen() {
  const store = useStore();
  const { plans, finance } = useFarm();
  const { field, fields, loaded, select } = useActiveField();
  const rotation = useRotation(field);
  const [advanced, setAdvanced] = useState(false);
  const saved = field ? activePlan(plans, field.id) : undefined;
  const sim = useMemo<SimulatorInputs>(() => field ? finance.simulator[field.id] ?? {} : {}, [field, finance]);
  const effective = useMemo<SimulatorInputs>(() => ({ ...sim, tillage: sim.tillage ?? (rotation?.answers.tillage && rotation.answers.tillage !== 'unsure' ? rotation.answers.tillage : 'conventional') }), [sim, rotation]);
  const update = (patch: Partial<SimulatorInputs>) => {
    if (!field) return;
    const latest = store.getSnapshot().finance;
    void store.saveFinance({ ...latest, simulator: { ...latest.simulator, [field.id]: { ...latest.simulator[field.id], ...patch } } });
  };
  const setCrop = (id: string, patch: Partial<CropScenarioInput>) => update({ cropInputs: { ...sim.cropInputs, [id]: { ...sim.cropInputs?.[id], ...patch } } });
  const params = useMemo(() => buildParams(finance, sim.overrides), [finance, sim.overrides]);
  const comparison = useMemo(() => {
    if (!field) return null;
    const start = firstPlanYear(field, sim.stage === 'pre-plant');
    const baseline = currentPlanSeasons(field, finance.horizon, start).map((s) => sim.currentCrops?.[s.year] ? { ...s, crops: sim.currentCrops[s.year].split('>') } : s);
    const proposed = saved ? proposedPlanSeasons(field, saved, finance.horizon, start) : [];
    const previous = thisSeason(field, start);
    const c = assessEcology(baseline, undefined, effective, params, rotation?.inputs, previous);
    const p = proposed.length ? assessEcology(proposed, saved, effective, params, rotation?.inputs, previous) : null;
    return { c, p, start, crops: [...new Set([...baseline, ...proposed].flatMap((s) => s.crops))].filter((id) => id !== 'fallow') };
  }, [field, sim, saved, finance.horizon, effective, params, rotation]);
  const tradeoffs = comparison?.p ? ecologicalTradeoffs(comparison.c, comparison.p) : null;
  const mappedAcres = field ? acresFromM2(field.areaM2) : 0;
  const acres = sim.acreageOverride && sim.acres && sim.acres > 0 ? sim.acres : mappedAcres;
  const irrigated = !!(field && finance.fields[field.id]?.irrigated);

  return <div className="h-full overflow-y-auto"><div className="mx-auto max-w-7xl space-y-5 px-4 py-6 lg:py-8">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-field">FieldShift / Decisions for healthier land</p><h1 className="mt-1 font-plate text-3xl">Scenario Simulator</h1><p className="mt-2 max-w-2xl text-ink-soft">Compare the environmental trade-offs of your current rotation and saved Planner strategy under the same conditions.</p></div>
      {field && <Link href={`/finance?field=${field.id}&scenario=1`} className={BLUE}>View Financial Impact</Link>}
    </header>
    {!loaded ? <p role="status">Loading your fields…</p> : !field || !comparison ? <NoFieldsYet what="The Scenario Simulator" /> : <>
      <FieldPicker fields={fields} field={field} onSelect={(id) => { setAdvanced(false); select(id); }} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
        <aside key={field.id} className="min-w-0 space-y-4" aria-label="Simulator inputs">
          <section className={SECTION}>
            <h2 className="font-plate text-xl">Your field and conditions</h2>
            <p className="mt-2 text-sm" data-testid="mapped-acres">Mapped field: <strong>{fmt(mappedAcres)} acres</strong>. {sim.acreageOverride ? `Scenario override: ${fmt(acres)} acres.` : 'Using mapped acreage.'}</p>
            {sim.acres !== undefined && !sim.acreageOverride && <p className="mt-2 text-sm text-wheat-deep">An older {fmt(sim.acres)}-acre scenario value is saved but inactive. Mapped acreage is used unless you enable an override.</p>}
            <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!sim.acreageOverride} onChange={(e) => update({ acreageOverride: e.target.checked, acres: e.target.checked ? mappedAcres : sim.acres })} />Use a temporary scenario acreage override</label>
            {sim.acreageOverride && <div className="mt-2"><NumberField label="Scenario field size" unit="acres" min={0.01} value={sim.acres} placeholder={mappedAcres} onCommit={(v) => update({ acres: v })} testId="sim-acres" hint="Does not edit your saved field. Per-acre ecological indicators do not scale with acreage." /></div>}
            <div className="mt-4 space-y-4">
              <label className="block text-sm font-semibold">Tillage<select className={SELECT} value={effective.tillage} onChange={(e) => update({ tillage: e.target.value as Tillage })}><option value="conventional">Conventional tillage</option><option value="reduced">Reduced tillage</option><option value="no-till">No-till</option></select></label>
              <div><p className="mb-1 text-sm font-semibold">Weather conditions</p><Segmented<WeatherScenario> label="Weather scenario" value={sim.scenario ?? 'normal'} onChange={(scenario) => update({ scenario })} options={[{ value: 'normal', label: 'Normal' }, { value: 'dry', label: 'Dry' }, { value: 'wet', label: 'Wet' }]} /><p className="mt-2 text-xs text-ink-soft">Hypothetical conditions for both rotations. Wet conditions inform nitrogen-loss concerns; dry conditions flag cover-crop water competition. No ecological yield forecast is assumed.</p></div>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={irrigated} onChange={(e) => { const f = store.getSnapshot().finance; void store.saveFinance({ ...f, fields: { ...f.fields, [field.id]: { ...f.fields[field.id], irrigated: e.target.checked } } }); }} className="h-5 w-5" />Irrigated (otherwise rain-fed)</label>
              <p className="text-xs text-ink-soft">Irrigation is shared with Finance. Water volume and irrigation efficiency are not modeled.</p>
            </div>
          </section>
          <section className={SECTION}>
            <h2 className="font-plate text-xl">The two rotations</h2>
            <p className="mt-2 text-sm font-semibold">Current rotation · editable</p><p className="text-xs text-ink-soft">Prefilled from crop history. Changes stay in this scenario.</p>
            <div className="mt-3 space-y-2" data-testid="sim-plan-current">{comparison.c.seasons.map((s) => <label key={s.year} className="flex items-center gap-2 text-sm font-semibold"><span className="w-10 shrink-0">{s.year}</span><select aria-label={`Current crop ${s.year}`} className={SELECT} value={s.crops.join('>')} onChange={(e) => update({ currentCrops: { ...sim.currentCrops, [s.year]: e.target.value } })}>
              {!s.crops.length && <option value="">Not entered</option>}
              {s.crops.length > 1 && !DOUBLE_CROP_OPTIONS.some((o) => `${o.first}>${o.second}` === s.crops.join('>')) && <option value={s.crops.join('>')}>{seasonLabel(s.crops)}</option>}
              {CROP_CATALOG.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}{DOUBLE_CROP_OPTIONS.map((o) => <option key={`${o.first}>${o.second}`} value={`${o.first}>${o.second}`}>{cropName(o.first)} → {cropName(o.second)}</option>)}
            </select></label>)}</div>
            {sim.currentCrops && <button className="mt-2 min-h-10 text-sm font-semibold text-sky-deep" onClick={() => update({ currentCrops: undefined })}>Reset to crop history</button>}
            <div className="mt-5 border-t border-line pt-4" data-testid="sim-plan-proposed"><h3 className="text-sm font-semibold text-field">Proposed Planner rotation · linked</h3>{saved && comparison.p ? <><p className="mt-1 text-xs text-ink-soft">{saved.name}</p><PlanRows seasons={comparison.p.seasons} /><p className="mt-2 text-xs text-ink-soft">Years beyond the saved schedule repeat its crop pattern and use estimated dates.</p></> : <p className="mt-2 text-sm text-ink-soft">Save a plan in Rotation Explorer or Planner to compare. An unsaved recommendation is not treated as your plan.</p>}<Link href={`/planner?field=${field.id}${saved ? `&plan=${saved.id}` : ''}`} className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-sky-deep">Edit proposed rotation in Planner →</Link></div>
          </section>
          <section className={SECTION} aria-labelledby="crop-inputs-h"><h2 id="crop-inputs-h" className="font-plate text-xl">Nitrogen and expected yields</h2><p className="mt-2 text-sm text-ink-soft">Rates apply only when that crop occurs, equally in both rotations. Yields are expected harvests, not recorded results. Blank inputs use the stated reference where available.</p>
            <div className="mt-4 space-y-5">{comparison.crops.map((id) => {
              const yieldInfo = expectedYield(id, sim, params);
              const rate = nitrogenRate(id, undefined, sim, params);
              return <div key={id} className="border-t border-line pt-3"><h3 className="mb-2 font-semibold">{cropName(id)}</h3>
                <NumberField label={`${cropName(id)} nitrogen`} unit="lb N/ac/year" min={0} value={sim.cropInputs?.[id]?.nitrogen ?? (id === 'corn' ? sim.nRateCorn : undefined)} placeholder={rate ?? 'Required'} onCommit={(nitrogen) => setCrop(id, { nitrogen })} hint={id === 'corn' ? 'Reference varies after corn or a legume cover; your entered rate is the total application, with no further credit subtracted.' : rate === undefined ? 'No supported reference rate; enter your application.' : `Reference: ${fmt(rate)} lb N/ac per crop year (Finance budget assumption).`} />
                {YIELD_UNITS[id] ? <div className="mt-3"><NumberField label={`${cropName(id)} expected yield`} unit={YIELD_UNITS[id]} min={0} value={sim.cropInputs?.[id]?.yield} placeholder={yieldInfo.value ?? 'Required'} onCommit={(value) => setCrop(id, { yield: value })} hint={`${yieldInfo.source}${yieldInfo.value === undefined ? '' : `: ${fmt(yieldInfo.value)} ${YIELD_UNITS[id]}`}.`} />{yieldInfo.value !== undefined && yieldInfo.value < 10 && <p className="mt-1 text-xs text-wheat-deep">Low saved yield: verify this assumption. It has not been silently replaced.</p>}</div> : <p className="mt-2 text-xs text-ink-soft">No reviewed production-unit/removal model for this crop. Yield-based nitrogen removal is unavailable.</p>}
                {sim.cropInputs?.[id] && <button className="mt-1 min-h-9 text-xs font-semibold text-sky-deep" onClick={() => setCrop(id, { nitrogen: undefined, yield: undefined })}>Use reference assumptions for {cropName(id)}</button>}
              </div>;
            })}</div>
          </section>
          <button type="button" className={`${BLUE} w-full`} aria-expanded={advanced} aria-controls="advanced-metrics" onClick={() => setAdvanced(!advanced)}>{advanced ? 'Hide Advanced Metrics' : 'Show Advanced Metrics'}</button>
          {advanced && <section id="advanced-metrics" className={SECTION}><h2 className="font-plate text-xl">Management and methods</h2><div className="mt-3 space-y-4">
            <label className="block text-sm font-semibold">Residue after harvest<select className={SELECT} value={sim.residue ?? 'unknown'} onChange={(e) => update({ residue: e.target.value as SimulatorInputs['residue'] })}><option value="unknown">Unknown coverage</option><option value="retained">Retained (coverage not measured)</option><option value="removed">Removed / potentially bare</option></select></label>
            <label className="block text-sm font-semibold">Current crop stage<select className={SELECT} value={sim.stage ?? 'harvested'} onChange={(e) => update({ stage: e.target.value as SimulatorInputs['stage'] })}><option value="pre-plant">Not planted · start this season</option><option value="growing">Growing · start next season</option><option value="harvested">Harvested · start next season</option></select></label>
            <div><p className="mb-1 text-sm font-semibold">Comparison horizon (shared with Finance)</p><Segmented<3 | 5> label="Comparison years" value={finance.horizon} onChange={(horizon) => void store.saveFinance({ ...store.getSnapshot().finance, horizon })} options={[{ value: 3, label: '3 years' }, { value: 5, label: '5 years' }]} /></div>
            <dl className="space-y-2 text-sm"><div><dt className="font-semibold">Soil organic matter baseline</dt><dd>{rotation?.inputs.organicMatter ? `${rotation.inputs.organicMatter.display} · ${rotation.inputs.organicMatter.provider}` : 'Unavailable: add a soil test in Rotation Explorer'}</dd></div><div><dt className="font-semibold">Soil / drainage</dt><dd>{rotation?.inputs.texture?.display ?? 'Texture unavailable'} · {rotation?.inputs.drainage?.display ?? 'Drainage unavailable'}</dd></div><div><dt className="font-semibold">Slope</dt><dd>{rotation?.inputs.slopePct?.display ?? 'Unavailable'}</dd></div></dl>
            <p className="text-xs text-ink-soft">Soil survey values describe mapped soil, not a new sample. No conversion between soil organic matter and organic carbon is applied. Cover dates are edited in Planner. Nitrogen credits follow Finance’s existing corn-after-legume-cover reference rule only when you have not entered an application rate.</p>
            {sim.overrides && <><p className="text-xs text-wheat-deep">Legacy scenario yield/price overrides are active: {Object.entries(sim.overrides).map(([k, v]) => `${k}: ${v}`).join(', ')}. Check these against your records.</p><button className="min-h-10 text-sm font-semibold text-sky-deep" onClick={() => update({ overrides: undefined })}>Use Finance yield and price references</button></>}
          </div></section>}
          <p className="px-1 text-xs text-ink-faint">Changes save automatically for {field.name}. Planner and field records remain linked.</p>
        </aside>
        <main className="min-w-0 space-y-5">
          {comparison.p && tradeoffs ? <>
            <section className="rounded-[var(--radius-panel)] border border-field/20 bg-field-tint p-5"><p className="text-xs font-semibold uppercase tracking-widest text-field">Environmental comparison / {comparison.start}–{comparison.start + finance.horizon - 1}</p><h2 className="mt-2 font-plate text-2xl">What changes for your land?</h2><div className="mt-3"><ComparisonLegend /></div><div className="mt-4 grid gap-3 sm:grid-cols-3">{[{ label: 'Planned living cover', value: `${fmt(comparison.p.livingDays)} days/yr`, sub: `Current ${fmt(comparison.c.livingDays)}` }, { label: 'Fertilizer nitrogen', value: `${fmt(comparison.p.fertilizer)} lb/ac/yr`, sub: `Current ${fmt(comparison.c.fertilizer)}` }, { label: 'Cash-crop variety', value: `${comparison.p.diversity.crops} types`, sub: `Current ${comparison.c.diversity.crops}` }].map((m) => <div key={m.label} className="rounded-xl bg-panel p-3"><p className="text-xs text-ink-soft">{m.label}</p><p className="mt-1 font-plate text-xl">{m.value}</p><p className="mt-1 text-xs text-ink-soft">{m.sub}</p></div>)}</div><p className="mt-3 text-xs text-ink-soft">Proposed rotation values. Planning estimates and qualitative indicators; not measured environmental outcomes.</p></section>
            <EcologyCharts current={comparison.c} proposed={comparison.p} irrigated={irrigated} />
            <section className={SECTION}><h2 className="font-plate text-xl">Benefits and trade-offs</h2><div className="mt-3 grid gap-4 sm:grid-cols-2"><div><h3 className="font-semibold text-field">Potential benefits</h3><ul className="mt-2 list-disc space-y-2 pl-4 text-sm" data-testid="sim-pros">{tradeoffs.pros.map((t) => <li key={t}>{t}</li>)}</ul></div><div><h3 className="font-semibold text-wheat-deep">Considerations</h3><ul className="mt-2 list-disc space-y-2 pl-4 text-sm" data-testid="sim-cons">{tradeoffs.cons.map((t) => <li key={t}>{t}</li>)}</ul></div></div></section>
          </> : <section className={SECTION}><h2 className="font-plate text-2xl">Your next step: save a proposed plan</h2><p className="mt-2 text-ink-soft">Your current rotation and scenario inputs are ready. Choose a strategy and save it in Planner to unlock the five ecological comparisons.</p><Link href={`/rotation?field=${field.id}`} className={`${BLUE} mt-4`}>Open Rotation Explorer</Link></section>}
        </main>
      </div>
    </>}
  </div></div>;
}
function PlanRows({ seasons }: { seasons: SeasonPlan[] }) { return <ol className="mt-3 space-y-2 text-sm">{seasons.map((s) => <li key={s.year} className="flex gap-3"><strong>{s.year}</strong><span>{s.crops.length ? seasonLabel(s.crops) : 'Crop not entered'}{s.cover && <span className="text-field"> + {s.cover.name}</span>}</span></li>)}</ol>; }
