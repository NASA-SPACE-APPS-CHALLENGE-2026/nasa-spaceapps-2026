'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo } from 'react';
import { activePlan } from '@/lib/domain/finance/farm';
import type { FinanceInputs, SimulatorInputs, WeatherScenario } from '@/lib/domain/finance/inputs';
import { SCENARIO_TEXT, simulate, type SimSide } from '@/lib/domain/finance/simulate';
import { acresFromM2, interiorPoint } from '@/lib/domain/acreage';
import { planFromStrategy } from '@/lib/domain/plan';
import { cropName } from '@/lib/domain/rotation/agronomy';
import { seasonLabel } from '@/lib/domain/rotation/strategies';
import type { Plan } from '@/lib/domain/types';
import type { Tillage } from '@/lib/domain/finance/budget';
import { useFarm, useStore } from '@/lib/client/StoreProvider';
import { useActiveField } from '@/lib/client/useActiveField';
import { useRotation } from '@/lib/client/useRotation';
import { Legend, money, PairColumns, PairLines, SERIES } from '../finance/charts';
import { NumberField, SECTION, Segmented } from '../finance/ui';
import { FieldPicker, NoFieldsYet } from '../ui/FieldPicker';

const CROP_CHOICES = ['corn', 'soybeans', 'oats', 'winter-wheat', 'fallow'];
const SELECT = 'mt-1 block min-h-11 w-full rounded-parcel border border-line-strong bg-panel px-3 text-[16px]';

export function SimulatorScreen() {
  const store = useStore();
  const { plans, finance } = useFarm();
  const { field, fields, loaded, select } = useActiveField();
  const rotation = useRotation(field);

  useEffect(() => {
    if (field) store.ensureLookups(field.id);
  }, [field?.id, store]); // eslint-disable-line react-hooks/exhaustive-deps

  // Plan B: the field's Planner plan, or (not saved) the best-fit strategy from Rotation Explorer.
  const saved = field ? activePlan(plans, field.id) : undefined;
  const suggested = useMemo<{ plan: Plan; saved: boolean } | null>(() => {
    if (!field) return null;
    if (saved) return { plan: saved, saved: true };
    const best = rotation?.result.strategies.find((s) => s.strategy.id === rotation.result.bestFit);
    return best && rotation ? { plan: planFromStrategy(best.strategy, field, rotation.answers), saved: false } : null;
  }, [field, saved, rotation]);

  const sim = useMemo<SimulatorInputs>(() => (field && finance.simulator[field.id]) || {}, [field, finance]);
  const answersTillage = rotation?.answers.tillage;
  const effectiveSim = useMemo<SimulatorInputs>(() => ({ ...sim, tillage: sim.tillage ?? (answersTillage && answersTillage !== 'unsure' ? answersTillage : 'conventional') }), [sim, answersTillage]);
  const update = (patch: Partial<SimulatorInputs>) => field && void store.saveFinance({ ...finance, simulator: { ...finance.simulator, [field.id]: { ...sim, ...patch } } });
  const setOverride = (id: string, v: number | undefined) => {
    const overrides = { ...(sim.overrides ?? {}) };
    if (v === undefined) delete overrides[id];
    else overrides[id] = v;
    update({ overrides });
  };

  const run = useMemo(() => {
    if (!field) return null;
    return simulate(field, suggested?.plan, finance, effectiveSim, { lat: interiorPoint(field.feature.geometry)[1], slopePct: rotation?.inputs.slopePct?.value });
  }, [field, suggested, finance, effectiveSim, rotation]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 lg:py-8">
        <header>
          <h1 className="font-plate text-3xl">Scenario Simulator</h1>
          <p className="mt-1 max-w-3xl text-[16px] text-ink-soft">Your suggested plan is filled in automatically. Compare it with what you do now, change the numbers, and see the trade-offs.</p>
        </header>
        {!loaded ? (
          <p role="status">Loading your fields…</p>
        ) : !field || !run ? (
          <NoFieldsYet what="The Scenario Simulator" />
        ) : (
          <>
            <FieldPicker fields={fields} field={field} onSelect={select} />
            <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
              <aside className="space-y-4" aria-label="Simulator inputs">
                <section className={SECTION} aria-labelledby="plans-h">
                  <h2 id="plans-h" className="font-plate text-xl">
                    The two plans
                  </h2>
                  <PlanSummary title={SERIES.proposed.label} color={SERIES.proposed.color} side={run.result.proposed} note={suggested ? (suggested.saved ? `From your Planner: ${suggested.plan.name}` : 'Best-fit strategy from Rotation Explorer (not saved as a plan yet)') : 'No plan yet: same as what you do now'} />
                  {suggested && !suggested.saved && (
                    <Link href={`/rotation?field=${field.id}`} className="mt-1 inline-flex min-h-10 items-center text-[14.5px] font-semibold text-field hover:underline">
                      Open Rotation Explorer
                    </Link>
                  )}
                  <div className="mt-4">
                    <PlanASeasons side={run.result.current} sim={sim} onChange={(year, crop) => update({ currentCrops: { ...(sim.currentCrops ?? {}), [String(year)]: crop } })} onReset={() => update({ currentCrops: undefined })} />
                  </div>
                </section>
                <SimInputs field={{ acresDefault: Math.round(acresFromM2(field.areaM2) * 10) / 10 }} sim={effectiveSim} finance={finance} fieldId={field.id} onUpdate={update} onOverride={setOverride} onFinance={(f) => void store.saveFinance(f)} />
              </aside>
              <Results run={run.result} years={finance.horizon} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PlanSummary({ title, color, side, note }: { title: string; color: string; side: SimSide; note: string }) {
  return (
    <div data-testid="sim-plan-proposed">
      <p className="flex items-center gap-2 text-[15.5px] font-semibold">
        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} aria-hidden />
        {title}
      </p>
      <p className="text-[13.5px] text-ink-soft">{note}</p>
      <ol className="mt-2 space-y-1 text-[14.5px]">
        {side.seasons.map((s) => (
          <li key={s.year} className="flex gap-2">
            <span className="w-11 shrink-0 font-semibold tabular-nums">{s.year}</span>
            <span>
              {s.crops.length ? seasonLabel(s.crops) : 'No crop'}
              {s.cover && <span className="text-[#1f6f60]"> + {s.cover.name}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PlanASeasons({ side, sim, onChange, onReset }: { side: SimSide; sim: SimulatorInputs; onChange: (year: number, crop: string) => void; onReset: () => void }) {
  return (
    <div data-testid="sim-plan-current">
      <p className="flex items-center gap-2 text-[15.5px] font-semibold">
        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: SERIES.current.color }} aria-hidden />
        {SERIES.current.label}
      </p>
      <p className="text-[13.5px] text-ink-soft">Read from your past crops. Change any year to match how you farm.</p>
      <ol className="mt-2 space-y-2">
        {side.seasons.map((s) => (
          <li key={s.year}>
            <CropSelect year={s.year} value={s.crops.length === 1 ? s.crops[0] : s.crops.join('>')} onChange={(c) => onChange(s.year, c)} />
          </li>
        ))}
      </ol>
      {sim.currentCrops && Object.keys(sim.currentCrops).length > 0 && (
        <button type="button" onClick={onReset} className="mt-2 min-h-10 text-[14px] font-semibold text-field hover:underline">
          Reset to my crop history
        </button>
      )}
    </div>
  );
}

function CropSelect({ year, value, onChange }: { year: number; value: string; onChange: (c: string) => void }) {
  const id = useId();
  const options = CROP_CHOICES.includes(value) || !value ? CROP_CHOICES : [value, ...CROP_CHOICES];
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="w-11 shrink-0 text-[14.5px] font-semibold tabular-nums">
        {year}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-11 w-full rounded-parcel border border-line-strong bg-panel px-3 text-[15px]">
        {!value && <option value="">No crop</option>}
        {options.map((c) => (
          <option key={c} value={c}>
            {c.includes('>') ? seasonLabel(c.split('>')) : cropName(c)}
          </option>
        ))}
      </select>
    </div>
  );
}

function SimInputs({ field, sim, finance, fieldId, onUpdate, onOverride, onFinance }: { field: { acresDefault: number }; sim: SimulatorInputs; finance: FinanceInputs; fieldId: string; onUpdate: (p: Partial<SimulatorInputs>) => void; onOverride: (id: string, v: number | undefined) => void; onFinance: (f: FinanceInputs) => void }) {
  const stageId = useId();
  const tillId = useId();
  const o = sim.overrides ?? {};
  const irrigated = !!finance.fields[fieldId]?.irrigated;
  return (
    <section className={SECTION} aria-labelledby="sim-inputs-h">
      <h2 id="sim-inputs-h" className="font-plate text-xl">
        Your numbers
      </h2>
      <div className="mt-3 space-y-4">
        <NumberField label="Field size" unit="acres" min={0} value={sim.acres} placeholder={finance.fields[fieldId]?.acres ?? field.acresDefault} onCommit={(v) => onUpdate({ acres: v })} testId="sim-acres" />
        <div>
          <label htmlFor={stageId} className="block text-[14.5px] font-semibold">
            Where this year’s crop is
          </label>
          <select id={stageId} value={sim.stage ?? 'harvested'} onChange={(e) => onUpdate({ stage: e.target.value as SimulatorInputs['stage'] })} className={SELECT}>
            <option value="pre-plant">Not planted yet (the plan can start this season)</option>
            <option value="growing">Growing (changes start next season)</option>
            <option value="harvested">Harvested (changes start next season)</option>
          </select>
        </div>
        <div>
          <label htmlFor={tillId} className="block text-[14.5px] font-semibold">
            Tillage
          </label>
          <select id={tillId} value={sim.tillage ?? 'conventional'} onChange={(e) => onUpdate({ tillage: e.target.value as Tillage })} className={SELECT}>
            <option value="conventional">Conventional (chisel, disk)</option>
            <option value="reduced">Reduced / strip-till</option>
            <option value="no-till">No-till</option>
          </select>
        </div>
        <NumberField label="Nitrogen rate for corn" unit="lb N/ac" min={0} value={sim.nRateCorn} placeholder="ISU rate (159 after soybeans)" onCommit={(v) => onUpdate({ nRateCorn: v })} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Corn yield" unit="bu/ac" min={0} value={o['corn.yield']} placeholder={211} onCommit={(v) => onOverride('corn.yield', v)} />
          <NumberField label="Corn price" unit="$/bu" min={0} value={o['corn.price']} placeholder={4.6} onCommit={(v) => onOverride('corn.price', v)} />
          <NumberField label="Soybean yield" unit="bu/ac" min={0} value={o['soybeans.yield']} placeholder={61} onCommit={(v) => onOverride('soybeans.yield', v)} />
          <NumberField label="Soybean price" unit="$/bu" min={0} value={o['soybeans.price']} placeholder={12.1} onCommit={(v) => onOverride('soybeans.price', v)} />
        </div>
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" checked={irrigated} onChange={(e) => onFinance({ ...finance, fields: { ...finance.fields, [fieldId]: { ...finance.fields[fieldId], irrigated: e.target.checked } } })} className="h-5 w-5 accent-[var(--color-field)]" />
          Irrigated
        </label>
        <div>
          <p className="text-[14.5px] font-semibold">Weather</p>
          <div className="mt-1">
            <Segmented<WeatherScenario> label="Weather scenario" value={sim.scenario ?? 'normal'} onChange={(s) => onUpdate({ scenario: s })} options={[{ value: 'normal', label: 'Normal' }, { value: 'dry', label: 'Dry' }, { value: 'wet', label: 'Wet' }]} />
          </div>
          <p className="mt-1 text-[13.5px] text-ink-soft">{SCENARIO_TEXT[sim.scenario ?? 'normal']}.</p>
        </div>
      </div>
    </section>
  );
}

function Results({ run, years }: { run: ReturnType<typeof simulate>['result']; years: number }) {
  const c = run.current;
  const p = run.proposed;
  const cols = p.years.map((y, i) => ({ label: String(y.year), proposed: run.acres ? y.net / run.acres : 0, current: run.acres && c.years[i] ? c.years[i].net / run.acres : 0 }));
  const cum = run.cash.points.map((pt) => ({ label: pt.label, proposed: pt.proposed.cumulative, current: pt.current.cumulative }));
  const be = run.cash.breakEven;
  const rows: Array<[string, string, string]> = [
    ['Net return per acre, per year', money(p.netPerAcre), money(c.netPerAcre)],
    [`Profit on this field, ${years} years`, money(p.totalProfit), money(c.totalProfit)],
    ['Months of soil cover per year', `${p.coverMonths}`, `${c.coverMonths}`],
    ['Nitrogen fertilizer per acre, per year', `${Math.round(p.nLbsPerAcre)} lb (${money(p.nDollarsPerAcre)})`, `${Math.round(c.nLbsPerAcre)} lb (${money(c.nDollarsPerAcre)})`],
    ['Erosion risk (relative)', p.erosion, c.erosion],
    ['Cost share', money(p.costShare), money(c.costShare)],
  ];
  return (
    <div className="space-y-5" data-testid="sim-results">
      <section className={SECTION} aria-labelledby="pc-h">
        <h2 id="pc-h" className="font-plate text-xl">
          Pros and cons of the PlotTwist plan
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-[15px] font-semibold text-field">Pros</h3>
            <ul className="mt-2 space-y-2 text-[15px]" data-testid="sim-pros">
              {run.pros.map((t) => (
                <li key={t} className="flex gap-2">
                  <span aria-hidden className="mt-0.5 font-bold text-field">+</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-alert">Cons</h3>
            <ul className="mt-2 space-y-2 text-[15px]" data-testid="sim-cons">
              {run.cons.length ? (
                run.cons.map((t) => (
                  <li key={t} className="flex gap-2">
                    <span aria-hidden className="mt-0.5 font-bold text-alert">−</span>
                    {t}
                  </li>
                ))
              ) : (
                <li className="text-ink-soft">None found with these numbers.</li>
              )}
            </ul>
          </div>
        </div>
      </section>

      <section className={SECTION} aria-labelledby="cmp-h">
        <h2 id="cmp-h" className="font-plate text-xl">
          Side by side
        </h2>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[480px] text-[14.5px] tabular-nums">
            <thead>
              <tr className="text-left text-ink-soft">
                <th scope="col" className="py-2 pr-2 font-semibold">
                  <span className="sr-only">Measure</span>
                </th>
                <th scope="col" className="px-2 text-right font-semibold">{SERIES.proposed.label}</th>
                <th scope="col" className="pl-2 text-right font-semibold">{SERIES.current.label}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, a, b]) => (
                <tr key={k} className="border-t border-line">
                  <th scope="row" className="py-2 pr-2 text-left font-normal">{k}</th>
                  <td className="px-2 text-right font-semibold">{a}</td>
                  <td className="pl-2 text-right">{b}</td>
                </tr>
              ))}
              <tr className="border-t border-line align-top">
                <th scope="row" className="py-2 pr-2 text-left font-normal">Expected yields</th>
                <td className="px-2 text-right">{p.yields.map((y) => `${y.crop} ${y.bu}`).join(', ') || '–'}</td>
                <td className="pl-2 text-right">{c.yields.map((y) => `${y.crop} ${y.bu}`).join(', ') || '–'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className={SECTION} aria-labelledby="simchart-h">
        <h2 id="simchart-h" className="font-plate text-xl">
          Net return per acre, year by year
        </h2>
        <div className="mt-2">
          <Legend />
        </div>
        <PairColumns data={cols} title="Net return per acre by year" />
        <h3 className="mt-5 text-[15px] font-semibold">Cumulative profit on this field</h3>
        <p className="text-[14px] text-ink-soft">{be === 'start' ? 'The plan is never behind what you do now.' : be ? `The plan catches up by ${be.label}${run.cash.deepestDip < -0.5 ? `, after being behind by up to ${money(run.cash.deepestDip)}` : ''}.` : `The plan does not catch up within ${years} years.`}</p>
        <PairLines data={cum} title="Cumulative profit by season" marker={be && be !== 'start' ? be.label : undefined} />
        <Link href="/finance" className="mt-3 inline-flex min-h-11 items-center font-semibold text-field hover:underline">
          See the whole farm in Finance
        </Link>
      </section>
    </div>
  );
}
