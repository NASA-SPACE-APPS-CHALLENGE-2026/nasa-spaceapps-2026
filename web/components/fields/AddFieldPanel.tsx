'use client';

import Link from 'next/link';
import { useState } from 'react';
import { areaM2, formatAcres } from '@/lib/domain/acreage';
import type { FieldGeometry, LocatedVia, LonLat } from '@/lib/domain/types';
import { type GeometryIssue, hasBlockingIssue } from '@/lib/domain/validation';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { IssueList } from './IssueList';

/** 'choose' → (optional locating step) → 'draw' → draft form. Every new field ends with a drawn boundary. */
export type AddStep = 'choose' | 'address' | 'zip' | 'coords' | 'pin' | 'draw';

export interface Located {
  center: LonLat;
  via: LocatedVia;
  label: string;
}

export interface Draft {
  geometry: FieldGeometry;
}

interface Props {
  step: AddStep;
  located: Located | null;
  draft: Draft | null;
  issues: GeometryIssue[];
  defaultName: string;
  lookupsOn: boolean;
  onStep: (s: AddStep) => void;
  onCancel: () => void;
  onLocate: (where: Located) => void;
  onRedraw: () => void;
  onSave: (name: string) => void;
  /** Rendered for the 'address' step (address search lives in its own component). */
  addressStep?: React.ReactNode;
}

export function AddFieldPanel(p: Props) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-plate text-2xl">Add a field</h2>
        <button type="button" onClick={p.onCancel} className="min-h-11 rounded-parcel px-3 font-semibold text-ink-soft hover:bg-panel">
          Cancel
        </button>
      </div>
      {p.draft ? <DraftForm {...p} draft={p.draft} /> : <StepBody {...p} />}
    </div>
  );
}

function StepBody(p: Props) {
  const back = (
    <button type="button" onClick={() => p.onStep('choose')} className="mt-3 min-h-11 font-semibold text-field hover:underline">
      Choose another way
    </button>
  );
  switch (p.step) {
    case 'choose':
      return <ChooseMethod {...p} />;
    case 'address':
      return (
        <>
          {p.addressStep}
          {back}
        </>
      );
    case 'zip':
      return <ZipStep onLocate={p.onLocate} back={back} />;
    case 'coords':
      return <CoordsStep onLocate={p.onLocate} back={back} />;
    case 'pin':
      // Instructions for tapping are on the map itself.
      return (
        <div className="mt-3" role="status">
          <p className="text-[15px] text-ink-soft">Waiting for you to tap your field on the map.</p>
          {back}
        </div>
      );
    case 'draw':
      // Drawing instructions, live acreage, Undo and Finish are in the map toolbar; the panel only shows context.
      return (
        <div className="mt-3" role="status">
          {p.located && <p className="text-[15px] font-semibold">{p.located.label}</p>}
          <p className="text-[15px] text-ink-soft">Tracing the boundary on the map.</p>
          {back}
        </div>
      );
  }
}

function ChooseMethod({ onStep, lookupsOn, addressStep }: Props) {
  const primary: Array<{ step: AddStep; title: string; text: string; badge?: string; disabled?: boolean }> = [
    ...(addressStep
      ? [
          {
            step: 'address' as const,
            title: 'Enter an address',
            text: lookupsOn ? 'Jump to your farm, then trace the field on the satellite map.' : 'Needs public data lookups, which are turned off. Use a ZIP code or coordinates instead.',
            badge: 'Recommended',
            disabled: !lookupsOn,
          },
        ]
      : []),
    { step: 'draw', title: 'Draw the boundary', text: 'Trace your field’s corners on the satellite map. Zoom to your field first, or use one of the options below.', badge: addressStep ? undefined : 'Recommended' },
  ];
  const secondary: Array<{ step: AddStep; title: string }> = [
    { step: 'zip', title: 'Find by ZIP code' },
    { step: 'pin', title: 'Drop a pin, then draw' },
    { step: 'coords', title: 'Enter coordinates' },
  ];
  return (
    <>
      <p className="mt-1 text-[15px] text-ink-soft">Find your field, then trace its edges on the satellite map.</p>
      <ul className="mt-4 space-y-2">
        {primary.map((m) => (
          <li key={m.step}>
            <button
              type="button"
              disabled={m.disabled}
              onClick={() => onStep(m.step)}
              className="w-full rounded-parcel border border-line bg-panel p-4 text-left hover:border-field disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-line"
            >
              <span className="flex items-center gap-2">
                <span className="text-[17px] font-semibold">{m.title}</span>
                {m.badge && !m.disabled && <span className="rounded-full bg-field-tint px-2 py-0.5 text-[12.5px] font-semibold text-field">{m.badge}</span>}
              </span>
              <span className="mt-0.5 block text-[14.5px] text-ink-soft">{m.text}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-[14px] font-semibold text-ink-soft">Other ways to find your field</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {secondary.map((m) => (
          <li key={m.step}>
            <button type="button" onClick={() => onStep(m.step)} className="min-h-11 rounded-parcel border border-line-strong bg-panel px-3 text-[15px] font-semibold text-field hover:border-field">
              {m.title}
            </button>
          </li>
        ))}
      </ul>
      <Link href="/imports" className="mt-4 inline-flex min-h-11 items-center text-[15px] font-semibold text-field hover:underline">
        Or import a boundary file
      </Link>
    </>
  );
}

function ZipStep({ onLocate, back }: { onLocate: (l: Located) => void; back: React.ReactNode }) {
  const [zip, setZip] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{5}$/.test(zip.trim())) {
      setError('Enter a 5-digit US ZIP code.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/zip/${zip.trim()}`);
      const body = await res.json();
      if (!res.ok) setError(body.error ?? 'That ZIP code could not be found.');
      else onLocate({ center: [body.lon, body.lat], via: 'zip', label: `Near ZIP ${zip.trim()}` });
    } catch {
      setError('PlotTwist could not reach its server. Check that it is running and try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mt-3">
      <div className="flex items-end gap-2">
        <TextField
          label="ZIP code"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))}
          placeholder="e.g. 50010"
          className="w-40"
          inputClassName="text-lg tracking-wider"
        />
        <Button type="submit" disabled={busy}>
          {busy ? 'Finding…' : 'Find on map'}
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-[14.5px] text-alert" role="alert">
          {error}
        </p>
      )}
      <p className="mt-3 text-[14px] text-ink-faint">A ZIP code only gives the general area. The map zooms in and you trace the field itself.</p>
      {back}
    </form>
  );
}

function CoordsStep({ onLocate, back }: { onLocate: (l: Located) => void; back: React.ReactNode }) {
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [error, setError] = useState<string | null>(null);
  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const m = e.clipboardData.getData('text').match(/(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/);
    if (m) {
      e.preventDefault();
      setLat(m[1]);
      setLon(m[2]);
    }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const la = Number(lat);
    const lo = Number(lon);
    if (!lat.trim() || !lon.trim() || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
      setError('Enter latitude between -90 and 90 and longitude between -180 and 180, in decimal degrees.');
      return;
    }
    if (lo > 0 && la > 20 && la < 50) {
      setError(`Longitude for US fields is negative (west). Did you mean ${-lo}?`);
      return;
    }
    setError(null);
    onLocate({ center: [lo, la], via: 'coordinates', label: `At ${la.toFixed(4)}, ${lo.toFixed(4)}` });
  };
  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Latitude" inputMode="decimal" value={lat} onPaste={onPaste} onChange={(e) => setLat(e.target.value)} placeholder="e.g. 42.0308" />
        <TextField label="Longitude" inputMode="decimal" value={lon} onPaste={onPaste} onChange={(e) => setLon(e.target.value)} placeholder="e.g. -93.5883" />
      </div>
      <p className="text-[14px] text-ink-faint">Tip: paste &ldquo;42.0308, -93.5883&rdquo; into either box.</p>
      {error && (
        <p className="text-[14.5px] text-alert" role="alert">
          {error}
        </p>
      )}
      <Button type="submit">Show on map</Button>
      {back}
    </form>
  );
}

function DraftForm(p: Props & { draft: Draft }) {
  const [name, setName] = useState(p.defaultName);
  const blocking = hasBlockingIssue(p.issues);
  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!blocking && name.trim()) p.onSave(name);
      }}
    >
      <div className="rounded-parcel border border-line bg-panel p-4">
        <p className="text-[14px] text-ink-soft">Your boundary{p.located ? ` (${p.located.label.toLowerCase()})` : ''}</p>
        <p className="font-plate text-3xl" data-testid="draft-acres">
          {formatAcres(areaM2(p.draft.geometry))}
        </p>
        <button type="button" onClick={p.onRedraw} className="mt-2 min-h-11 font-semibold text-field hover:underline">
          Redraw
        </button>
      </div>

      <IssueList issues={p.issues} />

      <TextField label="Field name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      <Button type="submit" disabled={blocking || !name.trim()} className="w-full">
        Save field
      </Button>
    </form>
  );
}
