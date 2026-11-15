import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'positive' | 'caution' | 'info' | 'danger' | 'solid';

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-line-strong bg-panel text-ink-soft',
  positive: 'border-field/25 bg-field-tint text-field',
  caution: 'border-wheat/45 bg-wheat-tint text-wheat-deep',
  info: 'border-furrow/30 bg-furrow-tint text-[#5c4a33]',
  danger: 'border-alert/30 bg-alert-tint text-alert',
  solid: 'border-field bg-field text-white',
};

export type BadgeIcon = 'check' | 'dot' | 'caution' | 'none';

function Icon({ icon }: { icon: BadgeIcon }) {
  if (icon === 'none') return null;
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0" aria-hidden>
      {icon === 'check' ? (
        <path d="m2.5 6.5 2.2 2.2L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ) : icon === 'dot' ? (
        <circle cx="6" cy="6" r="2.6" fill="currentColor" />
      ) : (
        <path d="M6 2.8v3.6M6 8.9v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}

/** Small parcel-shaped tag. The text always carries the meaning; tone and icon only reinforce it. */
export function Badge({ tone = 'neutral', icon = 'none', title, className = '', children, testId }: { tone?: BadgeTone; icon?: BadgeIcon; title?: string; className?: string; children: ReactNode; testId?: string }) {
  return (
    <span title={title} data-testid={testId} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-parcel border px-1.5 py-0.5 text-[12.5px] font-semibold leading-tight ${TONES[tone]} ${className}`}>
      <Icon icon={icon} />
      {children}
    </span>
  );
}
