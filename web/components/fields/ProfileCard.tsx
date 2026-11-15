'use client';

import { SOURCE_META, SOURCE_ORDER } from '@/lib/domain/sourceMeta';
import type { FieldProfile, SourceId, SourceResult } from '@/lib/domain/types';
import { HonestyBadge } from '../ui/HonestyBadge';

interface Props {
  profile: FieldProfile | undefined;
  lookupsOn: boolean;
  onRefresh: (id: SourceId) => void;
  onTurnOnLookups: () => void;
}

function fmtDate(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const STATUS: Record<SourceResult['status'], { label: string; cls: string }> = {
  loading: { label: 'Loading', cls: 'bg-sky-tint text-sky-deep' },
  ok: { label: 'Loaded', cls: 'bg-field-tint text-field' },
  unavailable: { label: 'Unavailable', cls: 'bg-alert-tint text-alert' },
  needs_token: { label: 'Needs Earthdata token', cls: 'bg-paper text-ink-soft border border-line' },
  not_built: { label: 'Coming later', cls: 'bg-paper text-ink-soft border border-line' },
};

export function ProfileCard({ profile, lookupsOn, onRefresh, onTurnOnLookups }: Props) {
  return (
    <section aria-labelledby="profile-h" className="rounded-[var(--radius-panel)] border border-line bg-panel p-4">
      <h3 id="profile-h" className="font-plate text-lg">
        Field profile
      </h3>
      <p className="mt-1 text-[14.5px] leading-snug text-ink-soft">
        Filled in automatically from public data. You don&rsquo;t need to enter any of this.
      </p>
      {lookupsOn ? (
        <p className="mt-2 text-[13.5px] leading-snug text-ink-faint">The field&rsquo;s location is sent to NASA, USDA and USGS public data services to build this profile. Nothing else about you is shared.</p>
      ) : (
        <div className="mt-3 rounded-[var(--radius-control)] bg-paper px-3 py-2 text-[14.5px] text-ink-soft">
          Public data lookups are off, so no profile is fetched.{' '}
          <button type="button" onClick={onTurnOnLookups} className="min-h-10 font-semibold text-sky-deep underline underline-offset-2">
            Turn lookups on
          </button>
        </div>
      )}
      <ul className="mt-4 divide-y divide-line">
        {SOURCE_ORDER.map((id) => (
          <SourceRow key={id} id={id} result={profile?.sources[id]} lookupsOn={lookupsOn} onRefresh={() => onRefresh(id)} />
        ))}
      </ul>
    </section>
  );
}

function SourceRow({ id, result, lookupsOn, onRefresh }: { id: SourceId; result?: SourceResult; lookupsOn: boolean; onRefresh: () => void }) {
  const meta = SOURCE_META[id];
  const status = result?.status;
  const s = status ? STATUS[status] : null;
  const canRefresh = lookupsOn && status !== 'loading' && !meta.needsEarthdata;
  return (
    <li className="py-3" data-testid={`source-${id}`} data-status={status ?? 'none'}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15.5px] font-semibold">{meta.name}</p>
          <p className="text-[13px] text-ink-faint">
            <a href={meta.docsUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
              {meta.provider}
            </a>
            {result?.fetchedAt && status !== 'loading' && <span>, fetched {fmtDate(result.fetchedAt)}</span>}
          </p>
        </div>
        {s && (
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${s.cls}`} role={status === 'loading' ? 'status' : undefined}>
            {status === 'loading' && <span className="spinner" aria-hidden />}
            {s.label}
          </span>
        )}
        {!s && <span className="shrink-0 text-[12.5px] text-ink-faint">Not fetched</span>}
      </div>

      {result?.message && <p className={`mt-1.5 text-[13.5px] leading-snug ${status === 'unavailable' ? 'text-alert' : 'text-ink-soft'}`}>{result.message}</p>}

      {status !== 'loading' && result && result.values.length > 0 && (
        <dl className="mt-2 space-y-2">
          {result.values.map((v) => (
            <div key={v.key} className="rounded-[var(--radius-control)] bg-paper px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <dt className="text-[14px] text-ink-soft">{v.label}</dt>
                <dd className="flex items-center gap-2">
                  <span className="text-[16px] font-semibold">
                    {typeof v.value === 'number' ? v.value.toLocaleString('en-US') : v.value}
                    {v.unit && <span className="ml-1 text-[13px] font-normal text-ink-soft">{v.unit}</span>}
                  </span>
                  <HonestyBadge honesty={v.honesty} />
                </dd>
              </div>
              {v.note && <p className="mt-1 text-[12.5px] leading-snug text-ink-faint">{v.note}</p>}
            </div>
          ))}
        </dl>
      )}

      {canRefresh && status && (
        <button type="button" onClick={onRefresh} className="mt-1 min-h-10 text-[14px] font-semibold text-sky-deep hover:underline">
          {status === 'unavailable' ? 'Try again' : 'Refresh'}
        </button>
      )}
    </li>
  );
}
