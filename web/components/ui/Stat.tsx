import type { ReactNode } from 'react';

const SIZES = {
  display: 'text-[clamp(2.25rem,6vw,3rem)] leading-none',
  lg: 'text-[2rem] leading-none',
  md: 'text-[1.5rem] leading-tight',
} as const;

const TONES = { neutral: 'text-ink', positive: 'text-field', negative: 'text-alert' } as const;

/** A key number: label above, big tabular value, one supporting line below. */
export function Stat({ label, value, sub, size = 'lg', tone = 'neutral', className = '', testId }: { label: ReactNode; value: ReactNode; sub?: ReactNode; size?: keyof typeof SIZES; tone?: keyof typeof TONES; className?: string; testId?: string }) {
  return (
    <div className={className} data-testid={testId}>
      <p className="text-[14.5px] font-semibold text-ink-soft">{label}</p>
      <p className={`font-plate mt-2 tabular-nums tracking-[-0.025em] ${SIZES[size]} ${TONES[tone]}`}>{value}</p>
      {sub && <div className="mt-2 text-[14.5px] leading-snug text-ink-soft">{sub}</div>}
    </div>
  );
}
