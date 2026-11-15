'use client';

import { useEffect, useState } from 'react';
import { areaM2, formatAcres, MAX_PIN_ACRES, MIN_PIN_ACRES } from '@/lib/domain/acreage';
import type { Field, FieldCrops, FieldGeometry, FieldProfile, SourceId } from '@/lib/domain/types';
import { type GeometryIssue, hasBlockingIssue } from '@/lib/domain/validation';
import { Button } from '../ui/Button';
import { CropsCard } from './CropsCard';
import { IssueList } from './IssueList';
import { ProfileCard } from './ProfileCard';

export type ShapeEdit =
  | { kind: 'vertices'; geometry: FieldGeometry }
  | { kind: 'pin'; geometry: FieldGeometry; center: [number, number]; acres: number };

const DEFINED_BY: Record<Field['definedBy'], string> = {
  polygon: 'Drawn boundary',
  pin: 'Pin with a square boundary',
  coordinates: 'Coordinates with a square boundary',
  'zip-pin': 'Pin (placed after ZIP search) with a square boundary',
  import: 'Imported boundary',
};

interface Props {
  field: Field;
  profile: FieldProfile | undefined;
  lookupsOn: boolean;
  issues: GeometryIssue[];
  edit: ShapeEdit | null;
  editIssues: GeometryIssue[];
  onBack: () => void;
  onRename: (name: string) => void;
  onCrops: (crops: FieldCrops) => void;
  onStartEdit: (kind: 'vertices' | 'pin') => void;
  onPinAcres: (acres: number) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onRefreshSource: (id: SourceId) => void;
  onRetryCdl: () => void;
  onTurnOnLookups: () => void;
}

export function FieldEditor(p: Props) {
  const { field } = p;
  const [name, setName] = useState(field.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setName(field.name), [field.id, field.name]);
  const isPin = !!field.pin;

  const commitName = () => {
    if (name.trim() && name.trim() !== field.name) p.onRename(name);
    else setName(field.name);
  };

  return (
    <div className="space-y-4 p-4">
      <button type="button" onClick={p.onBack} className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-control)] px-2 font-semibold text-sky-deep hover:bg-sky-tint">
        <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
          <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        All fields
      </button>

      <div>
        <label htmlFor="rename" className="sr-only">
          Field name
        </label>
        <input
          id="rename"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setName(field.name);
          }}
          className="font-plate -mx-2 w-[calc(100%+1rem)] rounded-[var(--radius-control)] border border-transparent bg-transparent px-2 py-1 text-2xl hover:border-line focus:border-sky focus:bg-panel"
          title="Rename field"
        />
        <p className="text-[15px] text-ink-soft">
          <span className="font-semibold text-ink" data-testid="field-acres">
            {formatAcres(field.areaM2)}
          </span>
          , {DEFINED_BY[field.definedBy].toLowerCase()}
          {field.importMeta && <span> from {field.importMeta.fileName}</span>}
        </p>
      </div>

      {!p.edit && <IssueList issues={p.issues.filter((i) => i.level === 'warning')} />}

      {p.edit ? (
        <ShapeEditor {...p} edit={p.edit} />
      ) : (
        <div className="flex flex-wrap gap-2">
          {isPin && (
            <Button variant="secondary" onClick={() => p.onStartEdit('pin')}>
              Move pin or change size
            </Button>
          )}
          <Button variant="secondary" onClick={() => p.onStartEdit('vertices')}>
            {isPin ? 'Adjust the corners' : 'Edit boundary'}
          </Button>
        </div>
      )}

      <CropsCard field={field} lookupsOn={p.lookupsOn} onChange={p.onCrops} onRetryDetection={p.onRetryCdl} />
      <ProfileCard profile={p.profile && p.profile.geometryHash === field.geometryHash ? p.profile : undefined} lookupsOn={p.lookupsOn} onRefresh={p.onRefreshSource} onTurnOnLookups={p.onTurnOnLookups} />

      <div className="pb-4 pt-2">
        {confirmDelete ? (
          <div className="rounded-[var(--radius-panel)] border border-alert/30 bg-alert-tint p-4" role="alertdialog" aria-labelledby="del-h">
            <p id="del-h" className="text-[15px] text-[#7a2c1d]">
              Delete <strong>{field.name}</strong>? Its boundary, crops and profile will be removed from this browser.
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="danger" onClick={p.onDelete}>
                Delete field
              </Button>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-11 rounded-[var(--radius-control)] px-2 font-semibold text-alert hover:bg-alert-tint">
            Delete field
          </button>
        )}
      </div>
    </div>
  );
}

function ShapeEditor(p: Props & { edit: ShapeEdit }) {
  const [acresText, setAcresText] = useState(p.edit.kind === 'pin' ? String(p.edit.acres) : '');
  const blocking = hasBlockingIssue(p.editIssues);
  return (
    <div className="rounded-[var(--radius-panel)] border border-sky/40 bg-sky-tint/60 p-4">
      <p className="text-[15px] font-semibold">{p.edit.kind === 'pin' ? 'Move the pin or change the size' : 'Editing the boundary'}</p>
      <p className="mt-1 text-[14.5px] text-ink-soft">
        {p.edit.kind === 'pin'
          ? 'Tap the map to move the pin.'
          : 'Drag the corners on the map. Drag a midpoint to add a corner; right-click or long-press a corner to remove it.'}
      </p>
      {p.edit.kind === 'pin' && (
        <label className="mt-3 block text-[15px] font-semibold">
          Size in acres
          <input
            inputMode="decimal"
            value={acresText}
            onChange={(e) => {
              setAcresText(e.target.value);
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= MIN_PIN_ACRES && n <= MAX_PIN_ACRES) p.onPinAcres(n);
            }}
            className="mt-1 block min-h-12 w-32 rounded-[var(--radius-control)] border border-line-strong bg-panel px-3 font-normal"
          />
        </label>
      )}
      <p className="mt-3 font-plate text-2xl">{formatAcres(areaM2(p.edit.geometry))}</p>
      <div className="mt-2">
        <IssueList issues={p.editIssues} />
      </div>
      <p className="mt-2 text-[13.5px] text-ink-faint">Saving a new shape refreshes the field profile and re-checks crops you have not confirmed yet.</p>
      <div className="mt-3 flex gap-2">
        <Button onClick={p.onSaveEdit} disabled={blocking}>
          Save shape
        </Button>
        <Button variant="secondary" onClick={p.onCancelEdit}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
