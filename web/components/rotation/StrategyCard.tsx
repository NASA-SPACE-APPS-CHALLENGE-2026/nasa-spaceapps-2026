import Link from 'next/link';
import type { Confidence, StrategyScore } from '@/lib/domain/rotation/score';
import { Badge } from '../ui/Badge';
import { buttonClass } from '../ui/Button';
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

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const CONF_TAG: Record<Confidence, { label: string; tone: 'positive' | 'neutral' | 'caution'; icon: 'check' | 'dot' | 'caution' }> = {
  high: { label: 'High confidence', tone: 'positive', icon: 'check' },
  medium: { label: 'Medium confidence', tone: 'neutral', icon: 'dot' },
  low: { label: 'Low confidence', tone: 'caution', icon: 'caution' },
};

/** The card's confidence is its least certain scored bar: a calm tag, never an alarm. */
function cardConfidence(s: StrategyScore): Confidence | null {
  const scored = s.bars.filter((b) => b.score !== null);
  if (!scored.length) return null;
  return scored.reduce<Confidence>((lo, b) => (RANK[b.confidence] < RANK[lo] ? b.confidence : lo), 'high');
}

export function StrategyCard({ s, best, fieldId }: { s: StrategyScore; best: boolean; fieldId: string }) {
  const headingId = `strategy-${s.strategy.id}`;
  const conf = cardConfidence(s);
  return (
    <article
      aria-labelledby={headingId}
      data-testid={`strategy-${s.strategy.id}`}
      className={`flex flex-col rounded-parcel bg-panel p-5 ${best ? 'border-2 border-field' : 'border border-line'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={headingId} className="font-plate text-[21px]">
          {s.strategy.title}
        </h3>
        {best && (
          <Badge tone="solid" icon="check" testId="best-fit">
            Best fit
          </Badge>
        )}
      </div>
      <p className="mt-1.5 text-[15px] leading-snug text-ink-soft">{s.strategy.summary}</p>

      <div className="mt-4">
        <SeasonStrip strategy={s.strategy} />
      </div>

      <div className="mt-5 border-t border-line pt-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[14px] font-semibold text-ink">Scorecard</h4>
          {conf && (
            <Badge tone={CONF_TAG[conf].tone} icon={CONF_TAG[conf].icon} title="The least certain of the four scores">
              {CONF_TAG[conf].label}
            </Badge>
          )}
        </div>
        <div className="mt-1">
          {s.bars.map((b) => (
            <ScoreBar key={b.id} bar={b} compact />
          ))}
        </div>
        <p className="mt-2 flex items-baseline justify-between border-t border-dashed border-line pt-2 text-[14px] text-ink-soft">
          Average
          <strong className="font-plate text-[22px] tabular-nums text-ink">{s.overall ?? <span className="text-[14px] font-semibold text-ink-soft">not enough info</span>}</strong>
        </p>
      </div>

      <div className="mt-4 border-t border-line pt-3">
        <h4 className="text-[14px] font-semibold text-ink">Main reasons</h4>
        <div className="mt-2">
          <ReasonList reasons={topReasons(s)} showSources={false} />
        </div>
        {s.caveats.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-[14px] leading-snug text-wheat-deep">
            {s.caveats.slice(0, 2).map((c, i) => (
              <li key={i} className="flex gap-2">
                <svg viewBox="0 0 12 12" className="mt-1 h-3 w-3 shrink-0" aria-hidden>
                  <path d="M6 2.5v4.2M6 9.2v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                {c.text}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-auto pt-5">
        <Link href={`/rotation/${s.strategy.id}?field=${fieldId}`} className={buttonClass(best ? 'primary' : 'secondary', 'md', 'w-full')}>
          See the details<span className="sr-only"> for {s.strategy.title}</span>
        </Link>
      </div>
    </article>
  );
}
