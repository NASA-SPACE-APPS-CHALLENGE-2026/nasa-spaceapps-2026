import { cropBackground, cropCode, cropColor, cropInk } from '@/lib/domain/cropColors';
import { cropLabel } from '@/lib/domain/crops';
import type { CropRef } from '@/lib/domain/types';

/** Crop swatch with its code inside. Pair with the name (CropChip) unless the name is right next to it. */
export function CropSwatch({ crop, size = 'md', className = '' }: { crop: CropRef | null; size?: 'sm' | 'md'; className?: string }) {
  const dims = size === 'sm' ? 'h-4 min-w-6 text-[9.5px]' : 'h-6 min-w-8 text-[11px]';
  if (!crop) return <span className={`inline-flex shrink-0 rounded-[3px] border border-dashed border-line-strong ${dims} ${className}`} aria-hidden />;
  const edge = cropColor(crop) === '#e4ddcf' ? 'border border-line-strong' : '';
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-[3px] px-1 font-bold tracking-wide ${dims} ${edge} ${className}`} style={{ background: cropBackground(crop), color: cropInk(crop) }} aria-hidden>
      {cropCode(crop)}
    </span>
  );
}

/** Swatch plus crop name, used wherever a single crop is named (planner rows, overview, pickers). */
export function CropChip({ crop, sub, className = '' }: { crop: CropRef | null; sub?: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
      <CropSwatch crop={crop} />
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold leading-tight">{crop ? cropLabel(crop) : 'Not entered'}</span>
        {sub && <span className="block truncate text-[13px] leading-tight text-ink-soft">{sub}</span>}
      </span>
    </span>
  );
}
