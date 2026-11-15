'use client';

import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_PIN_ACRES, squareAroundPoint } from '@/lib/domain/acreage';
import { createField, renamed, withGeometry } from '@/lib/domain/field';
import type { Field, FieldGeometry, LonLat } from '@/lib/domain/types';
import { overlapIssues, validateGeometry } from '@/lib/domain/validation';
import { useFarm, useStore } from '@/lib/client/StoreProvider';
import type { MapFocus, MapMode, MapShape } from '../map/FieldMap';
import { ResponsivePanel, sheetInset, type Snap, useIsDesktop } from '../ui/ResponsivePanel';
import { AddFieldPanel, type AddStep, type Draft } from './AddFieldPanel';
import { FieldEditor, type ShapeEdit } from './FieldEditor';
import { FieldList } from './FieldList';

const FieldMap = dynamic(() => import('../map/FieldMap'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 flex items-center justify-center bg-[#dfe8e2] text-ink-soft">Loading map…</div>,
});

type View = { kind: 'list' } | { kind: 'add'; step: AddStep; draft: Draft | null; via?: 'zip' | 'coords'; zip?: string } | { kind: 'field'; id: string; edit: ShapeEdit | null };

export function FieldsScreen() {
  const store = useStore();
  const { fields, profiles, settings, loaded } = useFarm();
  const router = useRouter();
  const params = useSearchParams();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [snap, setSnap] = useState<Snap>('half');
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const desktop = useIsDesktop();

  // Arrival from Imports: show what happened, then clean the URL.
  useEffect(() => {
    const n = params.get('imported');
    if (n && loaded) {
      setToast(`Added ${n} field${n === '1' ? '' : 's'} from your file. Weather, soil and crop history are loading; check each field's crops.`);
      const all = fields.slice(-Number(n)).map((f) => f.feature.geometry);
      if (all.length) setFocus({ key: `import-${Date.now()}`, kind: 'geometry', geometry: all });
      router.replace('/fields');
    }
  }, [params, loaded, fields, router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  const selected = view.kind === 'field' ? fields.find((f) => f.id === view.id) : undefined;

  // Field no longer exists (deleted in another tab, etc.)
  useEffect(() => {
    if (view.kind === 'field' && loaded && !selected) setView({ kind: 'list' });
  }, [view, selected, loaded]);

  // Auto-refresh stale sources when a field is opened.
  useEffect(() => {
    if (selected) store.ensureLookups(selected.id);
  }, [selected?.id, store]); // eslint-disable-line react-hooks/exhaustive-deps

  const others = useCallback((excludeId?: string) => fields.filter((f) => f.id !== excludeId).map((f) => ({ id: f.id, name: f.name, geometry: f.feature.geometry })), [fields]);

  const draftIssues = useMemo(() => {
    if (view.kind !== 'add' || !view.draft) return [];
    return [...validateGeometry(view.draft.geometry), ...overlapIssues(view.draft.geometry, others())];
  }, [view, others]);

  const fieldIssues = useMemo(() => (selected ? [...validateGeometry(selected.feature.geometry), ...overlapIssues(selected.feature.geometry, others(selected.id))] : []), [selected, others]);

  const editIssues = useMemo(() => {
    if (view.kind !== 'field' || !view.edit) return [];
    return [...validateGeometry(view.edit.geometry), ...overlapIssues(view.edit.geometry, others(view.id))];
  }, [view, others]);

  // ---------- map wiring ----------
  const shapes: MapShape[] = useMemo(
    () => fields.map((f) => ({ id: f.id, name: f.name, geometry: f.feature.geometry, tone: view.kind === 'field' && view.id === f.id ? 'selected' : view.kind === 'add' ? 'muted' : 'default' })),
    [fields, view],
  );

  let mode: MapMode = 'browse';
  let draft: { geometry?: FieldGeometry; pin?: LonLat } | null = null;
  if (view.kind === 'add') {
    if (view.step === 'draw' && !view.draft) mode = 'draw';
    if ((view.step === 'pin' || view.step === 'coords' || view.step === 'zip') && (view.draft?.pin || view.step === 'pin')) mode = 'pin';
    if (view.draft) draft = { geometry: view.draft.geometry, pin: view.draft.pin?.center };
  } else if (view.kind === 'field' && view.edit) {
    if (view.edit.kind === 'vertices') mode = 'edit';
    else {
      mode = 'pin';
      draft = { geometry: view.edit.geometry, pin: view.edit.center };
    }
  }

  // Keep the map usable on phones while drawing or placing a pin.
  useEffect(() => {
    if (mode === 'draw' || (mode === 'pin' && view.kind === 'add' && !view.draft)) setSnap('peek');
  }, [mode, view]);

  const selectField = (id: string) => {
    const f = fields.find((x) => x.id === id);
    setView({ kind: 'field', id, edit: null });
    setSnap('half');
    if (f) setFocus({ key: `sel-${id}-${Date.now()}`, kind: 'geometry', geometry: f.feature.geometry });
  };

  const placePin = (center: LonLat) => {
    if (view.kind === 'add') {
      const acres = view.draft?.pin?.acres ?? DEFAULT_PIN_ACRES;
      const definedBy = view.via === 'zip' ? 'zip-pin' : view.via === 'coords' ? 'coordinates' : 'pin';
      const geometry = squareAroundPoint(center, acres);
      if (!view.draft) setFocus({ key: `pin-${Date.now()}`, kind: 'geometry', geometry });
      setView({ ...view, step: view.step === 'draw' ? 'pin' : view.step, draft: { geometry, definedBy, pin: { center, acres } } });
      setSnap('half');
    } else if (view.kind === 'field' && view.edit?.kind === 'pin') {
      setView({ ...view, edit: { ...view.edit, center, geometry: squareAroundPoint(center, view.edit.acres) } });
    }
  };

  const saveDraft = async (name: string) => {
    if (view.kind !== 'add' || !view.draft) return;
    const field = createField({ name, geometry: view.draft.geometry, definedBy: view.draft.definedBy, pin: view.draft.pin });
    await store.addFields([field]);
    setView({ kind: 'field', id: field.id, edit: null });
    setSnap('half');
    setFocus({ key: `saved-${field.id}`, kind: 'geometry', geometry: field.feature.geometry });
    setToast(`Saved ${field.name}. Fetching its profile and crop history.`);
  };

  const update = (next: Field) => void store.updateField(next);

  return (
    <div className="absolute inset-0 flex">
      <ResponsivePanel label="Fields panel" snap={snap} onSnap={setSnap}>
        {view.kind === 'list' && (
          <FieldList
            fields={fields}
            loaded={loaded}
            selectedId={null}
            settings={settings}
            onSelect={selectField}
            onAdd={() => {
              setView({ kind: 'add', step: 'choose', draft: null });
              setSnap('half');
            }}
            onToggleLookups={(on) => void store.setSettings({ ...settings, externalLookups: on })}
          />
        )}
        {view.kind === 'add' && (
          <AddFieldPanel
            key={view.draft ? 'draft' : view.step}
            step={view.step}
            draft={view.draft}
            issues={draftIssues}
            defaultName={`Field ${fields.length + 1}`}
            zipArea={view.via === 'zip' && view.zip ? { zip: view.zip } : null}
            onStep={(step) => setView({ kind: 'add', step, draft: null, via: step === 'draw' || step === 'pin' ? view.via : undefined, zip: view.zip })}
            onCancel={() => setView({ kind: 'list' })}
            onLocate={(center, via, zip) => {
              setFocus({ key: `loc-${Date.now()}`, kind: 'point', center, zoom: via === 'zip' ? 13 : 16 });
              if (via === 'zip') {
                setView({ kind: 'add', step: 'pin', draft: null, via, zip });
              } else {
                setView({ kind: 'add', step: 'coords', via, draft: { geometry: squareAroundPoint(center, DEFAULT_PIN_ACRES), definedBy: 'coordinates', pin: { center, acres: DEFAULT_PIN_ACRES } } });
              }
            }}
            onAcres={(acres) => {
              if (view.draft?.pin) setView({ ...view, draft: { ...view.draft, geometry: squareAroundPoint(view.draft.pin.center, acres), pin: { ...view.draft.pin, acres } } });
            }}
            onRedraw={() => setView({ kind: 'add', step: 'draw', draft: null, via: view.via, zip: view.zip })}
            onSave={saveDraft}
          />
        )}
        {view.kind === 'field' && selected && (
          <FieldEditor
            field={selected}
            profile={profiles[selected.id]}
            lookupsOn={settings.externalLookups}
            issues={fieldIssues}
            edit={view.edit}
            editIssues={editIssues}
            onBack={() => setView({ kind: 'list' })}
            onRename={(name) => update(renamed(selected, name))}
            onCrops={(crops) => update({ ...selected, crops, updatedAt: new Date().toISOString() })}
            onStartEdit={(kind) => {
              if (kind === 'pin' && selected.pin) setView({ ...view, edit: { kind: 'pin', center: selected.pin.center, acres: selected.pin.acres, geometry: selected.feature.geometry } });
              else setView({ ...view, edit: { kind: 'vertices', geometry: selected.feature.geometry } });
              setSnap('peek');
            }}
            onPinAcres={(acres) => {
              if (view.edit?.kind === 'pin') setView({ ...view, edit: { ...view.edit, acres, geometry: squareAroundPoint(view.edit.center, acres) } });
            }}
            onSaveEdit={() => {
              if (!view.edit) return;
              const next = view.edit.kind === 'pin' ? withGeometry(selected, view.edit.geometry, { pin: { center: view.edit.center, acres: view.edit.acres } }) : withGeometry(selected, view.edit.geometry, { pin: null });
              update(next);
              setView({ ...view, edit: null });
              setSnap('half');
            }}
            onCancelEdit={() => setView({ ...view, edit: null })}
            onDelete={() => {
              void store.deleteField(selected.id);
              setToast(`Deleted ${selected.name}.`);
              setView({ kind: 'list' });
            }}
            onRefreshSource={(id) => store.refreshSource(selected.id, id)}
            onRetryCdl={() => store.retryCdl(selected.id)}
            onTurnOnLookups={() => void store.setSettings({ ...settings, externalLookups: true })}
          />
        )}
      </ResponsivePanel>

      <div className="relative min-w-0 flex-1">
        <FieldMap
          className="absolute inset-0"
          shapes={shapes}
          mode={mode}
          draft={draft}
          editShapeId={view.kind === 'field' && view.edit?.kind === 'vertices' ? view.id : null}
          focus={focus}
          bottomInset={sheetInset(desktop, snap)}
          onSelect={selectField}
          onDrawn={(geometry) => {
            if (view.kind === 'add') {
              setView({ ...view, draft: { geometry, definedBy: 'polygon' } });
              setSnap('half');
            }
          }}
          onPinPlaced={placePin}
          onEditChange={(geometry) => {
            if (view.kind === 'field' && view.edit?.kind === 'vertices') setView({ ...view, edit: { kind: 'vertices', geometry } });
          }}
        />
        {toast && (
          <div role="status" className="absolute left-1/2 top-3 z-[1002] w-[min(92vw,440px)] -translate-x-1/2 rounded-[var(--radius-panel)] border border-field/30 bg-panel px-4 py-3 text-[15px] shadow-[0_10px_30px_-12px_rgba(29,43,34,0.4)]">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
