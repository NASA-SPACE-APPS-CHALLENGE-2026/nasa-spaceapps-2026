import { cropColor } from '@/lib/domain/cropColors';
import { cropLabel } from '@/lib/domain/crops';
import type { FieldCrops } from '@/lib/domain/types';

/** Oldest → current season as a row of swatches. Detected-but-unconfirmed seasons are hatched. */
export function RotationStrip({ crops, size = 'sm' }: { crops: FieldCrops; size?: 'sm' | 'md' }) {
  const seasons = [...crops.history].reverse().concat(crops.current);
  const h = size === 'sm' ? 'h-2.5' : 'h-4';
  return (
    <div className="flex w-full gap-1" aria-label={`Rotation: ${seasons.map((s) => `${s.year} ${s.crop ? cropLabel(s.crop) : 'not entered'}`).join(', ')}`}>
      {seasons.map((s) => {
        const color = cropColor(s.crop);
        const detected = s.status === 'detected';
        return (
          <span
            key={s.year}
            title={`${s.year}: ${s.crop ? cropLabel(s.crop) : 'not entered'}${detected ? ' (detected, check this info)' : ''}`}
            className={`${h} flex-1 rounded-[3px] ${s.crop ? '' : 'border border-dashed border-line-strong'}`}
            style={
              s.crop
                ? detected
                  ? { backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 4px, ${color}55 4px 7px)` }
                  : { background: color }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
