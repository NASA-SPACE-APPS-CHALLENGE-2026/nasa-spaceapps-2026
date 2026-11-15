'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { LonLat } from '@/lib/domain/types';
import type { AddressMatch } from '@/lib/server/geocode';
import { Button } from '../ui/Button';

export const ADDRESS_PRIVACY_NOTE = 'Address search sends what you type to an address lookup service. Turn on public data lookups to use it.';

interface Props {
  lookupsOn: boolean;
  onPick: (center: LonLat, label: string) => void;
  /** 'panel' = full form in the Add-a-field panel; 'toolbar' = compact box on the map. */
  variant?: 'panel' | 'toolbar';
  autoFocus?: boolean;
}

type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'results'; matches: AddressMatch[] } | { kind: 'error'; message: string };

const DEBOUNCE_MS = 250;
const MIN_CHARS = 3;

/**
 * Address → map location. Suggestions appear as you type (Photon, via /api/geocode/suggest);
 * pressing Enter or Find without choosing a suggestion runs the US Census geocoder (/api/geocode).
 * Nothing is sent while public data lookups are off.
 */
export function AddressSearch({ lookupsOn, onPick, variant = 'panel', autoFocus }: Props) {
  const [address, setAddress] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [suggestions, setSuggestions] = useState<AddressMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const id = useId();
  const listId = `${id}-suggestions`;
  const compact = variant === 'toolbar';
  const abort = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Close the suggestion list when a click lands outside the search box.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const requestSuggestions = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    abort.current?.abort();
    if (!lookupsOn || q.trim().length < MIN_CHARS) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        const res = await fetch('/api/geocode/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: q.trim() }), signal: ctrl.signal });
        if (!res.ok) return;
        const body = (await res.json()) as { matches?: AddressMatch[] };
        if (ctrl.signal.aborted) return;
        const matches = body.matches ?? [];
        setSuggestions(matches);
        setActive(-1);
        setOpen(matches.length > 0);
      } catch {
        // Suggestions are a convenience: on any failure the farmer can still press Find.
      }
    }, DEBOUNCE_MS);
  };

  const pick = (m: AddressMatch) => {
    if (timer.current) clearTimeout(timer.current);
    abort.current?.abort();
    onPick([m.lon, m.lat], m.label);
    setAddress(m.label);
    setSuggestions([]);
    setOpen(false);
    setState({ kind: 'idle' });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (open && active >= 0 && suggestions[active]) {
      pick(suggestions[active]);
      return;
    }
    if (!lookupsOn || state.kind === 'loading') return;
    const q = address.trim();
    if (q.length < 3) {
      setState({ kind: 'error', message: 'Enter a street address, for example "2229 Lincoln Way, Ames, IA".' });
      return;
    }
    setOpen(false);
    setState({ kind: 'loading' });
    try {
      const res = await fetch('/api/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: q }) });
      const body = (await res.json()) as { matches?: AddressMatch[]; error?: string };
      if (!res.ok) {
        setState({ kind: 'error', message: body.error ?? 'Address search failed. Try a ZIP code or coordinates instead.' });
        return;
      }
      const matches = body.matches ?? [];
      if (matches.length === 1) {
        pick(matches[0]);
        return;
      }
      setState({ kind: 'results', matches });
    } catch {
      setState({ kind: 'error', message: 'PlotTwist could not reach its server. Check that it is running and try again.' });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  };

  const bubble = compact ? 'rounded-parcel bg-panel/95 px-3 py-2' : '';
  const showList = open && suggestions.length > 0;

  return (
    <div className={compact ? '' : 'mt-3'} ref={boxRef}>
      <form onSubmit={submit} role="search" aria-label="Find an address">
        <label htmlFor={id} className={compact ? 'sr-only' : 'block text-[15px] font-semibold'}>
          Address
        </label>
        <div className={`relative flex gap-2 ${compact ? '' : 'mt-1'}`}>
          <input
            id={id}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
            autoComplete="off"
            autoFocus={autoFocus}
            maxLength={100}
            disabled={!lookupsOn}
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              if (state.kind !== 'loading') setState({ kind: 'idle' });
              requestSuggestions(e.target.value);
            }}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={compact ? 'Search an address' : 'Start typing, e.g. 2229 Lincoln Way, Ames'}
            aria-describedby={!lookupsOn ? `${id}-off` : undefined}
            className={`min-h-12 w-full min-w-0 rounded-parcel border border-line-strong bg-panel px-3 text-[16px] disabled:bg-paper ${compact ? 'shadow-sm' : ''}`}
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
          <ul
            id={listId}
            role="listbox"
            aria-label="Address suggestions"
            hidden={!showList}
            data-testid="address-suggestions"
            className="absolute left-0 right-0 top-full z-[1300] mt-1 overflow-hidden rounded-parcel border border-line bg-panel p-1 shadow-lg"
          >
            {suggestions.map((m, i) => (
              <li
                key={`${m.lat},${m.lon},${m.label}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => pick(m)}
                onPointerEnter={() => setActive(i)}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-parcel px-3 text-[15px] ${i === active ? 'bg-field-tint text-field' : ''}`}
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden>
                  <path d="M10 18s5.5-5.2 5.5-9.5a5.5 5.5 0 1 0-11 0C4.5 12.8 10 18 10 18Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  <circle cx="10" cy="8.5" r="1.8" fill="currentColor" />
                </svg>
                <span className="min-w-0 truncate">{m.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </form>

      {!lookupsOn && (
        <p id={`${id}-off`} className={`mt-2 text-[14px] text-ink-soft ${bubble}`}>
          {ADDRESS_PRIVACY_NOTE}
        </p>
      )}

      <div aria-live="polite">
        {state.kind === 'loading' && !compact && (
          <p className="mt-2 flex items-center gap-2 text-[14.5px] text-field">
            <span className="spinner" aria-hidden /> Looking up the address…
          </p>
        )}
        {state.kind === 'error' && (
          <p className={`mt-2 text-[14.5px] text-alert ${bubble}`} role="alert">
            {state.message}
          </p>
        )}
        {state.kind === 'results' && state.matches.length === 0 && (
          <p className={`mt-2 text-[14.5px] text-ink-soft ${bubble}`}>No matching address found. Check the spelling and include the town and state, or use a ZIP code instead.</p>
        )}
        {state.kind === 'results' && state.matches.length > 1 && (
          <div className={`mt-2 ${compact ? 'rounded-parcel border border-line bg-panel p-1 shadow-sm' : ''}`}>
            <p className="px-2 pt-1 text-[14px] text-ink-soft">{state.matches.length} matches. Pick one:</p>
            <ul className="mt-1 space-y-1">
              {state.matches.map((m) => (
                <li key={`${m.lat},${m.lon},${m.label}`}>
                  <button type="button" onClick={() => pick(m)} className="flex min-h-11 w-full items-center rounded-parcel px-3 text-left text-[15px] hover:bg-field-tint">
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
