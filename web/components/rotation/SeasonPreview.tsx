import { cropColor } from '@/lib/domain/cropColors';
import { MONTH_SHORT } from '@/lib/domain/management';
import type { Strategy } from '@/lib/domain/rotation/strategies';

/** The planned seasons as swatches, with a teal marker where a cover crop is planned. */
export function SeasonStrip({ strategy }: { strategy: Strategy }) {
  return (
    <ol className="flex gap-1" aria-label={`Planned: ${strategy.seasons.map((s) => `${s.year} ${s.label}${s.cover ? ` then ${s.cover.pick.species.name}` : ''}`).join('; ')}`}>
      {strategy.seasons.map((s) => (
        <li key={s.year} className="min-w-0 flex-1" aria-hidden>
          <div className="flex h-4 overflow-hidden rounded-[3px]">
            <span className="flex-1" style={{ background: cropColor({ kind: 'catalog', id: s.ids[s.ids.length - 1] }) }} />
            {s.cover && <span className="w-1/3 bg-[#2f9a86]" />}
          </div>
          <p className="mt-1 truncate text-[12.5px] text-ink-soft">
            <span className="font-semibold text-ink">{s.year}</span> {s.label}
            {s.cover && <span className="block truncate text-[#1f6f60]">+ {s.cover.pick.species.name.toLowerCase()}</span>}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** Season-by-season table for the strategy page. */
export function SeasonTable({ strategy }: { strategy: Strategy }) {
  return (
    <ol className="space-y-3">
      {strategy.seasons.map((s) => (
        <li key={s.year} className="rounded-parcel border border-line p-3">
          <div className="flex items-center gap-2">
            <span className="h-4 w-4 shrink-0 rounded-[3px]" style={{ background: cropColor({ kind: 'catalog', id: s.ids[s.ids.length - 1] }) }} aria-hidden />
            <p className="text-[16px] font-semibold">
              {s.year}: {s.label}
            </p>
            {s.changed && <span className="rounded-full bg-wheat-tint px-2 py-0.5 text-[12.5px] font-semibold text-wheat-deep">New</span>}
          </div>
          <ul className="mt-1 space-y-0.5 pl-6 text-[14.5px] text-ink-soft">
            {s.crops.map((c) => (
              <li key={c.id}>
                Plant {MONTH_SHORT[c.plant - 1]}
                {c.plantYear !== s.year ? ` ${c.plantYear}` : ''}, harvest {MONTH_SHORT[c.harvest - 1]}
                {c.perennial ? ' (stands all year)' : ''}
              </li>
            ))}
            {s.cover && (
              <li className="text-[#1f6f60]">
                {s.cover.pick.species.name}: seed {MONTH_SHORT[s.cover.plantMonth - 1]} {s.cover.plantYear},{' '}
                {s.cover.pick.species.winterKills ? 'winter-kills' : `end ${MONTH_SHORT[s.cover.endMonth - 1]} ${s.cover.endYear}`}
              </li>
            )}
          </ul>
        </li>
      ))}
    </ol>
  );
}
