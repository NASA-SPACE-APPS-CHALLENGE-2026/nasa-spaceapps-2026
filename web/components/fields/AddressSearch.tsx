'use client';

import { useId, useState } from 'react';
import type { LonLat } from '@/lib/domain/types';
import type { AddressMatch } from '@/lib/server/geocode';
import { Button } from '../ui/Button';

export const ADDRESS_PRIVACY_NOTE = 'Address search sends the address to the US Census Bureau. Turn on public data lookups to use it.';

interface Props {
  lookupsOn: boolean;
  onPick: (center: LonLat, label: string) => void;
  /** 'panel' = full form in the Add-a-field panel; 'toolbar' = compact box on the map. */
  variant?: 'panel' | 'toolbar';
  autoFocus?: boolean;
}

type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'results'; matches: AddressMatch[] } | { kind: 'error'; message: string };

/**
 * Address → map location via our /api/geocode route (US Census geocoder).
 * Nothing is sent while typing; the address goes out only when the farmer submits, and only if lookups are on.
 */
export function AddressSearch({ lookupsOn, onPick, variant = 'panel', autoFocus }: Props) {
  const [address, setAddress] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const id = useId();
  const listId = `${id}-results`;
  const compact = variant === 'toolbar';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupsOn || state.kind === 'loading') return;
    const q = address.trim();
    if (q.length < 3) {
      setState({ kind: 'error', message: 'Enter a street address, for example "2229 Lincoln Way, Ames, IA".' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const res = await fetch('/api/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: q }) });
      const body = (await res.json()) as { matches?: AddressMatch[]; error?: string };
      if (!res.ok) {
        setState({ kind: 'error', message: body.error ?? 'Address search failed. Try a ZIP code or coordinates instead.' });
        return;
      }
      const matches = body.matches ?? [];
      if (matches.length === 1 && !compact) {
        // One clear match: go straight there.
        onPick([matches[0].lon, matches[0].lat], matches[0].label);
        setState({ kind: 'results', matches });
        return;
      }
      setState({ kind: 'results', matches });
    } catch {
      setState({ kind: 'error', message: 'FieldShift could not reach its server. Check that it is running and try again.' });
    }
  };

  const pick = (m: AddressMatch) => {
    onPick([m.lon, m.lat], m.label);
    if (compact) {
      setState({ kind: 'idle' });
      setAddress(m.label);
    }
  };

  return (
    <div className={compact ? '' : 'mt-3'}>
      <form onSubmit={submit} role="search" aria-label="Find an address">
        <label htmlFor={id} className={compact ? 'sr-only' : 'block text-[15px] font-semibold'}>
          Address
        </label>
        <div className={`flex gap-2 ${compact ? '' : 'mt-1'}`}>
          <input
            id={id}
            type="search"
            autoComplete="street-address"
            autoFocus={autoFocus}
            maxLength={100}
            disabled={!lookupsOn}
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              if (state.kind !== 'loading') setState({ kind: 'idle' });
            }}
            placeholder={compact ? 'Search an address' : 'e.g. 2229 Lincoln Way, Ames, IA'}
            aria-describedby={!lookupsOn ? `${id}-off` : undefined}
            aria-controls={state.kind === 'results' ? listId : undefined}
            className={`min-h-12 w-full min-w-0 rounded-[var(--radius-control)] border border-line-strong bg-panel px-3 text-[16px] disabled:bg-paper ${compact ? 'shadow-sm' : ''}`}
          />
          <Button type="submit" disabled={!lookupsOn || state.kind === 'loading'} className={compact ? 'shrink-0 px-3' : 'shrink-0'} aria-label={compact ? 'Search address' : undefined}>
            {state.kind === 'loading' ? (compact ? <span className="spinner !border-white/40 !border-t-white" aria-hidden /> : 'Searching…') : compact ? (
              <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden>
                <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
                <path d="m13 13 4.5 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            ) : (
              'Find'
            )}
          </Button>
        </div>
      </form>

      {!lookupsOn && (
        <p id={`${id}-off`} className={`mt-2 text-[14px] text-ink-soft ${compact ? 'rounded-[var(--radius-control)] bg-panel/95 px-3 py-2' : ''}`}>
          {ADDRESS_PRIVACY_NOTE}
        </p>
      )}
      {lookupsOn && !compact && state.kind === 'idle' && (
        <p className="mt-2 text-[14px] text-ink-faint">US street addresses. Nothing is sent until you press Find; then the address goes to the US Census Bureau geocoder.</p>
      )}

      <div aria-live="polite">
        {state.kind === 'loading' && !compact && (
          <p className="mt-2 flex items-center gap-2 text-[14.5px] text-sky-deep">
            <span className="spinner" aria-hidden /> Looking up the address…
          </p>
        )}
        {state.kind === 'error' && (
          <p className={`mt-2 text-[14.5px] text-alert ${compact ? 'rounded-[var(--radius-control)] bg-panel/95 px-3 py-2' : ''}`} role="alert">
            {state.message}
          </p>
        )}
        {state.kind === 'results' && state.matches.length === 0 && (
          <p className={`mt-2 text-[14.5px] text-ink-soft ${compact ? 'rounded-[var(--radius-control)] bg-panel/95 px-3 py-2' : ''}`}>
            No matching address found. Check the spelling and include the town and state, or use a ZIP code instead.
          </p>
        )}
        {state.kind === 'results' && (state.matches.length > 1 || compact) && state.matches.length > 0 && (
          <div className={`mt-2 ${compact ? 'rounded-[var(--radius-panel)] border border-line bg-panel p-1 shadow-sm' : ''}`}>
            {state.matches.length > 1 && <p className="px-2 pt-1 text-[14px] text-ink-soft">{state.matches.length} matches. Pick one:</p>}
            <ul id={listId} className="mt-1 space-y-1">
              {state.matches.map((m) => (
                <li key={`${m.lat},${m.lon},${m.label}`}>
                  <button type="button" onClick={() => pick(m)} className="flex min-h-11 w-full items-center rounded-[var(--radius-control)] px-3 text-left text-[15px] hover:bg-sky-tint">
                    {m.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
