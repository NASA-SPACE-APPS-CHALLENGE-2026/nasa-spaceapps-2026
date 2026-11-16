import type { BarScore } from '@/lib/domain/rotation/score';

/**
 * One labelled 0–100 bar. The number and label are always shown, so meaning never depends on colour.
 * `compact` is the scorecard row used on strategy cards: label, bar and number on one line.
 */
export function ScoreBar({ bar, compact = false }: { bar: BarScore; compact?: boolean }) {
  const missing = bar.score === null;
  const meter = (
    <div
      role="meter"
      aria-label={bar.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={missing ? undefined : bar.score!}
      aria-valuetext={missing ? 'Not enough information to score' : `${bar.score} out of 100`}
      className={`relative h-2 overflow-hidden rounded-[2px] ${missing ? 'border border-dashed border-line-strong bg-paper' : 'bg-line/70'}`}
    >
      {!missing && <span className="absolute inset-y-0 left-0 rounded-[2px] bg-field" style={{ width: `${bar.score}%` }} />}
      {/* quarter ticks, like furrows */}
      {!missing && [25, 50, 75].map((t) => <span key={t} className="absolute inset-y-0 w-px bg-panel/70" style={{ left: `${t}%` }} aria-hidden />)}
    </div>
  );

  if (compact) {
    return (
      <div data-testid={`bar-${bar.id}`} data-score={bar.score ?? 'none'} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_2.75rem] items-center gap-3 py-1.5">
        <span className="truncate text-[14px] text-ink-soft">{bar.label}</span>
        {meter}
        <span className="text-right text-[15px] font-bold tabular-nums">{missing ? <span className="text-[13px] font-semibold text-ink-faint">n/a</span> : bar.score}</span>
      </div>
    );
  }

  return (
    <div data-testid={`bar-${bar.id}`} data-score={bar.score ?? 'none'}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold">{bar.label}</span>
        <span className="text-[15px] tabular-nums">
          {missing ? <span className="font-semibold text-ink-soft">Not enough info</span> : <><strong className="font-bold">{bar.score}</strong><span className="text-ink-faint"> / 100</span></>}
        </span>
      </div>
      <div className="mt-1.5">{meter}</div>
      {missing && bar.missing.length > 0 && <p className="mt-1 text-[12.5px] text-ink-soft">Needs {bar.missing.join(', ')}</p>}
    </div>
  );
}
