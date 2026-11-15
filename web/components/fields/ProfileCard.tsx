'use client';

import { SOURCE_META, SOURCE_ORDER } from '@/lib/domain/sourceMeta';
import type { FieldProfile, SourceId, SourceResult } from '@/lib/domain/types';

interface Props {
  profile: FieldProfile | undefined;
  lookupsOn: boolean;
  onRefresh: (id: SourceId) => void;
  onTurnOnLookups: () => void;
}

/** The field's automatic profile, kept deliberately plain: a heading per topic and "label  value" rows. */
export function ProfileCard({ profile, lookupsOn, onRefresh, onTurnOnLookups }: Props) {
  return (
    <section aria-labelledby="profile-h" className="border-t border-line pt-5">
      <h3 id="profile-h" className="font-plate text-lg">
        Field profile
      </h3>
      {!lookupsOn && (
        <div className="mt-3 rounded-parcel bg-paper px-3 py-2 text-[14.5px] text-ink-soft">
          Public data lookups are off.{' '}
          <button type="button" onClick={onTurnOnLookups} className="min-h-10 font-semibold text-field underline underline-offset-2">
            Turn lookups on
          </button>
        </div>
      )}
      <ul className="mt-2 divide-y divide-line">
        {SOURCE_ORDER.map((id) => (
          <SourceRow key={id} id={id} result={profile?.sources[id]} lookupsOn={lookupsOn} onRefresh={() => onRefresh(id)} />
        ))}
      </ul>
    </section>
  );
}

function fmt(v: string | number): string {
  return typeof v === 'number' ? v.toLocaleString('en-US') : v;
}

function SourceRow({ id, result, lookupsOn, onRefresh }: { id: SourceId; result?: SourceResult; lookupsOn: boolean; onRefresh: () => void }) {
  const meta = SOURCE_META[id];
  const status = result?.status;
  const canRefresh = lookupsOn && !!status && status !== 'loading' && status !== 'needs_token';
  return (
    <li className="py-3" data-testid={`source-${id}`} data-status={status ?? 'none'}>
      <div className="flex min-h-8 items-center gap-2">
        <p className="min-w-0 flex-1 text-[15.5px] font-semibold">{meta.name}</p>
        {status === 'loading' && (
          <span role="status" className="inline-flex items-center gap-1.5 text-[13px] text-field">
            <span className="spinner" aria-hidden />
            Loading
          </span>
        )}
        {canRefresh && (
          <button type="button" onClick={onRefresh} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-field-tint hover:text-field" aria-label={`Refresh ${meta.name.toLowerCase()}`} title="Refresh">
            <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
              <path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3.2h-3.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {status !== 'loading' && result && result.status === 'ok' && result.values.length > 0 && (
        <dl className="mt-1 space-y-1">
          {result.values.map((v) => (
            <div key={v.key} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <dt className="text-[14.5px] text-ink-soft">{v.label}</dt>
              <dd className="text-[16px] font-semibold tabular-nums">
                {fmt(v.value)}
                {v.unit && <span className="ml-1 text-[13.5px] font-normal text-ink-soft">{v.unit}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {status && status !== 'loading' && status !== 'ok' && <p className="mt-0.5 text-[14px] text-ink-faint">{status === 'unavailable' ? 'Not available right now' : 'Not available yet'}</p>}
      {!status && lookupsOn && <p className="mt-0.5 text-[14px] text-ink-faint">Not loaded yet</p>}
    </li>
  );
}
