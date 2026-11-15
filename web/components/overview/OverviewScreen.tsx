'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { bboxOf } from '@/lib/domain/acreage';
import { cropColor } from '@/lib/domain/cropColors';
import { cropLabel } from '@/lib/domain/crops';
import { activePlan, fieldAcres, upcomingTasks } from '@/lib/domain/finance/farm';
import { MONTH_NAMES } from '@/lib/domain/management';
import type { CropRef, Field, FieldProfile, Plan, SourceId } from '@/lib/domain/types';
import { useFarm } from '@/lib/client/StoreProvider';
import { useFarmAnalysis } from '@/lib/client/useFarmAnalysis';
import { Headline } from '../finance/FinanceResults';
import { SECTION } from '../finance/ui';
import { NoFieldsYet } from '../ui/FieldPicker';

function value(profile: FieldProfile | undefined, source: SourceId, key: string): number | string | undefined {
  const r = profile?.sources[source];
  if (!r || r.status !== 'ok') return undefined;
  return r.values.find((v) => v.key === key)?.value;
}

function num(profile: FieldProfile | undefined, source: SourceId, key: string): number | undefined {
  const v = value(profile, source, key);
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Acre-weighted average of one value across the fields that have it. */
function weighted(fields: Field[], profiles: Record<string, FieldProfile>, pick: (p: FieldProfile | undefined) => number | undefined) {
  let sum = 0;
  let acres = 0;
  let n = 0;
  for (const f of fields) {
    const v = pick(profiles[f.id]?.geometryHash === f.geometryHash ? profiles[f.id] : undefined);
    if (v === undefined) continue;
    sum += v * f.areaM2;
    acres += f.areaM2;
    n++;
  }
  return n ? { value: sum / acres, count: n } : null;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function OverviewScreen() {
  const { fields, profiles, plans, finance, loaded } = useFarm();
  const { analysis, planned } = useFarmAnalysis();
  const live = (f: Field) => (profiles[f.id]?.geometryHash === f.geometryHash ? profiles[f.id] : undefined);

  const metrics = useMemo(() => {
    const sm = weighted(fields, profiles, (p) => num(p, 'smap', 'smapLatest'));
    const satRain = weighted(fields, profiles, (p) => num(p, 'imerg', 'imergRain30'));
    const powerRain = weighted(fields, profiles, (p) => num(p, 'power', 'rain30'));
    const normal = weighted(fields, profiles, (p) => num(p, 'power', 'rainNormal'));
    const high = weighted(fields, profiles, (p) => num(p, 'power', 'avgHigh'));
    const low = weighted(fields, profiles, (p) => num(p, 'power', 'avgLow'));
    const diff = weighted(fields, profiles, (p) => {
      const v = value(p, 'power', 'tempVsNormal');
      return v === undefined ? undefined : Number(v);
    });
    const gdd = weighted(fields, profiles, (p) => num(p, 'power', 'gdd30'));
    return { sm, rain: satRain ?? powerRain, rainFromSatellite: !!satRain, normal, high, low, diff, gdd };
  }, [fields, profiles]);

  const upcoming = useMemo(() => upcomingTasks(fields, plans, new Date()), [fields, plans]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 lg:py-8">
        <header>
          <h1 className="font-plate text-3xl">Overview</h1>
          <p className="mt-1 text-[16px] text-ink-soft">Your farm at a glance: conditions now, your fields, and the rotation you are planning.</p>
        </header>
        {!loaded ? (
          <p role="status">Loading your farm…</p>
        ) : !fields.length ? (
          <NoFieldsYet what="Overview" text="Your overview fills in once you add a field: conditions, crops and your plans." />
        ) : (
          <>
            <section aria-label="Key conditions" className="grid gap-3 sm:grid-cols-3" data-testid="overview-metrics">
              <Metric
                title="Soil moisture"
                main={metrics.sm ? `${Math.round(metrics.sm.value)}%` : '–'}
                sub={metrics.sm ? `${moistureWord(metrics.sm.value)} topsoil` : 'Not available yet'}
                foot={metrics.sm && fields.length > 1 ? `Average of ${metrics.sm.count} of ${fields.length} fields` : undefined}
                icon="drop"
              />
              <Metric
                title="Rain, last 30 days"
                main={metrics.rain ? `${r1(metrics.rain.value)} in` : '–'}
                sub={metrics.rain && metrics.normal && metrics.normal.value > 0 ? `${Math.round((100 * metrics.rain.value) / metrics.normal.value)}% of normal` : 'Not available yet'}
                foot={metrics.rain ? (metrics.rainFromSatellite ? 'Satellite rainfall' : 'Weather model') : undefined}
                icon="rain"
              />
              <Metric
                title="Weather, last 30 days"
                main={metrics.high && metrics.low ? `${Math.round(metrics.high.value)}° / ${Math.round(metrics.low.value)}°F` : '–'}
                sub={metrics.diff ? `${metrics.diff.value > 0 ? '+' : ''}${r1(metrics.diff.value)}°F vs normal` : 'Not available yet'}
                foot={metrics.gdd ? `${Math.round(metrics.gdd.value)} growing degree days` : undefined}
                icon="sun"
              />
            </section>

            <section aria-labelledby="fields-h" className={SECTION}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="fields-h" className="font-plate text-xl">
                  Your fields
                </h2>
                <Link href="/fields" className="inline-flex min-h-11 items-center font-semibold text-sky-deep hover:underline">
                  Manage fields
                </Link>
              </div>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="overview-fields">
                {fields.map((f) => {
                  const p = live(f);
                  const sm = num(p, 'smap', 'smapLatest');
                  const rain = num(p, 'imerg', 'imergRain30') ?? num(p, 'power', 'rain30');
                  return (
                    <li key={f.id}>
                      <Link href="/fields" className="flex gap-3 rounded-[var(--radius-control)] border border-line p-3 hover:border-sky">
                        <Outline field={f} />
                        <span className="min-w-0">
                          <span className="block truncate text-[16px] font-semibold">{f.name}</span>
                          <span className="block text-[14px] text-ink-soft">
                            {fieldAcres(f, finance).toLocaleString('en-US')} ac · {f.crops.current.crop ? cropLabel(f.crops.current.crop) : 'Crop not entered'} {f.crops.current.year}
                          </span>
                          <span className="block text-[13.5px] text-ink-soft">
                            {sm !== undefined ? `Soil ${sm}%` : 'Soil –'} · {rain !== undefined ? `Rain ${rain} in` : 'Rain –'}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section aria-labelledby="rot-h" className={SECTION} data-testid="overview-rotation">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="rot-h" className="font-plate text-xl">
                  Current rotation
                </h2>
                <Link href="/planner" className="inline-flex min-h-11 items-center font-semibold text-sky-deep hover:underline">
                  Open the Planner
                </Link>
              </div>
              <p className="text-[14px] text-ink-soft">Past seasons, this year, and what your Planner has next. Changes in the Planner show up here right away.</p>
              <ul className="mt-3 space-y-4">
                {fields.map((f) => (
                  <RotationRow key={f.id} field={f} plan={activePlan(plans, f.id)} />
                ))}
              </ul>
            </section>

            <div className="grid gap-5 lg:grid-cols-2">
              <section aria-labelledby="next-h" className={SECTION} data-testid="overview-upcoming">
                <h2 id="next-h" className="font-plate text-xl">
                  Coming up
                </h2>
                {upcoming.length ? (
                  <ul className="mt-3 space-y-2">
                    {upcoming.slice(0, 8).map((t) => (
                      <li key={`${t.fieldId}-${t.task.id}`} className="flex gap-3 text-[15px]">
                        <span className="w-20 shrink-0 font-semibold text-ink-soft">
                          {MONTH_NAMES[t.task.month - 1].slice(0, 3)} {t.year}
                        </span>
                        <span>
                          {t.task.label} <span className="text-ink-soft">· {t.fieldName}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[15px] text-ink-soft">Nothing planned for the next two months. Plans you make in the Planner show their tasks here.</p>
                )}
              </section>
              <section aria-labelledby="money-h" className={SECTION}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id="money-h" className="font-plate text-xl">
                    Money
                  </h2>
                  <Link href="/finance" className="inline-flex min-h-11 items-center font-semibold text-sky-deep hover:underline">
                    Open Finance
                  </Link>
                </div>
                {analysis && planned > 0 ? (
                  <div className="mt-3">
                    <Headline a={analysis} compact />
                  </div>
                ) : (
                  <p className="mt-2 text-[15px] text-ink-soft">Make a plan for a field to see how it changes your net return.</p>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function moistureWord(pct: number): string {
  return pct < 15 ? 'Dry' : pct < 35 ? 'Good' : 'Wet';
}

function Metric({ title, main, sub, foot, icon }: { title: string; main: string; sub: string; foot?: string; icon: 'drop' | 'rain' | 'sun' }) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-line bg-panel p-4">
      <p className="flex items-center gap-2 text-[14.5px] font-semibold text-ink-soft">
        <svg viewBox="0 0 20 20" className="h-4 w-4 text-sky-deep" aria-hidden>
          {icon === 'drop' && <path d="M10 2.5S4.5 8.6 4.5 12a5.5 5.5 0 0 0 11 0C15.5 8.6 10 2.5 10 2.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" />}
          {icon === 'rain' && <path d="M5.5 11a3.5 3.5 0 0 1 .4-7 4.5 4.5 0 0 1 8.6 1.5 3 3 0 0 1-.5 5.5M7 14l-1 2.5M10.5 14l-1 2.5M14 14l-1 2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
          {icon === 'sun' && <><circle cx="10" cy="10" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>}
        </svg>
        {title}
      </p>
      <p className="mt-1 font-plate text-3xl tabular-nums">{main}</p>
      <p className="text-[15px]">{sub}</p>
      {foot && <p className="mt-1 text-[13px] text-ink-faint">{foot}</p>}
    </div>
  );
}

function Outline({ field }: { field: Field }) {
  const [minX, minY, maxX, maxY] = bboxOf(field.feature.geometry);
  const w = maxX - minX || 1e-6;
  const h = maxY - minY || 1e-6;
  const k = Math.cos(((minY + maxY) / 2) * (Math.PI / 180));
  const sx = 52 / Math.max(w * k, h);
  const rings = field.feature.geometry.type === 'Polygon' ? [field.feature.geometry.coordinates[0]] : field.feature.geometry.coordinates.map((p) => p[0]);
  const d = rings.map((ring) => ring.map(([x, y], i) => `${i ? 'L' : 'M'}${(6 + (x - minX) * k * sx).toFixed(1)},${(6 + (maxY - y) * sx).toFixed(1)}`).join('') + 'Z').join('');
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0 rounded-[8px] bg-field-tint" aria-hidden>
      <path d={d} fill={cropColor(field.crops.current.crop)} fillOpacity={0.55} stroke="var(--color-field)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function Chip({ year, crop, cover, kind }: { year: number; crop: CropRef | null; cover?: string; kind: 'past' | 'now' | 'planned' }) {
  return (
    <li className={`min-w-[7.5rem] rounded-[var(--radius-control)] border px-2.5 py-1.5 ${kind === 'now' ? 'border-sky bg-sky-tint' : kind === 'planned' ? 'border-dashed border-line-strong bg-panel' : 'border-line bg-paper'}`}>
      <span className="block text-[12.5px] font-semibold text-ink-soft">
        {year}
        {kind === 'now' ? ' · now' : kind === 'planned' ? ' · plan' : ''}
      </span>
      <span className="flex items-center gap-1.5 text-[14px] font-semibold">
        <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: cropColor(crop) }} aria-hidden />
        {crop ? cropLabel(crop) : 'Not entered'}
      </span>
      {cover && <span className="block text-[12.5px] text-[#1f6f60]">+ {cover}</span>}
    </li>
  );
}

function RotationRow({ field, plan }: { field: Field; plan: Plan | undefined }) {
  const past = [...field.crops.history].slice(0, 3).reverse();
  const next = (plan?.seasons ?? []).filter((s) => s.year > field.crops.current.year);
  const nowCover = plan?.seasons.find((s) => s.year === field.crops.current.year)?.cover?.name;
  return (
    <li>
      <p className="text-[15px] font-semibold">
        {field.name}
        {!plan && <span className="ml-2 font-normal text-ink-soft">No plan yet</span>}
      </p>
      <ol className="mt-1.5 flex gap-2 overflow-x-auto pb-1" aria-label={`Seasons for ${field.name}`}>
        {past.map((s) => (
          <Chip key={s.year} year={s.year} crop={s.crop} kind="past" />
        ))}
        <Chip year={field.crops.current.year} crop={field.crops.current.crop} cover={nowCover} kind="now" />
        {next.map((s) => (
          <Chip key={s.year} year={s.year} crop={s.crop} cover={s.cover?.name} kind="planned" />
        ))}
      </ol>
    </li>
  );
}
