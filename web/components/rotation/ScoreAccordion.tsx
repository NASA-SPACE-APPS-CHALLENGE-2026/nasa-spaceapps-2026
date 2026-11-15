'use client';

import { useId, useState } from 'react';
import type { BarScore } from '@/lib/domain/rotation/score';
import { ScoreBar } from './ScoreBar';
import { ReasonList } from './Sources';

/** One score bar that expands to show why it got that score. Collapsed by default. */
export function ScoreAccordion({ bar }: { bar: BarScore }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const count = bar.reasons.length;
  return (
    <div className="rounded-parcel border border-line" data-testid={`score-${bar.id}`}>
      <div className="px-3 pt-3">
        <ScoreBar bar={bar} />
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-1.5 rounded-b-[var(--radius-parcel)] px-3 text-left text-[14.5px] font-semibold text-field hover:bg-field-tint"
      >
        <svg viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} aria-hidden>
          <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {open ? 'Hide why' : 'Why this score?'}
        <span className="sr-only"> for {bar.label}</span>
        {!open && count > 0 && <span className="font-normal text-ink-faint">({count} {count === 1 ? 'reason' : 'reasons'})</span>}
      </button>
      {open && (
        <div id={panelId} className="border-t border-line px-3 py-3">
          {count ? <ReasonList reasons={bar.reasons} /> : <p className="text-[14.5px] text-ink-soft">No adjustments for this score.</p>}
        </div>
      )}
    </div>
  );
}
