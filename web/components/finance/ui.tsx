'use client';

import { useEffect, useId, useState } from 'react';
import type { Confidence, Origin } from '@/lib/domain/finance/assumptions';

export const SECTION = 'rounded-[var(--radius-panel)] border border-line bg-panel p-4 lg:p-5';

export function Section({ id, title, confidence, children, aside }: { id: string; title: string; confidence?: Confidence; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} className={SECTION} data-testid={`section-${id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-h`} className="font-plate text-xl">
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {aside}
          {confidence && <ConfidenceBadge c={confidence} />}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const CONF: Record<Confidence, { label: string; cls: string }> = {
  high: { label: 'High confidence', cls: 'bg-field-tint text-field' },
  medium: { label: 'Medium confidence', cls: 'bg-sky-tint text-sky-deep' },
  low: { label: 'Low confidence', cls: 'bg-wheat-tint text-wheat-deep' },
};

export function ConfidenceBadge({ c }: { c: Confidence }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12.5px] font-semibold ${CONF[c].cls}`} title="How much of this result rests on your own numbers versus defaults">
      <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
        {c === 'high' ? <path d="m2.5 6.5 2.2 2.2L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : c === 'medium' ? <circle cx="6" cy="6" r="3" fill="currentColor" /> : <path d="M6 2.5v4.2M6 9.2v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
      </svg>
      {CONF[c].label}
    </span>
  );
}

export function OriginBadge({ origin }: { origin: Origin }) {
  return origin === 'default' ? (
    <span className="rounded-full border border-line px-2 py-0.5 text-[12px] font-semibold text-ink-faint">Default</span>
  ) : origin === 'nasa' ? (
    <span className="rounded-full bg-sky-tint px-2 py-0.5 text-[12px] font-semibold text-sky-deep">NASA data</span>
  ) : (
    <span className="rounded-full bg-field-tint px-2 py-0.5 text-[12px] font-semibold text-field">You entered</span>
  );
}

/**
 * Number input that commits on blur or Enter. Empty means "use the default" (shown as the placeholder).
 */
export function NumberField({
  label,
  value,
  placeholder,
  unit,
  onCommit,
  min,
  step = 'any',
  hint,
  testId,
}: {
  label: string;
  value: number | undefined;
  placeholder?: number | string;
  unit?: string;
  onCommit: (v: number | undefined) => void;
  min?: number;
  step?: number | 'any';
  hint?: string;
  testId?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => setText(value === undefined ? '' : String(value)), [value]);
  const commit = () => {
    const t = text.trim();
    if (t === '') return value !== undefined && onCommit(undefined);
    const n = Number(t);
    if (Number.isFinite(n) && (min === undefined || n >= min)) {
      if (n !== value) onCommit(n);
    } else setText(value === undefined ? '' : String(value));
  };
  return (
    <div>
      <label htmlFor={id} className="block text-[14.5px] font-semibold leading-snug">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={id}
          data-testid={testId}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          value={text}
          placeholder={placeholder === undefined ? '' : String(placeholder)}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className={`min-h-11 w-full min-w-0 rounded-[var(--radius-control)] border px-3 text-[16px] tabular-nums ${value !== undefined ? 'border-field bg-field-tint/40' : 'border-line-strong bg-panel'}`}
        />
        {unit && <span className="shrink-0 text-[13px] text-ink-soft">{unit}</span>}
      </div>
      {hint && <p className="mt-1 text-[13px] text-ink-faint">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[var(--radius-control)] border border-line-strong bg-paper p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`min-h-10 rounded-[8px] px-3 text-[14.5px] font-semibold ${o.value === value ? 'bg-panel text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
