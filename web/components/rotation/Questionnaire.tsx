'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  COVER_EXPERIENCE,
  COVER_LABELS,
  IRRIGATION,
  IRRIGATION_LABELS,
  MONTH_NAMES,
  PROBLEM_LABELS,
  PROBLEMS,
  TILLAGE,
  TILLAGE_LABELS,
  YES_NO,
  YES_NO_LABELS,
  hasSoilTest,
  type Problem,
  type RotationAnswers,
  type SoilTest,
} from '@/lib/domain/management';
import { cropLabel } from '@/lib/domain/crops';
import type { Field } from '@/lib/domain/types';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { TextField } from '../ui/TextField';
import { ChoiceIcon } from './choiceIcons';

interface Props {
  field: Field;
  answers: RotationAnswers;
  onChange: (next: RotationAnswers) => void;
  onDone: () => void;
}

const STEPS = ['How you farm it', 'Cover crops & livestock', 'Small grains', 'Problems on this field', 'Harvest timing', 'Soil test (optional)'] as const;
/** Short names for the step rail. */
const RAIL = ['Farming', 'Cover & livestock', 'Small grains', 'Problems', 'Harvest', 'Soil test'] as const;

/** A calm six-step wizard. Every change is saved straight away; any step can be revisited from the rail. */
export function Questionnaire({ field, answers, onChange, onDone }: Props) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);
  const go = (n: number) => {
    setDir(n >= step ? 1 : -1);
    setStep(n);
  };
  const set = <K extends keyof RotationAnswers>(k: K, v: RotationAnswers[K]) => onChange({ ...answers, [k]: v });
  const last = step === STEPS.length - 1;

  return (
    <section aria-labelledby="q-heading" className="rounded-parcel border border-line bg-panel" data-testid="questionnaire">
      {/* Step rail: names on wide screens, a compact progress bar on phones. */}
      <nav aria-label="Questions" className="border-b border-line px-4 py-3 lg:px-6">
        <p className="text-[14px] font-semibold text-ink-soft md:hidden">
          Step {step + 1} of {STEPS.length}: <span className="text-ink">{RAIL[step]}</span>
        </p>
        <div className="mt-2 flex gap-1 md:hidden" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-[2px] transition-colors ${i < step ? 'bg-field' : i === step ? 'bg-wheat' : 'bg-line'}`} />
          ))}
        </div>
        <ol className="hidden gap-1 md:flex">
          {RAIL.map((name, i) => {
            const current = i === step;
            const done = i < step;
            return (
              <li key={name} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={current ? 'step' : undefined}
                  className={`group flex w-full min-w-0 flex-col items-start gap-1.5 rounded-parcel px-1 pb-1 pt-0.5 text-left transition-colors hover:bg-field-tint/60`}
                >
                  <span className={`h-1.5 w-full rounded-[2px] transition-colors ${done ? 'bg-field' : current ? 'bg-wheat' : 'bg-line group-hover:bg-line-strong'}`} aria-hidden />
                  <span className={`flex w-full min-w-0 items-baseline gap-1.5 text-[13.5px] ${current ? 'font-bold text-ink' : done ? 'font-semibold text-field' : 'text-ink-soft'}`}>
                    <span className="tabular-nums">{i + 1}</span>
                    <span className="truncate">{name}</span>
                    {done && <span className="sr-only">(visited)</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div key={step} className={`px-4 py-6 lg:px-8 lg:py-8 ${dir === 1 ? 'motion-step' : 'motion-step-back'}`}>
        <h2 id="q-heading" ref={headingRef} tabIndex={-1} className="font-plate text-[26px]">
          {STEPS[step]}
        </h2>
        <p className="mt-2 max-w-2xl text-[15.5px] leading-relaxed text-ink-soft">
          About <strong className="text-ink">{field.name}</strong>. Skip anything you’re not sure of: missing answers never make a strategy look better.
        </p>

        <div className="mt-7 space-y-8">
          {step === 0 && (
            <>
              <Choice legend="How do you usually prepare this field?" name="tillage" options={TILLAGE} labels={TILLAGE_LABELS} value={answers.tillage} onChange={(v) => set('tillage', v)} />
              <Choice legend="Is this field irrigated?" name="irrigation" options={IRRIGATION} labels={IRRIGATION_LABELS} value={answers.irrigation} onChange={(v) => set('irrigation', v)} />
            </>
          )}
          {step === 1 && (
            <>
              <Choice legend="Have you grown cover crops before?" name="cover" options={COVER_EXPERIENCE} labels={COVER_LABELS} value={answers.coverExperience} onChange={(v) => set('coverExperience', v)} />
              <Choice legend="Do you keep livestock or need forage?" name="livestock" options={YES_NO} labels={YES_NO_LABELS} value={answers.livestock} onChange={(v) => set('livestock', v)} />
            </>
          )}
          {step === 2 && (
            <>
              <Choice legend="Do you have a grain drill and a small-grain combine head?" hint="Or someone you could hire to plant and harvest oats or wheat." name="equipment" options={YES_NO} labels={YES_NO_LABELS} value={answers.smallGrainEquipment} onChange={(v) => set('smallGrainEquipment', v)} />
              <Choice legend="Is there a local buyer for small grains?" hint="An elevator, feed mill, seed company or a neighbour with livestock." name="market" options={YES_NO} labels={YES_NO_LABELS} value={answers.smallGrainMarket} onChange={(v) => set('smallGrainMarket', v)} />
            </>
          )}
          {step === 3 && <Problems value={answers.problems} onChange={(v) => set('problems', v)} />}
          {step === 4 && <HarvestMonth field={field} value={answers.harvestMonth} onChange={(v) => set('harvestMonth', v)} />}
          {step === 5 && <SoilTestForm value={answers.soilTest} onChange={(v) => set('soilTest', v)} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-4 lg:px-8">
        {step > 0 && (
          <Button variant="secondary" onClick={() => go(step - 1)}>
            Back
          </Button>
        )}
        {!last && <Button onClick={() => go(step + 1)}>Next</Button>}
        <Button variant={last ? 'primary' : 'ghost'} onClick={onDone}>
          {last ? 'See strategies' : 'Skip to strategies'}
        </Button>
        <span className="ml-auto flex items-center gap-1.5 text-[13.5px] text-ink-soft" role="status">
          <svg viewBox="0 0 12 12" className="h-3 w-3 text-field" aria-hidden>
            <path d="m2.5 6.5 2.2 2.2L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Answers save automatically.
        </span>
      </div>
    </section>
  );
}

/** A large, tappable answer tile. The native input covers the whole tile (transparent), so it stays the real control. */
function Tile({ type, name, checked, onChange, group, value, children }: { type: 'radio' | 'checkbox'; name?: string; checked: boolean; onChange: (checked: boolean) => void; group: string; value: string; children: React.ReactNode }) {
  return (
    <label
      className={`relative flex min-h-16 cursor-pointer items-center gap-3 rounded-parcel border px-3 py-2.5 text-[15.5px] leading-snug transition-[background-color,border-color,box-shadow] duration-150 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-field ${
        checked ? 'border-field bg-field-tint font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-field)]' : 'border-line-strong bg-panel hover:border-field hover:bg-field-tint/40'
      }`}
    >
      <input type={type} name={name} value={value} checked={checked} onChange={(e) => onChange(e.target.checked)} className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-parcel opacity-0" />
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-parcel ${checked ? 'bg-field text-white' : 'bg-paper text-ink-soft'}`}>
        <ChoiceIcon group={group} value={value} />
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center ${type === 'radio' ? 'rounded-full' : 'rounded-[3px]'} border ${checked ? 'border-field bg-field text-white' : 'border-line-strong bg-panel'}`} aria-hidden>
        {checked && (
          <svg viewBox="0 0 12 12" className="h-3 w-3">
            <path d="m2.5 6.5 2.2 2.2L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </label>
  );
}

function Legend({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <>
      <legend className="text-[17px] font-semibold">{children}</legend>
      {hint && <p className="mt-0.5 text-[14.5px] text-ink-soft">{hint}</p>}
    </>
  );
}

function Choice<T extends string>({ legend, hint, name, options, labels, value, onChange }: { legend: string; hint?: string; name: string; options: readonly T[]; labels: Record<T, string>; value: T | undefined; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <fieldset>
      <Legend hint={hint}>{legend}</Legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <Tile key={o} type="radio" name={`${id}-${name}`} group={name} value={o} checked={value === o} onChange={() => onChange(o)}>
            {labels[o]}
          </Tile>
        ))}
      </div>
    </fieldset>
  );
}

function Problems({ value, onChange }: { value: RotationAnswers['problems']; onChange: (v: RotationAnswers['problems']) => void }) {
  const picked = Array.isArray(value) ? value : [];
  const toggle = (p: Problem) => onChange(picked.includes(p) ? picked.filter((x) => x !== p) : [...picked, p]);
  return (
    <fieldset>
      <Legend hint="Pick all that apply.">Which problems have you had on this field?</Legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {PROBLEMS.map((p) => (
          <Tile key={p} type="checkbox" group="problems" value={p} checked={picked.includes(p)} onChange={() => toggle(p)}>
            {PROBLEM_LABELS[p]}
          </Tile>
        ))}
        <Tile type="checkbox" group="problems" value="none" checked={Array.isArray(value) && value.length === 0} onChange={(c) => onChange(c ? [] : undefined)}>
          None of these
        </Tile>
        <Tile type="checkbox" group="problems" value="unsure" checked={value === 'unsure'} onChange={(c) => onChange(c ? 'unsure' : undefined)}>
          Not sure
        </Tile>
      </div>
    </fieldset>
  );
}

function HarvestMonth({ field, value, onChange }: { field: Field; value: RotationAnswers['harvestMonth']; onChange: (v: RotationAnswers['harvestMonth']) => void }) {
  const crop = field.crops.current.crop;
  return (
    <Select
      label={<span className="text-[17px]">When do you usually harvest {crop ? cropLabel(crop).toLowerCase() : 'this season’s crop'} here?</span>}
      hint="This sets how much fall is left for a cover crop to grow."
      value={value === undefined ? '' : String(value)}
      onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'unsure' ? 'unsure' : Number(e.target.value))}
      className="max-w-sm"
    >
      <option value="">Choose a month</option>
      {MONTH_NAMES.map((m, i) => (
        <option key={m} value={i + 1}>
          {m}
        </option>
      ))}
      <option value="unsure">Not sure</option>
    </Select>
  );
}

function SoilTestForm({ value, onChange }: { value: SoilTest | undefined; onChange: (v: SoilTest | undefined) => void }) {
  const st = value ?? {};
  const [open, setOpen] = useState(hasSoilTest({ soilTest: value }));
  const num = (k: keyof Omit<SoilTest, 'date'>, raw: string, min: number, max: number) => {
    const next: SoilTest = { ...st };
    if (raw.trim() === '') delete next[k];
    else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < min || n > max) return;
      next[k] = n;
    }
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="group rounded-parcel border border-line-strong bg-panel">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 text-[16px] font-semibold hover:bg-field-tint/40 [&::-webkit-details-marker]:hidden">
        <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-field transition-transform group-open:rotate-90" aria-hidden>
          <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        Add results from a lab soil test
      </summary>
      <div className="border-t border-line px-4 pb-4 pt-3">
        <p className="text-[14.5px] text-ink-soft">Optional. Your organic matter replaces the soil-survey value and is labelled “You entered”. pH, P and K are kept with the plan for reference.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField label="Test date" type="date" value={st.date ?? ''} onChange={(e) => onChange({ ...st, date: e.target.value || undefined })} />
          <SoilNumber label="pH" hint="Usually 5.0–8.0" value={st.ph} step="0.1" onCommit={(raw) => num('ph', raw, 3, 10)} min={3} max={10} />
          <SoilNumber label="Organic matter (%)" hint="Usually 1–8 %" value={st.organicMatterPct} step="0.1" onCommit={(raw) => num('organicMatterPct', raw, 0, 30)} min={0} max={30} />
          <SoilNumber label="Phosphorus, P (ppm)" hint="Bray-1 or Mehlich-3" value={st.pPpm} step="1" onCommit={(raw) => num('pPpm', raw, 0, 500)} min={0} max={500} />
          <SoilNumber label="Potassium, K (ppm)" hint="Ammonium acetate or Mehlich-3" value={st.kPpm} step="1" onCommit={(raw) => num('kPpm', raw, 0, 2000)} min={0} max={2000} />
        </div>
      </div>
    </details>
  );
}

function SoilNumber({ label, hint, value, step, min, max, onCommit }: { label: string; hint: string; value: number | undefined; step: string; min: number; max: number; onCommit: (raw: string) => void }) {
  const [raw, setRaw] = useState(value === undefined ? '' : String(value));
  const n = Number(raw);
  const error = raw.trim() !== '' && (!Number.isFinite(n) || n < min || n > max) ? `Enter a number from ${min} to ${max}.` : undefined;
  return (
    <TextField
      label={label}
      hint={hint}
      error={error}
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      max={max}
      value={raw}
      onChange={(e) => {
        setRaw(e.target.value);
        onCommit(e.target.value);
      }}
    />
  );
}
