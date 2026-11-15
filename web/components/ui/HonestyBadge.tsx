import type { Honesty } from '@/lib/domain/types';
import { Badge, type BadgeIcon, type BadgeTone } from './Badge';

const STYLE: Record<Honesty, { tone: BadgeTone; icon: BadgeIcon }> = {
  Measured: { tone: 'positive', icon: 'check' },
  Estimated: { tone: 'info', icon: 'dot' },
  'Check this info': { tone: 'caution', icon: 'caution' },
};

const MEANING: Record<Honesty, string> = {
  Measured: 'Measured: a direct observation of this place.',
  Estimated: 'Estimated: modelled, or an average over a larger area.',
  'Check this info': 'Check this info: not verified yet. Please confirm or correct it.',
};

export function HonestyBadge({ honesty, className = '' }: { honesty: Honesty; className?: string }) {
  return (
    <Badge tone={STYLE[honesty].tone} icon={STYLE[honesty].icon} title={MEANING[honesty]} className={className}>
      {honesty}
    </Badge>
  );
}
