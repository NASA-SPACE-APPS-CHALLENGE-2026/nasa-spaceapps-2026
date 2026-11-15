import Link from 'next/link';
import type { StrategyScore } from '@/lib/domain/rotation/score';
import { ScoreBar } from './ScoreBar';
import { SeasonStrip } from './SeasonPreview';
import { ReasonList } from './Sources';

/** Summary reasons: how much of the year the soil is covered, then the adjustments that moved the scores most. */
export function topReasons(s: StrategyScore, n = 3) {
  const all = s.bars.flatMap((b) => b.reasons);
  const cover = s.bars.find((b) => b.id === 'soilCover')?.reasons.find((r) => r.headline);
  const moved = all.filter((r) => r.effect !== undefined && Math.abs(r.effect) >= 5).sort((a, b) => Math.abs(b.effect!) - Math.abs(a.effect!));
  return [...(cover ? [cover] : []), ...moved].slice(0, n);
}

export function StrategyCard({ s, best, fieldId }: { s: StrategyScore; best: boolean; fieldId: string }) {
  const headingId = `strategy-${s.strategy.id}`;
  return (
    <article
      aria-labelledby={headingId}
      data-testid={`strategy-${s.strategy.id}`}
      className={`flex flex-col rounded-parcel border bg-panel p-4 ${best ? 'border-field shadow-[0_0_0_2px_var(--color-field)]' : 'border-line'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={headingId} className="font-plate text-xl">
          {s.strategy.title}
        </h3>
        {best && (
          <span className="inline-flex items-center gap-1 rounded-full bg-field px-2.5 py-1 text-[13px] font-bold text-white" data-testid="best-fit">
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden>
              <path d="m4.5 10.5 3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Best fit
          </span>
        )}
      </div>
      <p className="mt-1 text-[15px] leading-snug text-ink-soft">{s.strategy.summary}</p>
      <div className="mt-3">
        <SeasonStrip strategy={s.strategy} />
      </div>
      <div className="mt-4 space-y-3">
        {s.bars.map((b) => (
          <ScoreBar key={b.id} bar={b} />
        ))}
      </div>
      <p className="mt-3 text-[14px] text-ink-soft">
        Average: <strong className="text-ink">{s.overall ?? 'not enough info'}</strong>
      </p>
      <div className="mt-4 border-t border-line pt-3">
        <h4 className="text-[14px] font-semibold text-ink-soft">Main reasons</h4>
        <div className="mt-2">
          <ReasonList reasons={topReasons(s)} showSources={false} />
        </div>
        {s.caveats.length > 0 && (
          <ul className="mt-3 space-y-1 text-[14px] text-wheat-deep">
            {s.caveats.slice(0, 2).map((c, i) => (
              <li key={i}>• {c.text}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-auto pt-4">
        <Link
          href={`/rotation/${s.strategy.id}?field=${fieldId}`}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-parcel border border-line-strong bg-panel px-4 text-[15px] font-semibold text-ink hover:border-field hover:text-field"
        >
          See the details<span className="sr-only"> for {s.strategy.title}</span>
        </Link>
      </div>
    </article>
  );
}
