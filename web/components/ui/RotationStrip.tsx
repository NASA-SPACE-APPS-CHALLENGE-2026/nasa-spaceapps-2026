import { COVER_COLOR, cropBackground, cropCode, cropColor, cropInk } from '@/lib/domain/cropColors';
import { cropLabel } from '@/lib/domain/crops';
import type { CropRef, FieldCrops } from '@/lib/domain/types';

export interface SeasonBlock {
  year: number;
  crop: CropRef | null;
  /** past and current come from the field's history; planned from a plan; detected = satellite guess not confirmed yet. */
  kind: 'past' | 'current' | 'planned';
  detected?: boolean;
  /** Cover crop name sown after this season's crop. */
  cover?: string;
}

export type StripSize = 'sm' | 'md' | 'lg';

const HEIGHT: Record<StripSize, string> = { sm: 'h-3', md: 'h-7', lg: 'h-11' };

function describe(b: SeasonBlock): string {
  const crop = b.crop ? cropLabel(b.crop) : 'not entered';
  return `${b.year} ${crop}${b.cover ? ` then ${b.cover}` : ''}${b.detected ? ' (detected, check this info)' : ''}${b.kind === 'planned' ? ' (planned)' : ''}`;
}

/**
 * Seasons drawn as a row of parcels, oldest first: crop colour + crop code inside, year below.
 * The current season has a dark field-edge outline; detected seasons are hatched; planned seasons are dashed.
 */
export function SeasonStripBlocks({ blocks, size = 'md', years = size !== 'sm', label, className = '' }: { blocks: SeasonBlock[]; size?: StripSize; years?: boolean; label?: string; className?: string }) {
  return (
    <div className={className} role="img" aria-label={label ?? `Rotation: ${blocks.map(describe).join(', ')}`}>
      <div className="flex w-full gap-[3px]">
        {blocks.map((b) => {
          const color = cropColor(b.crop);
          const current = b.kind === 'current';
          const planned = b.kind === 'planned';
          const empty = !b.crop;
          const style = empty
            ? undefined
            : b.detected
              ? { backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 5px, ${color}66 5px 9px)`, color: cropInk(b.crop) }
              : { background: cropBackground(b.crop), color: cropInk(b.crop) };
          return (
            <span
              key={`${b.year}-${b.kind}`}
              title={describe(b)}
              className={`relative flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded-[3px] ${HEIGHT[size]} ${
                empty ? 'border border-dashed border-line-strong bg-panel' : ''
              } ${planned && !empty ? 'opacity-80 outline-1 outline-offset-[-1px] outline-dashed outline-ink/45' : ''} ${color === '#e4ddcf' ? 'border border-line-strong' : ''} ${
                current ? 'outline-2 outline-offset-1 outline-ink' : ''
              }`}
              style={style}
            >
              {size !== 'sm' && !empty && <span className={`truncate px-1 font-bold tracking-wide ${size === 'lg' ? 'text-[13px]' : 'text-[11px]'}`}>{cropCode(b.crop)}</span>}
              {size !== 'sm' && empty && <span className="text-[11px] font-semibold text-ink-faint">?</span>}
              {b.cover && (
                <span
                  className="absolute inset-y-0 right-0 w-[22%] border-l border-white/60"
                  style={{ background: `radial-gradient(circle at 3px 3px, rgb(255 255 255 / 0.4) 1.2px, transparent 1.6px) 0 0 / 6px 6px, ${COVER_COLOR}` }}
                />
              )}
            </span>
          );
        })}
      </div>
      {years && (
        <div className="mt-1 flex w-full gap-[3px]">
          {blocks.map((b) => (
            <span key={`${b.year}-${b.kind}`} className={`min-w-0 flex-1 truncate text-center text-[12px] tabular-nums ${b.kind === 'current' ? 'font-bold text-ink' : 'text-ink-faint'}`}>
              {b.year}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** A field's own history: oldest season to the current one. */
export function fieldBlocks(crops: FieldCrops): SeasonBlock[] {
  return [...crops.history]
    .reverse()
    .map<SeasonBlock>((s) => ({ year: s.year, crop: s.crop, kind: 'past', detected: s.status === 'detected' }))
    .concat({ year: crops.current.year, crop: crops.current.crop, kind: 'current', detected: crops.current.status === 'detected' });
}

/** Oldest → current season of a field. */
export function RotationStrip({ crops, size = 'sm', years, className }: { crops: FieldCrops; size?: StripSize; years?: boolean; className?: string }) {
  return <SeasonStripBlocks blocks={fieldBlocks(crops)} size={size} years={years} className={className} />;
}

/** Code + crop name legend line, so colours are always explained next to a strip. */
export function stripLegend(blocks: SeasonBlock[]): string {
  const seen = new Map<string, string>();
  for (const b of blocks) if (b.crop) seen.set(cropCode(b.crop), cropLabel(b.crop));
  return [...seen].map(([code, name]) => `${code} ${name}`).join(', ');
}
