import { COVER_COLOR } from '@/lib/domain/cropColors';
import { MONTH_SHORT } from '@/lib/domain/management';
import type { Strategy } from '@/lib/domain/rotation/strategies';
import { Badge } from '../ui/Badge';
import { CropSwatch } from '../ui/CropChip';
import { SeasonStripBlocks } from '../ui/RotationStrip';

/** The planned seasons as coded crop blocks, with a dotted cover-crop band where one is planned, then their names. */
export function SeasonStrip({ strategy }: { strategy: Strategy }) {
  const label = `Planned: ${strategy.seasons.map((s) => `${s.year} ${s.label}${s.cover ? ` then ${s.cover.pick.species.name}` : ''}`).join('; ')}`;
  return (
    <div>
      <SeasonStripBlocks
        size="lg"
        years={false}
        label={label}
        blocks={strategy.seasons.map((s) => ({ year: s.year, crop: { kind: 'catalog', id: s.ids[s.ids.length - 1] }, kind: 'past', cover: s.cover?.pick.species.name }))}
      />
      <ol className="mt-1.5 flex gap-[3px]" aria-hidden>
        {strategy.seasons.map((s) => (
          <li key={s.year} className="min-w-0 flex-1 text-[12.5px] leading-tight">
            <span className="block font-bold tabular-nums text-ink">{s.year}</span>
            <span className="block truncate text-ink-soft">{s.label}</span>
            {s.cover && (
              <span className="block truncate font-semibold" style={{ color: COVER_COLOR }}>
                + {s.cover.pick.species.name.toLowerCase()}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Season-by-season table for the strategy page. */
export function SeasonTable({ strategy }: { strategy: Strategy }) {
  return (
    <ol className="divide-y divide-line border-y border-line">
      {strategy.seasons.map((s) => (
        <li key={s.year} className="flex gap-4 py-4">
          <span className="w-14 shrink-0 text-[18px] font-bold tabular-nums">{s.year}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CropSwatch crop={{ kind: 'catalog', id: s.ids[s.ids.length - 1] }} />
              <p className="text-[16px] font-semibold">{s.label}</p>
              {s.changed && <Badge tone="caution">New</Badge>}
            </div>
            <ul className="mt-1.5 space-y-0.5 text-[14.5px] text-ink-soft">
              {s.crops.map((c) => (
                <li key={c.id}>
                  Plant {MONTH_SHORT[c.plant - 1]}
                  {c.plantYear !== s.year ? ` ${c.plantYear}` : ''}, harvest {MONTH_SHORT[c.harvest - 1]}
                  {c.perennial ? ' (stands all year)' : ''}
                </li>
              ))}
              {s.cover && (
                <li className="flex items-center gap-2">
                  <CropSwatch crop={{ kind: 'catalog', id: 'cover-crop' }} size="sm" />
                  <span>
                    {s.cover.pick.species.name}: seed {MONTH_SHORT[s.cover.plantMonth - 1]} {s.cover.plantYear},{' '}
                    {s.cover.pick.species.winterKills ? 'winter-kills' : `end ${MONTH_SHORT[s.cover.endMonth - 1]} ${s.cover.endYear}`}
                  </span>
                </li>
              )}
            </ul>
          </div>
        </li>
      ))}
    </ol>
  );
}
