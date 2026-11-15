import type { BarScore, Confidence } from '@/lib/domain/rotation/score';

const CONFIDENCE: Record<Confidence, string> = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };

/** One labelled 0–100 bar. The number and label are always shown, so meaning never depends on colour. */
export function ScoreBar({ bar, compact = false }: { bar: BarScore; compact?: boolean }) {
  const missing = bar.score === null;
  return (
    <div data-testid={`bar-${bar.id}`} data-score={bar.score ?? 'none'}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold">{bar.label}</span>
        <span className="text-[15px] tabular-nums">
          {missing ? <span className="font-semibold text-ink-soft">Not enough info</span> : <><strong className="font-bold">{bar.score}</strong><span className="text-ink-faint"> / 100</span></>}
        </span>
      </div>
      <div
        role="meter"
        aria-label={bar.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={missing ? undefined : bar.score!}
        aria-valuetext={missing ? 'Not enough information to score' : `${bar.score} out of 100, ${CONFIDENCE[bar.confidence].toLowerCase()}`}
        className={`relative mt-1 h-3 overflow-hidden rounded-full ${missing ? 'border border-dashed border-line-strong bg-paper' : 'bg-line/70'}`}
      >
        {!missing && <span className="absolute inset-y-0 left-0 rounded-full bg-field" style={{ width: `${bar.score}%` }} />}
      </div>
      {!compact && <p className="mt-0.5 text-[12.5px] text-ink-faint">{missing ? bar.missing.length ? `Needs ${bar.missing.join(', ')}` : '' : CONFIDENCE[bar.confidence]}</p>}
    </div>
  );
}
