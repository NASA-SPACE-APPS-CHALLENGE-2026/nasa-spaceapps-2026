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
import { TextField } from '../ui/TextField';

interface Props {
  field: Field;
  answers: RotationAnswers;
  onChange: (next: RotationAnswers) => void;
  onDone: () => void;
}

const STEPS = ['How you farm it', 'Cover crops & livestock', 'Small grains', 'Problems on this field', 'Harvest timing', 'Soil test (optional)'] as const;

/** One short screen per group of questions. Every change is saved straight away. */
export function Questionnaire({ field, answers, onChange, onDone }: Props) {
  const [step, setStep] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);
  const set = <K extends keyof RotationAnswers>(k: K, v: RotationAnswers[K]) => onChange({ ...answers, [k]: v });
  const last = step === STEPS.length - 1;

  return (
    <section aria-labelledby="q-heading" className="rounded-[var(--radius-panel)] border border-line bg-panel p-4 lg:p-6" data-testid="questionnaire">
      <p className="text-[14px] font-semibold text-ink-soft">
        Step {step + 1} of {STEPS.length}
      </p>
      <ol className="mt-2 flex gap-1" aria-hidden>
        {STEPS.map((s, i) => (
          <li key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-sky' : 'bg-line'}`} />
        ))}
      </ol>
      <h2 id="q-heading" ref={headingRef} tabIndex={-1} className="font-plate mt-4 text-2xl outline-none">
        {STEPS[step]}
      </h2>
      <p className="mt-1 text-[15px] text-ink-soft">
        About <strong className="text-ink">{field.name}</strong>. Skip anything you’re not sure of: missing answers lower the confidence, they never make a strategy look better.
      </p>

      <div className="mt-5 space-y-6">
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

      <div className="mt-8 flex flex-wrap items-center gap-2">
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        {!last && <Button onClick={() => setStep(step + 1)}>Next</Button>}
        <Button variant={last ? 'primary' : 'ghost'} onClick={onDone}>
          {last ? 'See strategies' : 'Skip to strategies'}
        </Button>
        <span className="text-[13.5px] text-ink-faint" role="status">
          Answers save automatically.
        </span>
      </div>
    </section>
  );
}

function Choice<T extends string>({ legend, hint, name, options, labels, value, onChange }: { legend: string; hint?: string; name: string; options: readonly T[]; labels: Record<T, string>; value: T | undefined; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <fieldset>
      <legend className="text-[16.5px] font-semibold">{legend}</legend>
      {hint && <p className="text-[14px] text-ink-faint">{hint}</p>}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2 text-[15.5px] ${value === o ? 'border-sky bg-sky-tint font-semibold' : 'border-line-strong bg-panel hover:border-sky'}`}>
            <input type="radio" name={`${id}-${name}`} value={o} checked={value === o} onChange={() => onChange(o)} className="h-5 w-5 accent-[var(--color-sky)]" />
            {labels[o]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Problems({ value, onChange }: { value: RotationAnswers['problems']; onChange: (v: RotationAnswers['problems']) => void }) {
  const picked = Array.isArray(value) ? value : [];
  const toggle = (p: Problem) => onChange(picked.includes(p) ? picked.filter((x) => x !== p) : [...picked, p]);
  const box = (checked: boolean) => `flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2 text-[15.5px] ${checked ? 'border-sky bg-sky-tint font-semibold' : 'border-line-strong bg-panel hover:border-sky'}`;
  return (
    <fieldset>
      <legend className="text-[16.5px] font-semibold">Which problems have you had on this field?</legend>
      <p className="text-[14px] text-ink-faint">Pick all that apply.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {PROBLEMS.map((p) => (
          <label key={p} className={box(picked.includes(p))}>
            <input type="checkbox" checked={picked.includes(p)} onChange={() => toggle(p)} className="h-5 w-5 accent-[var(--color-sky)]" />
            {PROBLEM_LABELS[p]}
          </label>
        ))}
        <label className={box(Array.isArray(value) && value.length === 0)}>
          <input type="checkbox" checked={Array.isArray(value) && value.length === 0} onChange={(e) => onChange(e.target.checked ? [] : undefined)} className="h-5 w-5 accent-[var(--color-sky)]" />
          None of these
        </label>
        <label className={box(value === 'unsure')}>
          <input type="checkbox" checked={value === 'unsure'} onChange={(e) => onChange(e.target.checked ? 'unsure' : undefined)} className="h-5 w-5 accent-[var(--color-sky)]" />
          Not sure
        </label>
      </div>
    </fieldset>
  );
}

function HarvestMonth({ field, value, onChange }: { field: Field; value: RotationAnswers['harvestMonth']; onChange: (v: RotationAnswers['harvestMonth']) => void }) {
  const id = useId();
  const crop = field.crops.current.crop;
  return (
    <div>
      <label htmlFor={id} className="block text-[16.5px] font-semibold">
        When do you usually harvest {crop ? cropLabel(crop).toLowerCase() : 'this season’s crop'} here?
      </label>
      <p className="text-[14px] text-ink-faint">This sets how much fall is left for a cover crop to grow.</p>
      <select
        id={id}
        value={value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'unsure' ? 'unsure' : Number(e.target.value))}
        className="mt-2 block min-h-12 w-full max-w-xs rounded-[var(--radius-control)] border border-line-strong bg-panel px-3 text-[16px]"
      >
        <option value="">Choose a month</option>
        {MONTH_NAMES.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
        <option value="unsure">Not sure</option>
      </select>
    </div>
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
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="rounded-[var(--radius-control)] border border-line bg-paper p-3">
      <summary className="min-h-11 cursor-pointer content-center text-[16px] font-semibold">Add results from a lab soil test</summary>
      <p className="mt-1 text-[14px] text-ink-soft">Optional. Your organic matter replaces the soil-survey estimate and is labelled “You entered”. pH, P and K are kept with the plan for reference.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <TextField label="Test date" type="date" value={st.date ?? ''} onChange={(e) => onChange({ ...st, date: e.target.value || undefined })} />
        <SoilNumber label="pH" hint="Usually 5.0–8.0" value={st.ph} step="0.1" onCommit={(raw) => num('ph', raw, 3, 10)} min={3} max={10} />
        <SoilNumber label="Organic matter (%)" hint="Usually 1–8 %" value={st.organicMatterPct} step="0.1" onCommit={(raw) => num('organicMatterPct', raw, 0, 30)} min={0} max={30} />
        <SoilNumber label="Phosphorus, P (ppm)" hint="Bray-1 or Mehlich-3" value={st.pPpm} step="1" onCommit={(raw) => num('pPpm', raw, 0, 500)} min={0} max={500} />
        <SoilNumber label="Potassium, K (ppm)" hint="Ammonium acetate or Mehlich-3" value={st.kPpm} step="1" onCommit={(raw) => num('kPpm', raw, 0, 2000)} min={0} max={2000} />
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
