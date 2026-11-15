'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { acresFromM2, formatAcres } from '@/lib/domain/acreage';
import { newId } from '@/lib/domain/field';
import {
  breakEvenPriceChangePct,
  emptyFinancialProfile,
  FINANCIAL_COST_CATEGORIES,
  FINANCIAL_YIELD_UNITS,
  financialProfileSchema,
  partialBudget,
  projectFinancials,
  type CropFinancialAssumptions,
  type FinancialAdjustments,
  type FinancialProfile,
  type FinancialProjection,
  type FinancialSeason,
} from '@/lib/domain/finance';
import { cropLabel } from '@/lib/domain/crops';
import { cropIdsOf, cropName } from '@/lib/domain/rotation/agronomy';
import type { Strategy } from '@/lib/domain/rotation/strategies';
import type { Plan, SavedScenario } from '@/lib/domain/types';
import { planFromStrategy } from '@/lib/domain/plan';
import { useFarm, useStore } from '@/lib/client/StoreProvider';
import { useActiveField } from '@/lib/client/useActiveField';
import { useRotation } from '@/lib/client/useRotation';
import { Button } from '@/components/ui/Button';
import { FieldPicker, NoFieldsYet } from '@/components/ui/FieldPicker';
import { TextField } from '@/components/ui/TextField';
import { AnnualNetChart, CumulativeNetChart, ExpenseBreakdown, RevenueCostChart } from './FinanceCharts';

const PANEL = 'rounded-[var(--radius-panel)] border border-line bg-panel p-4 lg:p-5';
const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const PERCENT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, signDisplay: 'always' });

type Proposal =
  | { key: string; kind: 'strategy'; id: string; label: string; strategy: Strategy }
  | { key: string; kind: 'plan'; id: string; label: string; plan: Plan };

type SensitivityPreset = 'baseline' | 'favorable' | 'adverse' | 'custom';

function selectClass() {
  return 'mt-1 block min-h-12 w-full rounded-[var(--radius-control)] border border-line-strong bg-panel px-3 text-[15px]';
}

function finiteInput(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function money(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : MONEY.format(value);
}

function percentage(value: number | undefined): string {
  return value === undefined ? '—' : `${PERCENT.format(value)}%`;
}

function strategySchedule(strategy: Strategy, horizon: number): FinancialSeason[] {
  const original = strategy.seasons;
  if (!original.length) return [];
  return Array.from({ length: horizon }, (_, index) => {
    const source = original[index % original.length];
    return {
      year: original[0].year + index,
      cropIds: source.ids.filter((id) => id !== 'fallow'),
      hasCover: !!source.cover,
      ...(index >= original.length ? { repeated: true } : {}),
    };
  });
}

function plannerSchedule(plan: Plan): FinancialSeason[] {
  return plan.seasons.map((season) => {
    const cropIds = cropIdsOf(season.crop);
    return {
      year: season.year,
      cropIds: cropIds ?? [],
      hasCover: !!season.cover || season.tasks.some((task) => task.kind === 'cover-plant'),
      ...(cropIds ? {} : { unknownCropLabels: [season.crop ? cropLabel(season.crop) : 'Cash crop not selected'] }),
    };
  });
}

function defaultCropAssumptions(): CropFinancialAssumptions {
  return { costMode: 'total', costsPerAcre: {} };
}

function getStrategySeasons(strategy: Strategy, horizon: 3 | 5): FinancialSeason[] {
  return strategySchedule(strategy, horizon);
}

function RangeAdjustment({ label, value, onChange, hint }: { label: string; value: number; onChange: (value: number) => void; hint: string }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-3 text-sm font-medium">
        <span>{label}</span>
        <span className="rounded-full bg-field-tint px-2.5 py-1 text-[13px] tabular-nums">{percentage(value)}</span>
      </span>
      <input
        aria-label={label}
        type="range"
        min="-50"
        max="50"
        step="1"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="mt-2 w-full accent-field"
      />
      <span className="mt-1 block text-[12px] text-ink-faint">{hint}</span>
    </label>
  );
}

function NumberInput({ label, value, onChange, step = 'any', hint, prefix }: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  step?: string;
  hint?: string;
  prefix?: string;
}) {
  return (
    <div className="relative min-w-0">
      <TextField
        label={label}
        type="number"
        min="0"
        step={step}
        inputMode="decimal"
        value={value ?? ''}
        onChange={(event) => onChange(finiteInput(event.currentTarget.value))}
        hint={hint}
        className="min-w-0"
        inputClassName={prefix ? 'pl-8' : ''}
      />
      {prefix && <span aria-hidden className="pointer-events-none absolute left-3 top-[41px] text-sm text-ink-faint">{prefix}</span>}
    </div>
  );
}

function MetricCard({ title, value, note, accent = false }: { title: string; value: string; note: string; accent?: boolean }) {
  return (
    <article className={`${PANEL} min-h-32 ${accent ? 'border-field/35 bg-field-tint/45' : ''}`}>
      <p className="text-[13px] font-semibold text-ink-soft">{title}</p>
      <p className="mt-2 font-plate text-2xl tabular-nums text-ink">{value}</p>
      <p className="mt-1 text-[12px] leading-5 text-ink-faint">{note}</p>
    </article>
  );
}

function CropInputCard({ cropId, profile, environmentalImpact, hasEnvironmentalScenario, onCropChange, onEnvironmentalImpact }: {
  cropId: string;
  profile: CropFinancialAssumptions;
  environmentalImpact: number;
  hasEnvironmentalScenario: boolean;
  onCropChange: (patch: Partial<CropFinancialAssumptions>) => void;
  onEnvironmentalImpact: (value: number) => void;
}) {
  const cropNameText = cropName(cropId);
  return (
    <details className={`${PANEL} group`} open>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
        <span>
          <span className="block font-plate text-lg">{cropNameText}</span>
          <span className="mt-0.5 block text-[13px] text-ink-faint">Your crop-specific production assumptions</span>
        </span>
        <span aria-hidden className="rounded-full bg-field-tint px-3 py-1 text-sm font-semibold text-field">Edit</span>
      </summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <NumberInput
          label="Expected yield per acre"
          value={profile.yieldPerAcre}
          onChange={(yieldPerAcre) => onCropChange({ yieldPerAcre })}
          hint="Use your own typical or planned yield."
        />
        <div>
          <label className="block text-[15px] font-semibold" htmlFor={`unit-${cropId}`}>Yield unit</label>
          <select
            id={`unit-${cropId}`}
            value={profile.yieldUnit ?? ''}
            onChange={(event) => onCropChange({ yieldUnit: (event.currentTarget.value || undefined) as CropFinancialAssumptions['yieldUnit'] })}
            className={selectClass()}
          >
            <option value="">Choose a unit</option>
            {FINANCIAL_YIELD_UNITS.map((unit) => <option key={unit} value={unit}>{unit === 'cwt' ? 'hundredweight (cwt)' : unit === 'other' ? 'Other (name it)' : unit}</option>)}
          </select>
        </div>
        {profile.yieldUnit === 'other' && (
          <TextField
            label="Name the yield unit"
            value={profile.yieldUnitLabel ?? ''}
            onChange={(event) => onCropChange({ yieldUnitLabel: event.currentTarget.value || undefined })}
            hint="Use this same unit for yield and sale price."
          />
        )}
        <NumberInput
          label={`Expected sale price per ${profile.yieldUnit === 'other' ? profile.yieldUnitLabel || 'unit' : profile.yieldUnit ?? 'unit'}`}
          value={profile.pricePerUnit}
          onChange={(pricePerUnit) => onCropChange({ pricePerUnit })}
          prefix="$"
          hint="Use the same unit as yield."
        />
        <div>
          <label className="block text-[15px] font-semibold" htmlFor={`cost-mode-${cropId}`}>Production cost entry</label>
          <select
            id={`cost-mode-${cropId}`}
            value={profile.costMode}
            onChange={(event) => onCropChange({ costMode: event.currentTarget.value as CropFinancialAssumptions['costMode'] })}
            className={selectClass()}
          >
            <option value="total">One total per acre</option>
            <option value="detailed">Itemized costs per acre</option>
          </select>
        </div>
      </div>
      {profile.costMode === 'total' ? (
        <div className="mt-3 max-w-sm">
          <NumberInput
            label="Total operating costs per acre"
            value={profile.totalOperatingCostPerAcre}
            onChange={(totalOperatingCostPerAcre) => onCropChange({ totalOperatingCostPerAcre })}
            prefix="$"
            hint="Exclude land rent, cover crops, and one-time transition costs entered separately."
          />
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-field-tint/40 p-3">
          <p className="mb-3 text-[13px] text-ink-soft">Enter every category, using 0 where it does not apply. This keeps missing costs from being treated as free.</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {FINANCIAL_COST_CATEGORIES.map(({ id, label }) => (
              <NumberInput
                key={id}
                label={`${label} per acre`}
                value={profile.costsPerAcre[id]}
                onChange={(value) => onCropChange({ costsPerAcre: { ...profile.costsPerAcre, [id]: value } })}
                prefix="$"
              />
            ))}
          </div>
        </div>
      )}
      {hasEnvironmentalScenario && (
        <div className="mt-4 max-w-sm rounded-xl border border-sky/20 bg-sky-tint/45 p-3">
          <RangeAdjustment
            label={`${cropNameText} yield effect in this weather scenario`}
            value={environmentalImpact}
            onChange={onEnvironmentalImpact}
            hint="Your own what-if assumption. Rainfall and temperature do not automatically predict crop yield."
          />
        </div>
      )}
    </details>
  );
}

function ScenarioCard({ scenario }: { scenario: SavedScenario }) {
  const rain = scenario.config.rainfallPct;
  const temperature = scenario.config.temperatureDeltaC;
  return (
    <div className="mt-3 rounded-xl bg-sky-tint/50 p-3 text-[13px] leading-5 text-ink-soft">
      <p className="font-semibold text-ink">Weather context only · {scenario.name}</p>
      <p className="mt-1">Rainfall shift: {percentage(rain)} · Temperature shift: {temperature > 0 ? '+' : ''}{temperature}°C from the selected baseline.</p>
      <p className="mt-1 text-ink-faint">These simulator settings do not change crop yields or financial results unless you enter a crop-specific yield effect below.</p>
    </div>
  );
}

function MissingInputs({ projection }: { projection: FinancialProjection }) {
  if (projection.complete) return null;
  const missing = projection.missingInputs.slice(0, 7);
  return (
    <div className="mt-4 rounded-xl border border-line bg-field-tint/40 p-3">
      <p className="text-sm font-semibold text-ink">What is still needed for a complete estimate</p>
      <ul className="mt-2 list-inside list-disc space-y-1 text-[13px] text-ink-soft">
        {missing.map((item) => <li key={item}>{item}</li>)}
        {projection.missingInputs.length > missing.length && <li>{projection.missingInputs.length - missing.length} more missing inputs</li>}
      </ul>
    </div>
  );
}

function StrategyComparison({ strategies, selectedKey, bestFit, current, onSelect }: {
  strategies: Array<{ key: string; label: string; projection: FinancialProjection }>;
  selectedKey: string;
  bestFit: string;
  current: FinancialProjection;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {strategies.map((item) => {
        const change = current.cumulativeNetReturn !== null && item.projection.cumulativeNetReturn !== null
          ? item.projection.cumulativeNetReturn - current.cumulativeNetReturn
          : null;
        const selected = selectedKey === item.key;
        return (
          <button
            type="button"
            key={item.key}
            onClick={() => onSelect(item.key)}
            aria-pressed={selected}
            className={`min-h-36 rounded-[var(--radius-panel)] border p-4 text-left transition-colors ${selected ? 'border-field bg-field-tint/55 ring-2 ring-field/20' : 'border-line bg-panel hover:border-field/50'}`}
          >
            <span className="flex items-start justify-between gap-2">
              <span className="font-plate text-lg">{item.label}</span>
              {item.key === `strategy:${bestFit}` && <span className="shrink-0 rounded-full bg-sky-tint px-2 py-1 text-[11px] font-semibold text-sky-deep">Rotation fit</span>}
            </span>
            <span className="mt-3 block text-[13px] text-ink-faint">Horizon total · {item.projection.complete ? money(item.projection.cumulativeNetReturn) : 'Needs inputs'}</span>
            <span className={`mt-1 block text-sm font-semibold ${change === null ? 'text-ink-faint' : change >= 0 ? 'text-field' : 'text-alert'}`}>
              {change === null ? 'Compared with current: —' : `${change >= 0 ? '+' : ''}${money(change)} vs. current`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function FinanceScreen() {
  const store = useStore();
  const { plans, scenarios, financialProfiles, loaded } = useFarm();
  const { field, fields: availableFields, select: selectField } = useActiveField();
  const rotation = useRotation(field);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [drafts, setDrafts] = useState<Record<string, FinancialProfile>>({});
  const [environmentImpacts, setEnvironmentImpacts] = useState<Record<string, Record<string, number>>>({});
  const [sensitivityPreset, setSensitivityPreset] = useState<SensitivityPreset>('baseline');
  const [customSensitivity, setCustomSensitivity] = useState({ yieldPct: 0, pricePct: 0, costPct: 0 });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);

  const fieldId = field?.id;
  const storedProfile = fieldId ? financialProfiles[fieldId] : undefined;
  const profile = fieldId ? drafts[fieldId] ?? storedProfile ?? emptyFinancialProfile(fieldId) : undefined;
  const fieldPlans = useMemo(() => (fieldId ? plans.filter((plan) => plan.fieldId === fieldId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : []), [plans, fieldId]);
  const fieldScenarios = useMemo(() => (fieldId ? scenarios.filter((scenario) => scenario.fieldId === fieldId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : []), [scenarios, fieldId]);
  const strategyScores = rotation?.result.strategies ?? [];
  const strategyProposals: Proposal[] = strategyScores.map(({ strategy }) => ({
    key: `strategy:${strategy.id}`,
    kind: 'strategy',
    id: strategy.id,
    label: strategy.title,
    strategy,
  }));
  const planProposals: Proposal[] = fieldPlans.map((plan) => ({
    key: `plan:${plan.id}`,
    kind: 'plan',
    id: plan.id,
    label: `${plan.name} · Planner`,
    plan,
  }));
  const proposals = [...planProposals, ...strategyProposals];
  const selectedKey = params.get('plan') ? `plan:${params.get('plan')}` : params.get('strategy') ? `strategy:${params.get('strategy')}` : '';
  const defaultKey = planProposals[0]?.key
    ?? `strategy:${rotation?.result.bestFit && rotation.result.bestFit !== 'keep' ? rotation.result.bestFit : 'cover'}`;
  const proposal = proposals.find((item) => item.key === selectedKey) ?? proposals.find((item) => item.key === defaultKey) ?? strategyProposals[0];
  const currentStrategy = strategyScores.find(({ strategy }) => strategy.id === 'keep')?.strategy;
  const currentSchedule = currentStrategy && profile ? getStrategySeasons(currentStrategy, profile.planningHorizon) : [];
  const currentProjection = field && profile && currentSchedule.length
    ? projectFinancials({ profile, acres: acresFromM2(field.areaM2), seasons: currentSchedule, horizon: profile.planningHorizon })
    : undefined;
  const proposedSchedule = proposal?.kind === 'plan'
    ? plannerSchedule(proposal.plan)
    : proposal?.kind === 'strategy'
      ? getStrategySeasons(proposal.strategy, profile?.planningHorizon ?? 3)
      : [];
  const isAlternative = proposal?.kind === 'plan' ? proposal.plan.strategyId !== 'keep' : proposal?.kind === 'strategy' && proposal.id !== 'keep';
  const selectedProjection = field && profile && proposedSchedule.length
    ? projectFinancials({ profile, acres: acresFromM2(field.areaM2), seasons: proposedSchedule, horizon: profile.planningHorizon, alternative: isAlternative })
    : undefined;
  const hasEnvironmentalScenario = !!fieldScenarios.find((scenario) => scenario.id === params.get('environment'));
  const selectedScenario = fieldScenarios.find((scenario) => scenario.id === params.get('environment'));
  const sensitivity = sensitivityPreset === 'favorable'
    ? { yieldPct: 10, pricePct: 10, costPct: 0 }
    : sensitivityPreset === 'adverse'
      ? { yieldPct: -10, pricePct: -10, costPct: 10 }
      : sensitivityPreset === 'custom'
        ? customSensitivity
        : { yieldPct: 0, pricePct: 0, costPct: 0 };
  const adjustments: FinancialAdjustments = {
    ...sensitivity,
    environmentalYieldPctByCrop: fieldId ? environmentImpacts[fieldId] ?? {} : {},
  };
  const adjustedCurrent = field && profile && currentSchedule.length
    ? projectFinancials({ profile, acres: acresFromM2(field.areaM2), seasons: currentSchedule, horizon: profile.planningHorizon, adjustments })
    : undefined;
  const adjustedProposal = field && profile && proposedSchedule.length
    ? projectFinancials({ profile, acres: acresFromM2(field.areaM2), seasons: proposedSchedule, horizon: profile.planningHorizon, adjustments, alternative: isAlternative })
    : undefined;
  const visibleSchedules = [...strategyScores.flatMap(({ strategy }) => strategy.seasons.map((season) => season.ids)), ...proposedSchedule.map((season) => season.cropIds)];
  const cropIds = [...new Set(visibleSchedules.flat().filter((id) => id !== 'fallow'))].sort((a, b) => cropName(a).localeCompare(cropName(b)));
  const cropProjections = strategyScores.map(({ strategy }) => {
    const schedule = getStrategySeasons(strategy, profile?.planningHorizon ?? 3);
    return {
      key: `strategy:${strategy.id}`,
      label: strategy.title,
      projection: field && profile
        ? projectFinancials({ profile, acres: acresFromM2(field.areaM2), seasons: schedule, horizon: profile.planningHorizon, alternative: strategy.id !== 'keep', adjustments })
        : emptyProjection(profile?.planningHorizon ?? 3),
    };
  });
  const isDirty = !!fieldId && !!drafts[fieldId] && JSON.stringify(drafts[fieldId]) !== JSON.stringify(storedProfile);
  const bestFitTitle = strategyScores.find(({ strategy }) => strategy.id === rotation?.result.bestFit)?.strategy.title;
  const partial = adjustedCurrent && adjustedProposal ? partialBudget(adjustedCurrent.years[0], adjustedProposal.years[0]) : undefined;
  const breakEven = adjustedCurrent && adjustedProposal ? breakEvenPriceChangePct(adjustedCurrent, adjustedProposal) : undefined;

  useEffect(() => {
    if (!fieldId) return;
    const wanted = params.get('plan') ? `plan:${params.get('plan')}` : params.get('strategy') ? `strategy:${params.get('strategy')}` : '';
    if (proposals.some((item) => item.key === wanted)) return;
    const next = new URLSearchParams(params.toString());
    next.delete('plan');
    next.set('strategy', defaultKey.startsWith('strategy:') ? defaultKey.slice(9) : 'cover');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [fieldId, selectedKey, defaultKey, params, pathname, router]); // eslint-disable-line react-hooks/exhaustive-deps

  function chooseProposal(key: string) {
    const query = new URLSearchParams(params.toString());
    if (key.startsWith('plan:')) {
      query.set('plan', key.slice(5));
      query.delete('strategy');
    } else {
      query.delete('plan');
      query.set('strategy', key.slice(9));
    }
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    setNotice('');
    setError('');
  }

  function chooseEnvironmentalScenario(id: string) {
    const query = new URLSearchParams(params.toString());
    if (id) query.set('environment', id);
    else query.delete('environment');
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  }

  function updateProfile(patch: Partial<FinancialProfile>) {
    if (!fieldId || !profile) return;
    setDrafts((before) => ({ ...before, [fieldId]: { ...profile, ...patch } }));
    setNotice('');
    setError('');
  }

  function updateCrop(cropId: string, patch: Partial<CropFinancialAssumptions>) {
    if (!profile) return;
    const current = profile.crops[cropId] ?? defaultCropAssumptions();
    updateProfile({ crops: { ...profile.crops, [cropId]: { ...current, ...patch } } });
  }

  async function saveFinancialAssumptions() {
    if (!fieldId || !profile) return;
    try {
      const saved = financialProfileSchema.parse({ ...profile, updatedAt: new Date().toISOString() });
      await store.saveFinancialProfile(saved);
      setDrafts((before) => ({ ...before, [fieldId]: saved }));
      setNotice('Financial assumptions saved on this device for this field.');
      setError('');
    } catch (reason) {
      setNotice('');
      setError(`Could not save these financial assumptions: ${reason instanceof Error ? reason.message : 'check the values and try again'}`);
    }
  }

  async function createPlannerPlan() {
    if (!field || !proposal || proposal.kind !== 'strategy' || proposal.id === 'keep' || !rotation) return;
    setSavingPlan(true);
    setError('');
    try {
      const plan = planFromStrategy(proposal.strategy, field, rotation.answers, { now: new Date(), id: newId });
      await store.savePlan(plan);
      const query = new URLSearchParams({ field: field.id, plan: plan.id });
      router.push(`/planner?${query.toString()}`);
    } catch (reason) {
      setError(`Could not create a Planner plan: ${reason instanceof Error ? reason.message : 'unknown error'}`);
    } finally {
      setSavingPlan(false);
    }
  }

  if (!loaded) {
    return <div className="h-full overflow-y-auto overscroll-contain"><p className="mx-auto max-w-7xl px-4 py-8 text-ink-soft">Loading your fields…</p></div>;
  }
  if (!field) {
    return <div className="h-full overflow-y-auto overscroll-contain"><div className="mx-auto max-w-7xl space-y-5 px-4 py-8 lg:px-8"><header><p className="text-sm font-semibold uppercase tracking-[0.13em] text-field">FieldShift · Finance</p><h1 className="mt-2 font-plate text-3xl">Plan with your numbers</h1></header><NoFieldsYet what="Finance" /></div></div>;
  }
  if (!rotation?.result.strategies.length || !profile) {
    return (
      <div className="h-full overflow-y-auto overscroll-contain">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-8 lg:px-8">
        <header><p className="text-sm font-semibold uppercase tracking-[0.13em] text-field">FieldShift · Finance</p><h1 className="mt-2 font-plate text-3xl">Plan with your numbers</h1></header>
        <FieldPicker fields={availableFields} field={field} onSelect={selectField} />
        <section className={PANEL}>
          <h2 className="font-plate text-xl">Add a crop history to compare plans</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">{rotation?.result.problem ?? 'Enter the current crop and at least one season of history to build a rotation comparison.'}</p>
          <Link href="/fields" className="mt-4 inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-sky px-4 font-semibold text-white hover:bg-sky-deep">Review this field</Link>
        </section>
      </div>
      </div>
    );
  }

  const currentResult = adjustedCurrent ?? currentProjection;
  const proposalResult = adjustedProposal ?? selectedProjection;
  const coreComparison = proposalResult && currentResult;
  const planSelected = proposal?.kind === 'plan';
  const bestFitStrategyId = rotation?.result.bestFit;
  const selectedCropInputs = cropIds;

  return (
    <div className="h-full overflow-y-auto overscroll-contain">
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-[0.15em] text-field">FieldShift · Field finances</p>
          <h1 className="mt-2 font-plate text-3xl leading-tight sm:text-4xl">See what a rotation could mean for your bottom line.</h1>
          <p className="mt-2 max-w-3xl text-[15px] leading-6 text-ink-soft">Compare your current crop sequence with alternatives using your own yields, prices, and costs. Start with the numbers you know; add detail when you are ready.</p>
        </div>
        <Link href={`/planner?field=${encodeURIComponent(field.id)}`} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-line-strong bg-panel px-4 text-sm font-semibold text-sky-deep hover:border-sky">Open Planner</Link>
      </header>

      <div className="rounded-[var(--radius-panel)] border border-[#d6e5d6] bg-[#f0f7ef] p-4 text-[13px] leading-5 text-ink-soft">
        <p className="font-semibold text-ink">Planning estimate · not live market data or a yield forecast</p>
        <p className="mt-1">No sample values are prefilled. The dashboard uses farmer-entered assumptions and local plans only. It does not fetch prices, predict yield from NASA data, or provide tax, lending, or investment advice. Results are saved only in this browser.</p>
      </div>

      <FieldPicker fields={availableFields} field={field} onSelect={selectField} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Financial summary">
        <MetricCard title="First-season net return · selected" value={money(proposalResult?.yearOneNetReturn)} note={proposal?.label ?? 'Choose an alternative'} accent />
        <MetricCard title={`${profile.planningHorizon}-season cumulative return`} value={money(proposalResult?.cumulativeNetReturn)} note="Net operating return before financing, taxes, and land value." />
        <MetricCard
          title="Change vs. current rotation"
          value={coreComparison && proposalResult?.cumulativeNetReturn !== null && currentResult?.cumulativeNetReturn !== null ? money(proposalResult!.cumulativeNetReturn! - currentResult!.cumulativeNetReturn!) : 'Needs inputs'}
          note="Selected alternative minus current rotation over the full horizon."
        />
        <MetricCard
          title="Break-even crop-price change"
          value={percentage(breakEven)}
          note={breakEven === undefined ? 'Available after both plans have complete inputs.' : breakEven <= 0 ? `Selected-plan prices could fall by ${Math.abs(breakEven).toFixed(1)}% before matching current.` : `Selected-plan prices need to rise ${breakEven.toFixed(1)}% to match current.`}
        />
      </section>

      <section className={`${PANEL} space-y-4`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-field">Compare rotations</p>
            <h2 className="mt-1 font-plate text-2xl">Current plan and alternatives</h2>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-ink-soft">Rotation fit is a separate agronomic rubric, not a financial recommendation. The financial comparison is blank until the needed assumptions are entered.</p>
          </div>
          <div className="w-full md:max-w-md">
            <label htmlFor="finance-proposal" className="block text-sm font-semibold">Alternative to compare</label>
            <select id="finance-proposal" value={proposal?.key ?? ''} onChange={(event) => chooseProposal(event.currentTarget.value)} className={selectClass()}>
              {proposals.map((item) => <option key={item.key} value={item.key}>{item.label}{item.key === `strategy:${bestFitStrategyId}` ? ' · Rotation Explorer fit' : ''}</option>)}
            </select>
          </div>
        </div>
        <StrategyComparison
          strategies={cropProjections}
          selectedKey={proposal?.kind === 'strategy' ? proposal.key : ''}
          bestFit={bestFitStrategyId ?? ''}
          current={currentResult ?? emptyProjection(profile.planningHorizon)}
          onSelect={chooseProposal}
        />
        {planSelected && proposal?.kind === 'plan' && (
          <p className="rounded-xl bg-field-tint/45 p-3 text-sm text-ink-soft">
            Comparing the saved Planner schedule “{proposal.plan.name}”. This projection follows its entered seasons and does not invent crops for missing years.
          </p>
        )}
        {proposal?.kind === 'strategy' && profile.planningHorizon === 5 && (
          <p className="rounded-xl bg-field-tint/45 p-3 text-sm text-ink-soft">
            The 3-year Rotation Explorer pattern is repeated for seasons 4–5 as an explicit schedule assumption. Use a saved Planner plan to compare a different 5-year schedule.
          </p>
        )}
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <section className="space-y-5">
          <div className={PANEL}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-field">Assumptions</p>
                <h2 className="mt-1 font-plate text-2xl">Add the numbers you know</h2>
              </div>
              <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${isDirty ? 'bg-[#fff0d6] text-[#805718]' : storedProfile ? 'bg-field-tint text-field' : 'bg-field-tint text-ink-soft'}`}>
                {isDirty ? 'Unsaved changes' : storedProfile ? 'Saved on this device' : 'Not saved yet'}
              </span>
            </div>
            <p className="mt-2 text-sm leading-5 text-ink-soft">Use your own estimate for each crop. Empty values stay missing; they are never treated as $0. Per-acre figures are multiplied by this field’s {field.boundary === 'approximate' ? 'approximate ' : ''}{formatAcres(field.areaM2)}.</p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="finance-horizon" className="block text-sm font-semibold">Planning horizon</label>
                <select id="finance-horizon" value={profile.planningHorizon} onChange={(event) => updateProfile({ planningHorizon: Number(event.currentTarget.value) as 3 | 5 })} className={selectClass()}>
                  <option value="3">3 seasons</option>
                  <option value="5">5 seasons</option>
                </select>
                <p className="mt-1 text-[12px] text-ink-faint">Longer returns are not discounted; prices and costs stay constant unless changed in sensitivity.</p>
              </div>
              <div>
                <label htmlFor="finance-tenure" className="block text-sm font-semibold">Land arrangement</label>
                <select id="finance-tenure" value={profile.landTenure} onChange={(event) => updateProfile({ landTenure: event.currentTarget.value as FinancialProfile['landTenure'] })} className={selectClass()}>
                  <option value="unknown">Choose an arrangement</option>
                  <option value="owned">Owned (no cash rent entered)</option>
                  <option value="cash-rent">Cash-rented</option>
                  <option value="share-rent">Share-rented</option>
                </select>
              </div>
              {profile.landTenure === 'cash-rent' && (
                <NumberInput label="Cash rent per acre per season" value={profile.cashRentPerAcre} onChange={(cashRentPerAcre) => updateProfile({ cashRentPerAcre })} prefix="$" />
              )}
              {profile.landTenure === 'share-rent' && (
                <NumberInput label="Landowner share of crop revenue (%)" value={profile.shareRentPct} onChange={(shareRentPct) => updateProfile({ shareRentPct })} step="0.1" hint="Applied to total crop revenue. Enter 0 only if the share is truly zero." />
              )}
              {proposedSchedule.some((season) => season.hasCover) && (
                <NumberInput label="Cover crop cost per acre" value={profile.coverCostPerAcre} onChange={(coverCostPerAcre) => updateProfile({ coverCostPerAcre })} prefix="$" hint="Combined establishment and termination; enter 0 if none." />
              )}
              {isAlternative && (
                <NumberInput label="One-time transition cost per acre" value={profile.transitionCostPerAcre} onChange={(transitionCostPerAcre) => updateProfile({ transitionCostPerAcre })} prefix="$" hint="Applied in the first proposed season only. Enter 0 if none." />
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-plate text-xl">Crop assumptions</h3>
                <p className="mt-1 text-[13px] text-ink-faint">Enter yield, matching unit, sale price, and production costs. Double-cropped fields use the full field acres for each crop in sequence.</p>
              </div>
              <span className="text-[12px] text-ink-faint">All values are farmer-entered</span>
            </div>
            {selectedCropInputs.length ? selectedCropInputs.map((cropId) => (
              <CropInputCard
                key={cropId}
                cropId={cropId}
                profile={profile.crops[cropId] ?? defaultCropAssumptions()}
                environmentalImpact={fieldId ? environmentImpacts[fieldId]?.[cropId] ?? 0 : 0}
                hasEnvironmentalScenario={hasEnvironmentalScenario}
                onCropChange={(patch) => updateCrop(cropId, patch)}
                onEnvironmentalImpact={(value) => {
                  if (!fieldId) return;
                  setEnvironmentImpacts((before) => ({
                    ...before,
                    [fieldId]: { ...(before[fieldId] ?? {}), [cropId]: value },
                  }));
                }}
              />
            )) : <p className={`${PANEL} text-sm text-ink-soft`}>Choose a supported crop from Fields or Planner to enter financial assumptions.</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={saveFinancialAssumptions} disabled={!isDirty && !!storedProfile}>Save financial inputs</Button>
              {notice && <p className="text-sm font-medium text-field" role="status">{notice}</p>}
              {error && <p className="text-sm text-alert" role="alert">{error}</p>}
            </div>
          </div>

        </section>

        <aside className="space-y-5">
          <section className={PANEL}>
            <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-field">What-if analysis</p>
            <h2 className="mt-1 font-plate text-2xl">Test a financial scenario</h2>
            <p className="mt-2 text-sm leading-5 text-ink-soft">These temporary sensitivity changes are applied to all crops. They are separate from the saved base assumptions.</p>
            <label htmlFor="finance-sensitivity" className="mt-4 block text-sm font-semibold">Scenario assumption</label>
            <select id="finance-sensitivity" value={sensitivityPreset} onChange={(event) => setSensitivityPreset(event.currentTarget.value as SensitivityPreset)} className={selectClass()}>
              <option value="baseline">Entered assumptions (baseline)</option>
              <option value="favorable">Illustrative favorable: +10% yield and price</option>
              <option value="adverse">Illustrative adverse: −10% yield and price, +10% costs</option>
              <option value="custom">Set my own changes</option>
            </select>
            {sensitivityPreset === 'custom' && (
              <div className="mt-4 space-y-4">
                <RangeAdjustment label="Yield change" value={customSensitivity.yieldPct} onChange={(yieldPct) => setCustomSensitivity((before) => ({ ...before, yieldPct }))} hint="Applied to entered yields, not predicted from weather." />
                <RangeAdjustment label="Crop price change" value={customSensitivity.pricePct} onChange={(pricePct) => setCustomSensitivity((before) => ({ ...before, pricePct }))} hint="Same percentage applied to each crop's entered price." />
                <RangeAdjustment label="Production cost change" value={customSensitivity.costPct} onChange={(costPct) => setCustomSensitivity((before) => ({ ...before, costPct }))} hint="Applied to entered crop production costs." />
              </div>
            )}
            <div className="mt-4">
              <label htmlFor="finance-weather" className="block text-sm font-semibold">Optional saved weather scenario</label>
              <select id="finance-weather" value={selectedScenario?.id ?? ''} onChange={(event) => chooseEnvironmentalScenario(event.currentTarget.value)} className={selectClass()}>
                <option value="">No weather scenario</option>
                {fieldScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
              </select>
              {selectedScenario && <ScenarioCard scenario={selectedScenario} />}
              {!selectedScenario && <p className="mt-2 text-[12px] leading-5 text-ink-faint">Saved scenarios only show their rainfall and temperature settings. They do not automatically alter yield or profit.</p>}
            </div>
          </section>

          <section className={PANEL}>
            <h2 className="font-plate text-xl">Season-one partial budget</h2>
            <p className="mt-1 text-[13px] leading-5 text-ink-faint">Added revenue and reduced costs are shown separately from added costs and reduced revenue.</p>
            {partial ? (
              <div className="mt-4 space-y-2">
                {[
                  ['Added revenue', partial.addedRevenue, true],
                  ['Reduced costs', partial.reducedCosts, true],
                  ['Added costs', partial.addedCosts, false],
                  ['Reduced revenue', partial.reducedRevenue, false],
                ].map(([label, amount, positive]) => (
                  <div key={String(label)} className="flex items-center justify-between gap-3 border-b border-line py-2 text-sm">
                    <span>{label}</span><span className={`font-semibold tabular-nums ${Number(amount) === 0 ? 'text-ink-faint' : positive ? 'text-field' : 'text-alert'}`}>{Number(amount) !== 0 && positive ? '+' : ''}{money(Number(amount) * (positive ? 1 : -1))}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 pt-1 font-semibold">
                  <span>Net change vs. current</span><span className={partial.netChange >= 0 ? 'text-field' : 'text-alert'}>{partial.netChange >= 0 ? '+' : ''}{money(partial.netChange)}</span>
                </div>
              </div>
            ) : <p className="mt-4 rounded-xl bg-field-tint/45 p-3 text-sm text-ink-soft">Complete both first-season estimates to see the partial budget.</p>}
          </section>

          {proposal?.kind === 'strategy' && proposal.id !== 'keep' && (
            <section className="rounded-[var(--radius-panel)] border border-field/20 bg-field-tint/40 p-4">
              <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-field">Next step</p>
              <h2 className="mt-1 font-plate text-xl">Put this strategy on your calendar</h2>
              <p className="mt-2 text-[13px] leading-5 text-ink-soft">Create an editable Planner plan from the selected Rotation Explorer strategy. Your financial assumptions stay separate and unchanged.</p>
              <Button className="mt-4 w-full" onClick={createPlannerPlan} disabled={savingPlan}>{savingPlan ? 'Creating plan…' : 'Create plan and open Planner'}</Button>
            </section>
          )}
          {proposal?.kind === 'plan' && (
            <section className="rounded-[var(--radius-panel)] border border-field/20 bg-field-tint/40 p-4">
              <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-field">Next step</p>
              <h2 className="mt-1 font-plate text-xl">Continue editing this plan</h2>
              <p className="mt-2 text-[13px] leading-5 text-ink-soft">Open the selected schedule in Planner to update its crops and dates.</p>
              <Link href={`/planner?field=${encodeURIComponent(field.id)}&plan=${encodeURIComponent(proposal.plan.id)}`} className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-[var(--radius-control)] bg-field px-4 font-semibold text-white hover:bg-field-deep">Open selected plan</Link>
            </section>
          )}
        </aside>
      </div>

      <section className="space-y-5">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-field">Compare the numbers</p>
          <h2 className="mt-1 font-plate text-2xl">Financial picture · {proposal?.label ?? 'selected alternative'}</h2>
          <p className="mt-1 text-sm text-ink-soft">All chart values are per field in USD. Negative net returns remain visible; a missing input never becomes a zero.</p>
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <section className={PANEL}>
            <h3 className="font-plate text-xl">Annual net operating return</h3>
            <p className="mt-1 mb-4 text-[13px] text-ink-faint">Revenue minus entered crop, land, and transition costs, before taxes and financing.</p>
            {coreComparison ? <AnnualNetChart current={currentResult!} proposed={proposalResult!} currentLabel="Current rotation" proposedLabel={proposal?.label ?? 'Selected alternative'} /> : <p>Enter a crop history and comparison schedule.</p>}
          </section>
          <section className={PANEL}>
            <h3 className="font-plate text-xl">Cumulative net return</h3>
            <p className="mt-1 mb-4 text-[13px] text-ink-faint">Adds each season&apos;s net return. No inflation, financing cost, or discount rate is assumed.</p>
            {coreComparison ? <CumulativeNetChart current={currentResult!} proposed={proposalResult!} currentLabel="Current rotation" proposedLabel={proposal?.label ?? 'Selected alternative'} /> : <p>Enter a crop history and comparison schedule.</p>}
          </section>
          <section className={PANEL}>
            <h3 className="font-plate text-xl">First-season revenue and costs</h3>
            <p className="mt-1 mb-4 text-[13px] text-ink-faint">Revenue and operating costs are separate so a higher gross return is not mistaken for higher profit.</p>
            <RevenueCostChart current={currentResult?.years[0]} proposed={proposalResult?.years[0]} currentLabel="Current rotation" proposedLabel={proposal?.label ?? 'Selected alternative'} />
          </section>
          <section className={PANEL}>
            <h3 className="font-plate text-xl">First-season cost breakdown</h3>
            <p className="mt-1 mb-4 text-[13px] text-ink-faint">Entered operating costs, rent, cover crop, and transition costs, compared by category.</p>
            <ExpenseBreakdown current={currentResult?.years[0]} proposed={proposalResult?.years[0]} currentLabel="Current rotation" proposedLabel={proposal?.label ?? 'Selected alternative'} />
          </section>
        </div>
      </section>

      {currentResult && proposalResult && (
        <section className="grid gap-4 md:grid-cols-2">
          <div className={PANEL}>
            <h3 className="font-plate text-xl">Current rotation estimate</h3>
            <p className="mt-1 text-sm text-ink-soft">{bestFitTitle ? `Rotation Explorer's field-fit option: ${bestFitTitle}.` : 'Current schedule from the field’s crop history.'} Your financial entries determine the estimate.</p>
            <MissingInputs projection={currentResult} />
          </div>
          <div className={PANEL}>
            <h3 className="font-plate text-xl">Selected alternative estimate</h3>
            <p className="mt-1 text-sm text-ink-soft">{proposal?.kind === 'plan' ? `Schedule source: Planner · ${proposal.plan.name}.` : 'Schedule source: Rotation Explorer. Three-season patterns repeat beyond the initial plan only when shown above.'}</p>
            <MissingInputs projection={proposalResult} />
          </div>
        </section>
      )}

      <footer className="border-t border-line pt-4 text-[12px] leading-5 text-ink-faint">
        <p>Assumptions are editable and stored per field on this device. Prices, yields, cost estimates, land rent, and scenario effects are not independently verified. Public soil, satellite, and weather data are not used to calculate dollars.</p>
      </footer>
    </div>
    </div>
  );
}

function emptyProjection(horizon: 3 | 5): FinancialProjection {
  return {
    years: Array.from({ length: horizon }, (_, index) => ({
      year: new Date().getFullYear() + index + 1,
      seasonMissing: true,
      repeated: false,
      revenue: null,
      costs: null,
      netReturn: null,
      costBreakdown: {},
      missingInputs: [],
    })),
    totalRevenue: null,
    totalCosts: null,
    cumulativeNetReturn: null,
    yearOneNetReturn: null,
    missingInputs: [],
    complete: false,
  };
}
