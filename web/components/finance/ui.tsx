'use client';

import { useEffect, useId, useState } from 'react';
import type { Origin } from '@/lib/domain/finance/assumptions';
import { Badge } from '../ui/Badge';
import { Section as PageSection } from '../ui/Panel';
import { SegmentedControl } from '../ui/SegmentedControl';
import { HINT, INPUT, PANEL } from '../ui/styles';

/** A raised panel, for the few blocks that stand on their own (simulator inputs, side panels). */
export const SECTION = `${PANEL} p-4 lg:p-6`;

/** A results section: title row with optional controls, separated by a field-edge rule. */
export function Section({ id, title, children, aside }: { id: string; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <PageSection id={id} title={title} testId={`section-${id}`} aside={aside}>
      {children}
    </PageSection>
  );
}

export function OriginBadge({ origin }: { origin: Origin }) {
  return origin === 'default' ? <Badge tone="neutral">Default</Badge> : origin === 'nasa' ? <Badge tone="info">NASA data</Badge> : <Badge tone="positive">You entered</Badge>;
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
          className={`${INPUT} min-h-11 min-w-0 tabular-nums ${value !== undefined ? 'border-field bg-field-tint/50' : ''}`}
        />
        {unit && <span className="shrink-0 text-[13.5px] text-ink-soft">{unit}</span>}
      </div>
      {hint && <p className={HINT}>{hint}</p>}
    </div>
  );
}

/** Kept for existing imports; the shared control lives in ui/SegmentedControl. */
export function Segmented<T extends string | number>(props: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return <SegmentedControl {...props} />;
}
