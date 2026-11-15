'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { formatAcres } from '@/lib/domain/acreage';
import { IRRIGATION_LABELS } from '@/lib/domain/management';
import { newId } from '@/lib/domain/field';
import { compareScenario, DEFAULT_SCENARIO_CONFIG, PRIORITY_EXPLANATIONS, PRIORITY_LABELS, SCENARIO_PRESETS, STAGE_LABELS, scenarioConfigSchema, strategyFromPlan, adjustClimateNormals, summarizeScenarioWeather } from '@/lib/domain/scenario';
import type { Plan, SavedScenario, ScenarioConfig, ScenarioPreset, ScenarioProposal } from '@/lib/domain/types';
import { useFarm, useStore } from '@/lib/client/StoreProvider';
import { useActiveField } from '@/lib/client/useActiveField';
import { useRotation } from '@/lib/client/useRotation';
import { Button } from '../ui/Button';
import { FieldPicker, NoFieldsYet } from '../ui/FieldPicker';
import { TextField } from '../ui/TextField';
import { CropCoverTimeline, RainfallChart, RotationComparisonChart, TemperatureChart } from './SimulatorCharts';

const PANEL = 'rounded-[var(--radius-panel)] border border-line bg-panel p-4 lg:p-5';
const PRESET_LABELS: Record<Exclude<ScenarioPreset, 'custom'>, string> = {
  historical: 'Historical normal',
  drier: 'Drier season',
  wetter: 'Wetter season',
  hotter: 'Hotter season',
};
const STRATEGY_LABELS: Record<string, string> = {
  keep: 'Keep your rotation',
  cover: 'Add a cover crop',
  'small-grains': 'Bring in small grains',
  custom: 'Your own plan',
};

function proposalId(proposal: ScenarioProposal) {
  return `${proposal.kind}:${proposal.id}`;
}

function scenarioTitle(proposal: ScenarioProposal, plans: Plan[]) {
  if (proposal.kind === 'plan') return plans.find((plan) => plan.id === proposal.id)?.name ?? 'Saved Planner plan';
  return STRATEGY_LABELS[proposal.id] ?? proposal.id;
}

function selectClass() {
  return 'mt-1 block min-h-12 w-full rounded-[var(--radius-control)] border border-line-strong bg-panel px-3 text-[15px]';
}

export function SimulatorScreen() {
  const store = useStore();
  const { plans, scenarios, profiles, management, settings } = useFarm();
  const { field, fields: availableFields, loaded } = useActiveField();
  const rotation = useRotation(field);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fieldId = field?.id;
  const queryPlan = params.get('plan');
  const queryStrategy = params.get('strategy');
  const fieldPlans = useMemo(() => (fieldId ? plans.filter((plan) => plan.fieldId === fieldId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : []), [plans, fieldId]);
  const fieldScenarios = useMemo(() => (fieldId ? scenarios.filter((scenario) => scenario.fieldId === fieldId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : []), [scenarios, fieldId]);
  const strategyOptions = useMemo(() => rotation?.result.strategies ?? [], [rotation?.result.strategies]);
  const proposalOptions = useMemo(() => [
    ...fieldPlans.map((plan) => ({ key: `plan:${plan.id}`, label: `${plan.name} · Planner plan` })),
    ...strategyOptions.map(({ strategy }) => ({ key: `strategy:${strategy.id}`, label: `${strategy.title}${strategy.id === rotation?.result.bestFit ? ' · Rotation Explorer best fit' : ''}` })),
  ], [fieldPlans, strategyOptions, rotation?.result.bestFit]);
  const optionKeys = proposalOptions.map((option) => option.key).join('|');

  const [config, setConfig] = useState<ScenarioConfig>(DEFAULT_SCENARIO_CONFIG);
  const [proposalKey, setProposalKey] = useState('');
  const [savedId, setSavedId] = useState('');
  const [scenarioName, setScenarioName] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!field) {
      setProposalKey('');
      return;
    }
    const requestedPlan = queryPlan ? `plan:${queryPlan}` : '';
    const requestedStrategy = queryStrategy ? `strategy:${queryStrategy}` : '';
    const chosen = proposalOptions.find((option) => option.key === requestedPlan)?.key
      ?? proposalOptions.find((option) => option.key === requestedStrategy)?.key
      ?? proposalOptions.find((option) => option.key.startsWith('plan:'))?.key
      ?? proposalOptions.find((option) => option.key === `strategy:${rotation?.result.bestFit}`)?.key
      ?? proposalOptions[0]?.key
      ?? '';
    if (!proposalOptions.some((option) => option.key === proposalKey)) setProposalKey(chosen);
  }, [field?.id, queryPlan, queryStrategy, optionKeys, rotation?.result.bestFit]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSavedId('');
    setScenarioName('');
    setNotice('');
    setError('');
    setDeleteConfirm(false);
  }, [field?.id]);

  useEffect(() => {
    if (field) store.ensureLookups(field.id);
  }, [field?.id, store]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedPlan = proposalKey.startsWith('plan:') ? fieldPlans.find((plan) => plan.id === proposalKey.slice(5)) : undefined;
  const selectedPlanResult = useMemo(() => selectedPlan && rotation?.inputs
    ? strategyFromPlan(selectedPlan, rotation.inputs.lat, rotation.inputs.climate?.value)
    : undefined, [selectedPlan, rotation?.inputs]);
  const proposed = selectedPlan ? selectedPlanResult?.strategy : strategyOptions.find(({ strategy }) => proposalKey === `strategy:${strategy.id}`)?.strategy;
  const current = strategyOptions.find(({ strategy }) => strategy.id === 'keep')?.strategy;
  const climate = rotation?.inputs.climate?.value;
  const comparison = rotation && current && proposed ? compareScenario(rotation.inputs, current, proposed, rotation.result.knownSeasons, config) : undefined;
  const weather = climate ? summarizeScenarioWeather(climate, adjustClimateNormals(climate, config.rainfallPct, config.temperatureDeltaC)) : undefined;
  const powerSource = field ? profiles[field.id]?.sources.power : undefined;
  const selectedSaved = fieldScenarios.find((scenario) => scenario.id === savedId);
  const savedPlan = selectedSaved?.proposal.kind === 'plan' ? fieldPlans.find((plan) => plan.id === selectedSaved.proposal.id) : undefined;
  const savedPlanMissing = selectedSaved?.proposal.kind === 'plan' && !savedPlan;
  const savedPlanChanged = !!selectedSaved?.planUpdatedAt && !!savedPlan && savedPlan.updatedAt !== selectedSaved.planUpdatedAt;
  const fieldChanged = !!selectedSaved && !!field && (
    field.updatedAt !== selectedSaved.fieldUpdatedAt
    || (management[field.id]?.updatedAt ?? '') !== (selectedSaved.answersUpdatedAt ?? '')
  );

  const patchConfig = (patch: Partial<ScenarioConfig>) => {
    setConfig((before) => scenarioConfigSchema.parse({
      ...before,
      ...patch,
      ...(patch.rainfallPct !== undefined || patch.temperatureDeltaC !== undefined ? { preset: patch.preset ?? 'custom' } : {}),
    }));
    setSavedId('');
    setNotice('');
    setError('');
  };

  const choosePreset = (preset: Exclude<ScenarioPreset, 'custom'>) => {
    setConfig((before) => ({ ...before, preset, ...SCENARIO_PRESETS[preset] }));
    setSavedId('');
    setNotice('');
    setError('');
  };

  const chooseProposal = (key: string) => {
    setProposalKey(key);
    setSavedId('');
    const query = new URLSearchParams(params.toString());
    if (key.startsWith('plan:')) {
      query.set('plan', key.slice(5));
      query.delete('strategy');
    } else {
      query.delete('plan');
      query.set('strategy', key.slice(9));
    }
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  };

  const chooseField = (id: string) => {
    const query = new URLSearchParams(params.toString());
    query.set('field', id);
    query.delete('plan');
    query.delete('strategy');
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    void store.rememberField(id);
  };

  const loadScenario = (id: string) => {
    const saved = fieldScenarios.find((scenario) => scenario.id === id);
    if (!saved) {
      setSavedId('');
      setScenarioName('');
      return;
    }
    const parsed = scenarioConfigSchema.safeParse(saved.config);
    if (!parsed.success) {
      setError('This saved comparison is unreadable. It has not been changed.');
      return;
    }
    setError('');
    setConfig(parsed.data);
    setScenarioName(saved.name);
    setSavedId(saved.id);
    setProposalKey(proposalId(saved.proposal));
    const query = new URLSearchParams(params.toString());
    if (saved.proposal.kind === 'plan') {
      query.set('plan', saved.proposal.id);
      query.delete('strategy');
    } else {
      query.delete('plan');
      query.set('strategy', saved.proposal.id);
    }
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    setNotice(`Loaded “${saved.name}”.`);
  };

  const snapshot = (): SavedScenario | undefined => {
    if (!field || !proposed) return undefined;
    const name = scenarioName.trim() || `${config.preset === 'custom' ? 'Custom scenario' : PRESET_LABELS[config.preset]} · ${scenarioTitle(selectedPlan ? { kind: 'plan', id: selectedPlan.id } : { kind: 'strategy', id: proposed.id }, fieldPlans)}`;
    return {
      id: newId(),
      fieldId: field.id,
      name: name.slice(0, 80),
      currentStrategyId: 'keep',
      fieldUpdatedAt: field.updatedAt,
      ...(management[field.id] ? { answersUpdatedAt: management[field.id].updatedAt } : {}),
      proposal: selectedPlan ? { kind: 'plan', id: selectedPlan.id } : { kind: 'strategy', id: proposed.id },
      ...(selectedPlan ? { planUpdatedAt: selectedPlan.updatedAt } : {}),
      config: scenarioConfigSchema.parse(config),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  const saveNewScenario = async () => {
    const scenario = snapshot();
    if (!scenario) return;
    try {
      await store.saveScenario(scenario);
      setSavedId(scenario.id);
      setScenarioName(scenario.name);
      setError('');
      setNotice(`Saved “${scenario.name}” on this device.`);
    } catch (reason) {
      setNotice('');
      setError(`Could not save this comparison: ${reason instanceof Error ? reason.message : 'browser storage error'}`);
    }
  };

  const saveRename = async () => {
    if (!selectedSaved || !scenarioName.trim()) return;
    const next = { ...selectedSaved, name: scenarioName.trim().slice(0, 80), updatedAt: new Date().toISOString() };
    try {
      await store.saveScenario(next);
      setError('');
      setNotice(`Renamed to “${next.name}”.`);
    } catch (reason) {
      setNotice('');
      setError(`Could not rename this comparison: ${reason instanceof Error ? reason.message : 'browser storage error'}`);
    }
  };

  const duplicateScenario = async () => {
    const copy = snapshot();
    if (!copy) return;
    const name = `Copy of ${copy.name}`.slice(0, 80);
    const duplicate = { ...copy, id: newId(), name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    try {
      await store.saveScenario(duplicate);
      setSavedId(duplicate.id);
      setScenarioName(name);
      setError('');
      setNotice(`Saved a copy as “${name}”.`);
    } catch (reason) {
      setNotice('');
      setError(`Could not duplicate this comparison: ${reason instanceof Error ? reason.message : 'browser storage error'}`);
    }
  };

  const deleteScenario = async () => {
    if (!selectedSaved) return;
    try {
      await store.deleteScenario(selectedSaved.id);
      setSavedId('');
      setScenarioName('');
      setDeleteConfirm(false);
      setError('');
      setNotice('Saved scenario deleted from this device.');
    } catch (reason) {
      setNotice('');
      setError(`Could not delete this comparison: ${reason instanceof Error ? reason.message : 'browser storage error'}`);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 lg:py-8">
        <header>
          <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-field">FieldShift · Planning tool</p>
          <h1 className="mt-1 font-plate text-3xl">Scenario Simulator</h1>
          <p className="mt-1 max-w-3xl text-[16px] text-ink-soft">
            Explore how a crop plan and a changed season compare with your current rotation. Adjustments are hypothetical—not a forecast or a promise of yield.
          </p>
        </header>

        {!loaded ? (
          <p className="text-ink-soft" role="status">Loading your fields…</p>
        ) : !field ? (
          <NoFieldsYet what="The Scenario Simulator" />
        ) : (
          <>
            <FieldPicker fields={availableFields} field={field} onSelect={chooseField} />
            {rotation?.result.problem ? (
              <section className={`${PANEL} bg-wheat-tint`} data-testid="simulator-needs-crops">
                <h2 className="font-plate text-xl">Add a crop history to compare plans</h2>
                <p className="mt-2 text-[15px] text-ink-soft">{rotation.result.problem}</p>
                <Link href="/fields" className="mt-3 inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-sky px-4 font-semibold text-white hover:bg-sky-deep">Enter crops on Fields</Link>
              </section>
            ) : rotation && current ? (
              <>
                <ScenarioControls
                  config={config}
                  proposalOptions={proposalOptions}
                  proposalKey={proposalKey}
                  savedScenarios={fieldScenarios}
                  savedId={savedId}
                  scenarioName={scenarioName}
                  error={error}
                  currentIrrigation={rotation.answers.irrigation ? IRRIGATION_LABELS[rotation.answers.irrigation] : 'not answered'}
                  setScenarioName={setScenarioName}
                  notice={notice}
                  onConfig={patchConfig}
                  onPreset={choosePreset}
                  onProposal={chooseProposal}
                  onLoad={loadScenario}
                  onSave={saveNewScenario}
                  onRename={saveRename}
                  onDuplicate={duplicateScenario}
                  onDelete={() => setDeleteConfirm(true)}
                  deleteConfirm={deleteConfirm}
                  onConfirmDelete={deleteScenario}
                  onCancelDelete={() => setDeleteConfirm(false)}
                  onReset={() => {
                    setConfig(DEFAULT_SCENARIO_CONFIG);
                    setSavedId('');
                    setNotice('Scenario controls reset to historical normals.');
                  }}
                  hasProposal={!!proposed}
                  isSaved={!!selectedSaved}
                />

                {selectedSaved && (savedPlanChanged || fieldChanged) && (
                  <p className="rounded-[var(--radius-control)] border border-wheat/50 bg-wheat-tint px-4 py-3 text-[14px] text-wheat-deep" role="status">
                    This saved comparison uses an older {savedPlanChanged && fieldChanged ? 'Planner plan and field history' : savedPlanChanged ? 'Planner plan' : 'field history'}. It will use the current version now; the saved scenario itself has not changed.
                  </p>
                )}
                {selectedSaved && savedPlanMissing && (
                  <p className="rounded-[var(--radius-control)] border border-wheat/50 bg-wheat-tint px-4 py-3 text-[14px] text-wheat-deep" role="status">
                    The Planner plan saved with this comparison no longer exists. The current strategy selection is shown instead; the saved comparison has not been overwritten.
                  </p>
                )}

                <SummaryCards fieldName={field.name} acres={formatAcres(field.areaM2)} comparison={comparison} weather={weather} hasClimate={!!climate} />
                {proposed && comparison && (
                  <>
                    <ScenarioTakeaway comparison={comparison} proposed={proposed} selectedPlan={selectedPlan} planLimitations={selectedPlanResult?.limitations ?? []} priority={config.priority} />
                    <section className="space-y-4" aria-labelledby="weather-scenario-heading">
                      <div>
                        <h2 id="weather-scenario-heading" className="font-plate text-2xl">Weather adjustments</h2>
                        <p className="mt-1 text-[14.5px] text-ink-soft">Both charts use monthly climate normals for this field’s coarse NASA POWER grid cell. They do not model future weather.</p>
                      </div>
                      {weather ? (
                        <>
                          <RainfallChart summary={weather} />
                          <p className="px-1 text-[14px] text-ink-soft">{rainfallExplanation(weather, config.rainfallPct)}</p>
                          <TemperatureChart summary={weather} />
                          <p className="px-1 text-[14px] text-ink-soft">{temperatureExplanation(weather, config.temperatureDeltaC)}</p>
                        </>
                      ) : (
                        <div className={`${PANEL} bg-wheat-tint`}>
                          <h3 className="font-semibold">Climate chart unavailable</h3>
                          <p className="mt-1 text-[14.5px] text-ink-soft">{!settings.externalLookups ? 'Public data lookups are off. Turn them on in Settings to request public climate normals.' : powerSource?.status === 'unavailable' ? 'NASA POWER data could not be retrieved for this field.' : powerSource?.status === 'loading' ? 'NASA POWER climate normals are still loading.' : 'No complete set of 12 monthly NASA POWER climate normals is available for this field.'} No weather values have been filled in or invented.</p>
                        </div>
                      )}
                    </section>
                    <RotationComparisonChart current={comparison.current} proposed={comparison.proposed} />
                    <CropCoverTimeline current={current} proposed={proposed} firstYear={rotation.inputs.currentYear + 1} />
                    <MethodologyDetails
                      config={config}
                      powerStatus={powerSource?.status ?? (settings.externalLookups ? 'loading' : 'not_built')}
                      planLimitations={selectedPlanResult?.limitations ?? []}
                    />
                  </>
                )}
              </>
            ) : (
              <p role="status" className="text-ink-soft">Enter a supported crop on the Fields tab to generate scenario comparisons.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ScenarioControls({
  config, proposalOptions, proposalKey, savedScenarios, savedId, scenarioName, setScenarioName, notice, error,
  currentIrrigation,
  onConfig, onPreset, onProposal, onLoad, onSave, onRename, onDuplicate, onDelete, deleteConfirm,
  onConfirmDelete, onCancelDelete, onReset, hasProposal, isSaved,
}: {
  config: ScenarioConfig;
  proposalOptions: Array<{ key: string; label: string }>;
  proposalKey: string;
  savedScenarios: SavedScenario[];
  savedId: string;
  scenarioName: string;
  currentIrrigation: string;
  setScenarioName: (name: string) => void;
  notice: string;
  error: string;
  onConfig: (patch: Partial<ScenarioConfig>) => void;
  onPreset: (preset: Exclude<ScenarioPreset, 'custom'>) => void;
  onProposal: (key: string) => void;
  onLoad: (id: string) => void;
  onSave: () => void | Promise<void>;
  onRename: () => void | Promise<void>;
  onDuplicate: () => void | Promise<void>;
  onDelete: () => void;
  deleteConfirm: boolean;
  onConfirmDelete: () => void | Promise<void>;
  onCancelDelete: () => void;
  onReset: () => void;
  hasProposal: boolean;
  isSaved: boolean;
}) {
  return (
    <section className={PANEL} aria-labelledby="setup-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="setup-heading" className="font-plate text-2xl">Set up a comparison</h2>
          <p className="mt-1 text-[14.5px] text-ink-soft">Try a plan, then adjust one or two conditions to see what the existing rubric says.</p>
        </div>
        <Button variant="ghost" onClick={onReset}>Reset scenario</Button>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <label className="block text-[14px] font-semibold">
          What do you want to compare?
          <select value={proposalKey} onChange={(event) => onProposal(event.target.value)} className={selectClass()}>
            {proposalOptions.length === 0 && <option value="">No strategy available</option>}
            {proposalOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </label>
        <label className="block text-[14px] font-semibold">
          What matters most for this comparison?
          <select value={config.priority} onChange={(event) => onConfig({ priority: event.target.value as ScenarioConfig['priority'] })} className={selectClass()}>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <span className="mt-1 block text-[13px] font-normal text-ink-faint">{PRIORITY_EXPLANATIONS[config.priority]}</span>
        </label>
      </div>

      <fieldset className="mt-5">
        <legend className="text-[14px] font-semibold">Start with a season example</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(PRESET_LABELS) as Array<Exclude<ScenarioPreset, 'custom'>>).map((preset) => (
            <button key={preset} type="button" aria-pressed={config.preset === preset} onClick={() => onPreset(preset)} className={`min-h-11 rounded-[var(--radius-control)] border px-3 text-[14px] font-semibold ${config.preset === preset ? 'border-field bg-field-tint text-field' : 'border-line-strong bg-panel hover:border-field'}`}>
              {PRESET_LABELS[preset]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <RangeControl
          label="Rainfall adjustment"
          value={config.rainfallPct}
          min={-30}
          max={30}
          step={5}
          format={(value) => `${value > 0 ? '+' : ''}${value}%`}
          hint="Scales every month of the 1991–2020 normal equally. It does not predict rainfall or water available to crops."
          onChange={(rainfallPct) => onConfig({ rainfallPct })}
        />
        <RangeControl
          label="Average temperature adjustment"
          value={config.temperatureDeltaC}
          min={-3}
          max={5}
          step={0.5}
          format={(value) => `${value > 0 ? '+' : ''}${value}°C`}
          hint="Shifts every monthly average by the same amount; this is not a forecast or heat-stress calculation."
          onChange={(temperatureDeltaC) => onConfig({ temperatureDeltaC })}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <label className="block text-[14px] font-semibold">
          Irrigation assumption
          <select value={config.irrigation} onChange={(event) => onConfig({ irrigation: event.target.value as ScenarioConfig['irrigation'] })} className={selectClass()}>
            <option value="field">Use field questionnaire answer ({currentIrrigation})</option>
            {Object.entries(IRRIGATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <span className="mt-1 block text-[13px] font-normal text-ink-faint">Affects only existing rubric inputs; no water-use estimate is calculated.</span>
        </label>
        <label className="block text-[14px] font-semibold">
          Crop growth stage (context only)
          <select value={config.growthStage} onChange={(event) => onConfig({ growthStage: event.target.value as ScenarioConfig['growthStage'] })} className={selectClass()}>
            {Object.entries(STAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <span className="mt-1 block text-[13px] font-normal text-ink-faint">Recorded for your notes; the available rotation rubric does not model stage-specific crop responses.</span>
        </label>
      </div>

      <div className="mt-5 rounded-[var(--radius-control)] border border-line bg-paper p-3">
        <p className="text-[14px] font-semibold">Saved comparisons · this device only</p>
        <div className="mt-2 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <label className="block text-[13.5px] font-semibold">
            Load a saved comparison
            <select value={savedId} onChange={(event) => onLoad(event.target.value)} className={selectClass()}>
              <option value="">Current unsaved setup</option>
              {savedScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
            </select>
          </label>
          <TextField
            label={isSaved ? 'Saved comparison name' : 'Name this comparison'}
            value={scenarioName}
            maxLength={80}
            onChange={(event) => setScenarioName(event.target.value)}
            placeholder="e.g. Dry spring with cover crop"
            hint="Saved locally in this browser; no data is sent to a service."
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={onSave} disabled={!hasProposal}>Save new</Button>
          {isSaved && <Button variant="secondary" onClick={onRename} disabled={!scenarioName.trim()}>Rename</Button>}
          {isSaved && <Button variant="secondary" onClick={onDuplicate} disabled={!hasProposal}>Duplicate</Button>}
          {isSaved && <Button variant="ghost" onClick={onDelete}>Delete</Button>}
        </div>
        {deleteConfirm && isSaved && (
          <div className="mt-3 rounded-[var(--radius-control)] border border-alert/30 bg-alert-tint p-3" role="alertdialog" aria-label="Confirm scenario deletion">
            <p className="text-[14px] text-[#7a2c1d]">Delete this saved comparison from this device?</p>
            <div className="mt-2 flex gap-2">
              <Button variant="danger" onClick={onConfirmDelete}>Delete comparison</Button>
              <Button variant="secondary" onClick={onCancelDelete}>Cancel</Button>
            </div>
          </div>
        )}
        {notice && <p className="mt-2 text-[13.5px] text-field" role="status">{notice}</p>}
        {error && <p className="mt-2 text-[13.5px] text-alert" role="alert">{error}</p>}
      </div>
    </section>
  );
}

function RangeControl({ label, value, min, max, step, format, hint, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (value: number) => string; hint: string; onChange: (value: number) => void }) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <div>
      <div className="flex justify-between gap-3">
        <label htmlFor={id} className="text-[14px] font-semibold">{label}</label>
        <output htmlFor={id} className="font-semibold text-field">{format(value)}</output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-3 min-h-8 w-full accent-[#2f6b3a]" />
      <div className="flex justify-between text-[12px] text-ink-faint"><span>{format(min)}</span><span>{format(max)}</span></div>
      <p className="mt-1 text-[13px] text-ink-faint">{hint}</p>
    </div>
  );
}

function SummaryCards({ fieldName, acres, comparison, weather, hasClimate }: { fieldName: string; acres: string; comparison: ReturnType<typeof compareScenario> | undefined; weather: ReturnType<typeof summarizeScenarioWeather> | undefined; hasClimate: boolean }) {
  const cards = [
    {
      title: 'Field & rotation',
      value: fieldName,
      note: `${acres} · current crops and saved history`,
      icon: '▰',
    },
    {
      title: 'Climate normals',
      value: hasClimate && weather ? `${weather.baselineRainIn.toFixed(1)} in` : 'Unavailable',
      note: hasClimate && weather ? `1991–2020 annual rainfall normal · scenario ${weather.adjustedRainIn.toFixed(1)} in` : 'No complete monthly normal is available',
      icon: '☼',
    },
    {
      title: 'Rotation rubric',
      value: comparison?.betterMatch === 'proposed' ? 'Proposed plan leads' : comparison?.betterMatch === 'current' ? 'Current rotation leads' : 'No clear winner',
      note: 'Provisional scores, not predicted farm outcomes',
      icon: '↗',
    },
  ];
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Scenario summary">
      {cards.map((card) => (
        <article key={card.title} className={`${PANEL} flex min-h-32 gap-3`}>
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-field-tint text-xl text-field">{card.icon}</span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink-soft">{card.title}</p>
            <p className="mt-1 truncate font-plate text-xl">{card.value}</p>
            <p className="mt-1 text-[13px] text-ink-faint">{card.note}</p>
          </div>
        </article>
      ))}
    </section>
  );
}

function ScenarioTakeaway({ comparison, proposed, selectedPlan, planLimitations, priority }: { comparison: ReturnType<typeof compareScenario>; proposed: NonNullable<ReturnType<typeof strategyFromPlan>['strategy']>; selectedPlan?: Plan; planLimitations: string[]; priority: ScenarioConfig['priority'] }) {
  const label = comparison.betterMatch === 'proposed' ? proposed.title : comparison.betterMatch === 'current' ? 'Keep your rotation' : 'No clear winner';
  const topDifferences = comparison.current.bars
    .map((bar) => {
      const after = comparison.proposed.bars.find((candidate) => candidate.id === bar.id);
      return after?.score === null || bar.score === null || !after ? undefined : { label: bar.label, delta: after.score - bar.score };
    })
    .filter((item): item is { label: string; delta: number } => !!item && item.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 2);
  const caveats = comparison.proposed.caveats.map((reason) => reason.text);
  return (
    <section className={`${PANEL} border-field/40 bg-field-tint`} aria-labelledby="scenario-takeaway-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-[0.1em] text-field">What this comparison suggests</p>
          <h2 id="scenario-takeaway-heading" className="mt-1 font-plate text-2xl">{priority === 'operational' ? 'Practical fit needs your judgment' : label}</h2>
        </div>
        {selectedPlan && <Link href={`/planner?field=${selectedPlan.fieldId}&plan=${selectedPlan.id}`} className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-field/40 bg-panel px-4 text-[14px] font-semibold text-field hover:border-field">Open this plan in Planner</Link>}
      </div>
      <p className="mt-2 max-w-4xl text-[15px] text-ink">
        {priority === 'operational'
          ? 'The current rubric does not score machinery, labor, markets, or timing constraints. It cannot rank practical feasibility; check these with your farm team and local advisor.'
          : comparison.betterMatch === 'proposed'
            ? `${proposed.title} has the higher provisional weighted rubric score for this scenario. That is a comparison of indicators—not evidence that this plan will increase yield or profit.`
            : comparison.betterMatch === 'current'
              ? `Your current rotation has the higher provisional weighted rubric score for this scenario. That does not mean the proposed plan would fail; use the trade-offs and your local knowledge.`
              : 'The provisional scores are tied, incomplete, or too close to call. The rubric does not provide a clear recommendation for this scenario.'}
      </p>
      {topDifferences.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2 text-[13.5px]">
          {topDifferences.map((item) => <li key={item.label} className="rounded-full border border-field/20 bg-panel px-3 py-1">{item.label}: {item.delta > 0 ? '+' : ''}{item.delta} points for proposed</li>)}
        </ul>
      )}
      {(planLimitations.length > 0 || caveats.length > 0) && (
        <ul className="mt-3 space-y-1 text-[13.5px] text-ink-soft">
          {[...planLimitations, ...caveats].map((item) => <li key={item}>• {item}</li>)}
        </ul>
      )}
    </section>
  );
}

function rainfallExplanation(weather: ReturnType<typeof summarizeScenarioWeather>, rainfallPct: number) {
  if (rainfallPct === 0) return `With no rainfall adjustment, the modeled annual normal remains ${weather.baselineRainIn.toFixed(1)} inches. The chart repeats the same values; it does not represent a forecast.`;
  return `Scaling every month by ${rainfallPct > 0 ? '+' : ''}${rainfallPct}% changes the 12-month normal by ${weather.rainfallChangeIn > 0 ? '+' : ''}${weather.rainfallChangeIn.toFixed(1)} inches. The largest monthly difference is in ${weather.largestRainChangeMonth}. This even scaling is a sensitivity test—not a likely seasonal pattern or a runoff/soil-water model.`;
}

function temperatureExplanation(weather: ReturnType<typeof summarizeScenarioWeather>, temperatureDeltaC: number) {
  if (temperatureDeltaC === 0) return `The warmest historical-normal month is ${weather.warmestMonth} at ${weather.baselineWarmestTempF.toFixed(1)}°F. With no temperature adjustment, the scenario line overlaps it.`;
  return `Adding ${temperatureDeltaC > 0 ? '+' : ''}${temperatureDeltaC}°C shifts each monthly mean by ${weather.temperatureChangeF > 0 ? '+' : ''}${weather.temperatureChangeF.toFixed(1)}°F. The warmest normal month (${weather.warmestMonth}) becomes ${weather.adjustedWarmestTempF.toFixed(1)}°F in this illustration. No heat damage or crop-stage response is estimated.`;
}

function MethodologyDetails({ config, powerStatus, planLimitations }: { config: ScenarioConfig; powerStatus: string; planLimitations: string[] }) {
  return (
    <details className={PANEL}>
      <summary className="min-h-11 cursor-pointer content-center text-[16px] font-semibold">Data, assumptions, and limitations</summary>
      <div className="mt-3 space-y-3 text-[14px] text-ink-soft">
        <p><strong className="text-ink">Climate:</strong> NASA POWER 1991–2020 monthly normals are modeled for a coarse grid cell, not measured at this field. Current source status: {powerStatus}. The controls apply the same percentage or temperature shift to every month; they do not generate a forecast.</p>
        <p><strong className="text-ink">Rotation scores:</strong> Reuses the provisional Rotation Explorer rubric and the same farmer answers. Scores are directional placeholders awaiting agronomist review; they are not yield, revenue, erosion, pest-population, or water-use predictions.</p>
        <p><strong className="text-ink">Priority:</strong> {PRIORITY_EXPLANATIONS[config.priority]}</p>
        <p><strong className="text-ink">Growth stage:</strong> {STAGE_LABELS[config.growthStage]} is saved as context only and does not change the calculation.</p>
        {planLimitations.length > 0 && <div><strong className="text-ink">Planner schedule notes:</strong><ul className="mt-1 list-disc pl-5">{planLimitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></div>}
        <p><strong className="text-ink">Not in this prototype:</strong> Future climate projections, satellite vegetation/soil-moisture comparisons, economic or yield modeling, and personalized agronomic prescriptions.</p>
      </div>
    </details>
  );
}
