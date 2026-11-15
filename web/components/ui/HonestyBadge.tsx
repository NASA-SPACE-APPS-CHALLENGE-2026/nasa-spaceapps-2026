import type { Honesty } from '@/lib/domain/types';

const STYLE: Record<Honesty, string> = {
  Measured: 'bg-field-tint text-field border-field/25',
  Estimated: 'bg-sky-tint text-sky-deep border-sky/25',
  'Check this info': 'bg-wheat-tint text-wheat-deep border-wheat/35',
};

const MEANING: Record<Honesty, string> = {
  Measured: 'Measured: a direct observation of this place.',
  Estimated: 'Estimated: modelled, or an average over a larger area.',
  'Check this info': 'Check this info: not verified yet. Please confirm or correct it.',
};

export function HonestyBadge({ honesty, className = '' }: { honesty: Honesty; className?: string }) {
  return (
    <span title={MEANING[honesty]} className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[12.5px] font-semibold ${STYLE[honesty]} ${className}`}>
      {honesty}
    </span>
  );
}
