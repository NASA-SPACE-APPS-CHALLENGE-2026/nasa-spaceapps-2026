'use client';

import { useEffect, useId, useState } from 'react';
import { areaM2, formatAcres } from '@/lib/domain/acreage';
import type { Field, FieldCrops, FieldGeometry, FieldProfile, SourceId } from '@/lib/domain/types';
import { type GeometryIssue, hasBlockingIssue } from '@/lib/domain/validation';
import { Button } from '../ui/Button';
import { CropsCard } from './CropsCard';
import { IssueList } from './IssueList';
import { ProfileCard } from './ProfileCard';

/** 'vertices' = drag the corners of an existing boundary. 'draw' = trace a new boundary (geometry null until finished). */
export type ShapeEdit = { kind: 'vertices'; geometry: FieldGeometry } | { kind: 'draw'; geometry: FieldGeometry | null };

function boundaryText(field: Field): string {
  if (field.boundary === 'approximate') return 'boundary not drawn';
  if (field.definedBy === 'import') return 'imported boundary';
  return 'drawn boundary';
}

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
  onStartEdit: (kind: ShapeEdit['kind']) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onRefreshSource: (id: SourceId) => void;
  onRetryCdl: () => void;
  onTurnOnLookups: () => void;
  /** Extra actions under the header (e.g. Explore rotation). */
  actions?: React.ReactNode;
}

export function FieldEditor(p: Props) {
  const { field } = p;
  const [name, setName] = useState(field.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const renameId = useId();
  const deleteHeadingId = useId();
  useEffect(() => setName(field.name), [field.id, field.name]);
  const approximate = field.boundary === 'approximate';

  const commitName = () => {
    if (name.trim() && name.trim() !== field.name) p.onRename(name);
    else setName(field.name);
  };

  return (
    <div className="space-y-4 p-4">
      <button type="button" onClick={p.onBack} className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-parcel px-2 font-semibold text-field hover:bg-field-tint">
        <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
          <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        All fields
      </button>

      <div>
        <label htmlFor={renameId} className="sr-only">
          Field name (edit to rename)
        </label>
        <input
          id={renameId}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setName(field.name);
          }}
          className="font-plate -mx-2 w-[calc(100%+1rem)] rounded-parcel border border-transparent bg-transparent px-2 py-1 text-2xl hover:border-line focus:border-field focus:bg-panel"
        />
        <p className="text-[15px] text-ink-soft">
          {approximate ? (
            <span className="font-semibold text-wheat-deep">Boundary not drawn</span>
          ) : (
            <>
              <span className="font-semibold text-ink" data-testid="field-acres">
                {formatAcres(field.areaM2)}
              </span>
              , {boundaryText(field)}
              {field.importMeta && <span> from {field.importMeta.fileName}</span>}
            </>
          )}
        </p>
      </div>

      {p.actions}

      {!p.edit && <IssueList issues={p.issues.filter((i) => i.level === 'warning' && !(approximate && i.code === 'overlap'))} />}

      {p.edit ? (
        <ShapeEditor {...p} edit={p.edit} />
      ) : approximate ? (
        <div className="rounded-parcel border border-wheat/40 bg-wheat-tint p-4" data-testid="boundary-not-drawn">
          <p className="text-[15px] font-semibold text-wheat-deep">This field only has a pin</p>
          <p className="mt-1 text-[14.5px] leading-snug text-wheat-deep">
            Until you draw its edges, the profile and crop history use an approximate area around the pin. Draw the boundary for accurate acreage and data.
          </p>
          <Button className="mt-3" onClick={() => p.onStartEdit('draw')}>
            Draw boundary
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => p.onStartEdit('vertices')}>
            Edit boundary
          </Button>
          <Button variant="ghost" onClick={() => p.onStartEdit('draw')}>
            Redraw from scratch
          </Button>
        </div>
      )}

      <CropsCard field={field} lookupsOn={p.lookupsOn} onChange={p.onCrops} onRetryDetection={p.onRetryCdl} />
      <ProfileCard profile={p.profile && p.profile.geometryHash === field.geometryHash ? p.profile : undefined} lookupsOn={p.lookupsOn} onRefresh={p.onRefreshSource} onTurnOnLookups={p.onTurnOnLookups} />

      <div className="pb-4 pt-2">
        {confirmDelete ? (
          <div className="rounded-parcel border border-alert/30 bg-alert-tint p-4" role="alertdialog" aria-labelledby={deleteHeadingId}>
            <p id={deleteHeadingId} className="text-[15px] text-[#7a2c1d]">
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
          <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-11 rounded-parcel px-2 font-semibold text-alert hover:bg-alert-tint">
            Delete field
          </button>
        )}
      </div>
    </div>
  );
}

function ShapeEditor(p: Props & { edit: ShapeEdit }) {
  const blocking = hasBlockingIssue(p.editIssues);
  const geometry = p.edit.geometry;
  return (
    <div className="rounded-parcel border border-field/40 bg-field-tint/60 p-4" role="status">
      {p.edit.kind === 'vertices' ? (
        <>
          <p className="text-[15px] font-semibold">Editing the boundary</p>
          <p className="mt-1 text-[14.5px] text-ink-soft">Drag the corners on the map. Drag a midpoint to add a corner; right-click or long-press a corner to remove it.</p>
        </>
      ) : (
        <p className="text-[15px] font-semibold">{geometry ? 'New boundary ready to save' : 'Tracing the boundary on the map'}</p>
      )}
      {geometry && (
        <>
          <p className="mt-3 font-plate text-2xl">{formatAcres(areaM2(geometry))}</p>
          <div className="mt-2">
            <IssueList issues={p.editIssues} />
          </div>
          <p className="mt-2 text-[13.5px] text-ink-faint">Saving a new shape refreshes the field profile and re-checks crops you have not confirmed yet.</p>
        </>
      )}
      <div className="mt-3 flex gap-2">
        {geometry && (
          <Button onClick={p.onSaveEdit} disabled={blocking}>
            Save shape
          </Button>
        )}
        <Button variant="secondary" onClick={p.onCancelEdit}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
