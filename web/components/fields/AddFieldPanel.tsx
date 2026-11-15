'use client';

import Link from 'next/link';
import { useState } from 'react';
import { areaM2, DEFAULT_PIN_ACRES, formatAcres, MAX_PIN_ACRES, MIN_PIN_ACRES } from '@/lib/domain/acreage';
import type { DefinedBy, FieldGeometry, LonLat } from '@/lib/domain/types';
import { type GeometryIssue, hasBlockingIssue } from '@/lib/domain/validation';
import { Button } from '../ui/Button';
import { IssueList } from './IssueList';

export type AddStep = 'choose' | 'draw' | 'pin' | 'coords' | 'zip';

export interface Draft {
  geometry: FieldGeometry;
  definedBy: DefinedBy;
  pin?: { center: LonLat; acres: number };
}

interface Props {
  step: AddStep;
  draft: Draft | null;
  issues: GeometryIssue[];
  defaultName: string;
  zipArea: { zip: string } | null;
  onStep: (s: AddStep) => void;
  onCancel: () => void;
  onLocate: (center: LonLat, via: 'zip' | 'coords', zip?: string) => void;
  onAcres: (acres: number) => void;
  onRedraw: () => void;
  onSave: (name: string) => void;
}

const METHODS: Array<{ step: AddStep; title: string; text: string }> = [
  { step: 'draw', title: 'Draw the boundary', text: 'Tap each corner of the field on the satellite map. Most accurate.' },
  { step: 'pin', title: 'Drop a pin', text: 'Mark the middle of the field and give its size. Quickest.' },
  { step: 'zip', title: 'Start from a ZIP code', text: 'Jump the map to your area, then pin or draw the field.' },
  { step: 'coords', title: 'Enter coordinates', text: 'Type a latitude and longitude, for example from a GPS.' },
];

export function AddFieldPanel(p: Props) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-plate text-2xl">Add a field</h2>
        <button type="button" onClick={p.onCancel} className="min-h-11 rounded-[var(--radius-control)] px-3 font-semibold text-ink-soft hover:bg-panel">
          Cancel
        </button>
      </div>
      {p.step === 'choose' && <ChooseMethod onStep={p.onStep} />}
      {p.step !== 'choose' && !p.draft && <StepHelp {...p} />}
      {p.draft && <DraftForm {...p} draft={p.draft} />}
    </div>
  );
}

function ChooseMethod({ onStep }: { onStep: (s: AddStep) => void }) {
  return (
    <>
      <p className="mt-1 text-[15px] text-ink-soft">How do you want to mark it?</p>
      <ul className="mt-4 space-y-2">
        {METHODS.map((m) => (
          <li key={m.step}>
            <button type="button" onClick={() => onStep(m.step)} className="w-full rounded-[var(--radius-panel)] border border-line bg-panel p-4 text-left hover:border-sky">
              <span className="block text-[17px] font-semibold">{m.title}</span>
              <span className="mt-0.5 block text-[14.5px] text-ink-soft">{m.text}</span>
            </button>
          </li>
        ))}
        <li>
          <Link href="/imports" className="block w-full rounded-[var(--radius-panel)] border border-dashed border-line-strong p-4 hover:border-sky">
            <span className="block text-[17px] font-semibold">Import a boundary file</span>
            <span className="mt-0.5 block text-[14.5px] text-ink-soft">GeoJSON, KML or a zipped shapefile from another farm platform.</span>
          </Link>
        </li>
      </ul>
    </>
  );
}

function StepHelp(p: Props) {
  const back = (
    <button type="button" onClick={() => p.onStep('choose')} className="mt-3 min-h-11 font-semibold text-sky-deep hover:underline">
      Choose another way
    </button>
  );
  if (p.step === 'draw') {
    return (
      <div className="mt-3 text-[15px] leading-relaxed text-ink-soft">
        <p>Zoom in on your field, then tap each corner on the map. Finish by tapping the first corner again, or press Finish shape.</p>
        {back}
      </div>
    );
  }
  if (p.step === 'pin') {
    return (
      <div className="mt-3 text-[15px] leading-relaxed text-ink-soft">
        <p>
          {p.zipArea ? `The map shows ZIP ${p.zipArea.zip}. A ZIP code is only a general area, so find your field and ` : 'Find your field on the map and '}
          tap its middle. FieldShift draws a {DEFAULT_PIN_ACRES}-acre square there; you can change the acreage next.
        </p>
        {p.zipArea && (
          <button type="button" onClick={() => p.onStep('draw')} className="mt-3 min-h-11 font-semibold text-sky-deep hover:underline">
            Draw the exact boundary instead
          </button>
        )}
        <div>{back}</div>
      </div>
    );
  }
  if (p.step === 'zip') return <ZipStep onLocate={(c, zip) => p.onLocate(c, 'zip', zip)} back={back} />;
  return <CoordsStep onLocate={(c) => p.onLocate(c, 'coords')} back={back} />;
}

function ZipStep({ onLocate, back }: { onLocate: (c: LonLat, zip: string) => void; back: React.ReactNode }) {
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
      else onLocate([body.lon, body.lat], zip.trim());
    } catch {
      setError('FieldShift could not reach its server. Check that it is running and try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mt-3">
      <label htmlFor="zip" className="text-[15px] font-semibold">
        ZIP code
      </label>
      <div className="mt-1 flex gap-2">
        <input id="zip" inputMode="numeric" autoComplete="postal-code" maxLength={5} value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))} className="min-h-12 w-36 rounded-[var(--radius-control)] border border-line-strong bg-panel px-3 text-lg tracking-wider" placeholder="50010" />
        <Button type="submit" disabled={busy}>
          {busy ? 'Finding…' : 'Find on map'}
        </Button>
      </div>
      {error && <p className="mt-2 text-[14.5px] text-alert" role="alert">{error}</p>}
      <p className="mt-3 text-[14px] text-ink-faint">A ZIP code only gives the general area. Next you&rsquo;ll pin or draw the field itself.</p>
      {back}
    </form>
  );
}

function CoordsStep({ onLocate, back }: { onLocate: (c: LonLat) => void; back: React.ReactNode }) {
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
      setError('Longitude for US fields is negative (west). Did you mean ' + -lo + '?');
      return;
    }
    setError(null);
    onLocate([lo, la]);
  };
  const input = 'min-h-12 w-full rounded-[var(--radius-control)] border border-line-strong bg-panel px-3 text-[16px]';
  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[15px] font-semibold">
          Latitude
          <input inputMode="decimal" value={lat} onPaste={onPaste} onChange={(e) => setLat(e.target.value)} placeholder="42.0308" className={`${input} mt-1 font-normal`} />
        </label>
        <label className="text-[15px] font-semibold">
          Longitude
          <input inputMode="decimal" value={lon} onPaste={onPaste} onChange={(e) => setLon(e.target.value)} placeholder="-93.5883" className={`${input} mt-1 font-normal`} />
        </label>
      </div>
      <p className="text-[14px] text-ink-faint">Tip: paste &ldquo;42.0308, -93.5883&rdquo; into either box.</p>
      {error && <p className="text-[14.5px] text-alert" role="alert">{error}</p>}
      <Button type="submit">Show on map</Button>
      {back}
    </form>
  );
}

function DraftForm(p: Props & { draft: Draft }) {
  const [name, setName] = useState(p.defaultName);
  const [acresText, setAcresText] = useState(String(p.draft.pin?.acres ?? DEFAULT_PIN_ACRES));
  const blocking = hasBlockingIssue(p.issues);
  const acresNum = Number(acresText);
  const acresValid = Number.isFinite(acresNum) && acresNum >= MIN_PIN_ACRES && acresNum <= MAX_PIN_ACRES;
  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!blocking) p.onSave(name);
      }}
    >
      <div className="rounded-[var(--radius-panel)] border border-line bg-panel p-4">
        <p className="text-[14px] text-ink-soft">{p.draft.pin ? 'Pin with a square boundary' : 'Drawn boundary'}</p>
        <p className="font-plate text-3xl" data-testid="draft-acres">
          {formatAcres(areaM2(p.draft.geometry))}
        </p>
        {p.draft.pin && (
          <div className="mt-3">
            <label htmlFor="acres" className="text-[15px] font-semibold">
              Field size in acres
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="acres"
                inputMode="decimal"
                value={acresText}
                onChange={(e) => {
                  setAcresText(e.target.value);
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= MIN_PIN_ACRES && n <= MAX_PIN_ACRES) p.onAcres(n);
                }}
                className="min-h-12 w-32 rounded-[var(--radius-control)] border border-line-strong bg-panel px-3 text-[16px]"
              />
            </div>
            {!acresValid && <p className="mt-1 text-[14px] text-alert">Enter a size between {MIN_PIN_ACRES} and {MAX_PIN_ACRES.toLocaleString('en-US')} acres.</p>}
            <p className="mt-2 text-[14px] text-ink-faint">Tap the map to move the pin. The square is an approximation; you can draw the exact boundary later.</p>
          </div>
        )}
        <button type="button" onClick={p.onRedraw} className="mt-2 min-h-11 font-semibold text-sky-deep hover:underline">
          {p.draft.pin ? 'Draw the exact boundary instead' : 'Redraw'}
        </button>
      </div>

      <IssueList issues={p.issues} />

      <div>
        <label htmlFor="field-name" className="text-[15px] font-semibold">
          Field name
        </label>
        <input id="field-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="mt-1 min-h-12 w-full rounded-[var(--radius-control)] border border-line-strong bg-panel px-3 text-[16px]" />
      </div>
      <Button type="submit" disabled={blocking || !name.trim()} className="w-full">
        Save field
      </Button>
    </form>
  );
}

