import { CITATIONS } from '@/lib/domain/rotation/citations';
import type { InputHonesty } from '@/lib/domain/rotation/inputs';
import type { Reason, ReasonSource } from '@/lib/domain/rotation/score';
import { HonestyBadge } from '../ui/HonestyBadge';

export function InputBadge({ honesty }: { honesty: InputHonesty }) {
  if (honesty === 'You entered') {
    return <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-line-strong bg-paper px-2 py-0.5 text-[12.5px] font-semibold text-ink-soft">You entered</span>;
  }
  return <HonestyBadge honesty={honesty} />;
}

function SourceItem({ s }: { s: ReasonSource }) {
  switch (s.kind) {
    case 'citation': {
      const c = CITATIONS[s.id];
      return (
        <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-sky-deep underline decoration-sky/40 underline-offset-2 hover:decoration-sky-deep">
          {c.publisher}: {c.title}
        </a>
      );
    }
    case 'data':
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span>
            {s.provider}: {s.label} <strong className="font-semibold text-ink">{s.display}</strong>
          </span>
          <InputBadge honesty={s.honesty} />
        </span>
      );
    case 'answer':
      return (
        <span>
          Your answer to “{s.question}”: <strong className="font-semibold text-ink">{s.answer}</strong>
        </span>
      );
    case 'history':
      return <span>{s.text}</span>;
  }
}

export function SourceList({ sources }: { sources: ReasonSource[] }) {
  return (
    <ul className="mt-1 space-y-0.5 text-[13.5px] leading-snug text-ink-faint">
      {sources.map((s, i) => (
        <li key={i} className="flex gap-1.5">
          <span aria-hidden>↳</span>
          <span className="min-w-0">
            <span className="sr-only">Source: </span>
            <SourceItem s={s} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function EffectChip({ effect }: { effect?: number }) {
  if (!effect) return null;
  const v = Math.round(effect);
  if (v === 0) return null;
  return (
    <span className={`inline-flex min-w-11 shrink-0 justify-center rounded-full px-2 py-0.5 text-[12.5px] font-bold ${v > 0 ? 'bg-field-tint text-field' : 'bg-alert-tint text-alert'}`}>
      <span className="sr-only">{v > 0 ? 'adds' : 'subtracts'} </span>
      {v > 0 ? `+${v}` : `−${Math.abs(v)}`}
    </span>
  );
}

export function ReasonList({ reasons, showSources = true }: { reasons: Reason[]; showSources?: boolean }) {
  return (
    <ul className="space-y-3">
      {reasons.map((r, i) => (
        <li key={i}>
          <div className="flex items-start gap-2">
            <EffectChip effect={r.effect} />
            <p className="min-w-0 text-[15px] leading-snug">{r.text}</p>
          </div>
          {showSources && <SourceList sources={r.sources} />}
        </li>
      ))}
    </ul>
  );
}
