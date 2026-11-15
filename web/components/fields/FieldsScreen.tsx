'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildDemoFarm, demoBlocker } from '@/lib/demo/demoFarm';
import { createField, renamed, withGeometry } from '@/lib/domain/field';
import type { Field, FieldGeometry, LonLat } from '@/lib/domain/types';
import { overlapIssues, validateGeometry } from '@/lib/domain/validation';
import { useFarm, useStore } from '@/lib/client/StoreProvider';
import type { MapFocus, MapMode, MapShape } from '../map/FieldMap';
import { ResponsivePanel, sheetInset, type Snap, useIsDesktop } from '../ui/ResponsivePanel';
import { AddFieldPanel, type AddStep, type Draft, type Located } from './AddFieldPanel';
import { AddressSearch } from './AddressSearch';
import { FieldEditor, type ShapeEdit } from './FieldEditor';
import { FieldList } from './FieldList';

const FieldMap = dynamic(() => import('../map/FieldMap'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 flex items-center justify-center bg-[#dfe8e2] text-ink-soft">Loading map…</div>,
});

/** Zoom level where individual field edges are clear on the imagery. */
export const DRAW_ZOOM = 17;

type View =
  | { kind: 'list' }
  | { kind: 'add'; step: AddStep; located: Located | null; draft: Draft | null }
  | { kind: 'field'; id: string; edit: ShapeEdit | null };

export function FieldsScreen() {
  const store = useStore();
  const { fields, profiles, settings, loaded, plans } = useFarm();
  const router = useRouter();
  const params = useSearchParams();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [snap, setSnap] = useState<Snap>('half');
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
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

  // Overlap checks only against real (drawn) boundaries; a legacy pin's square is not a boundary.
  const others = useCallback(
    (excludeId?: string) => fields.filter((f) => f.id !== excludeId && f.boundary !== 'approximate').map((f) => ({ id: f.id, name: f.name, geometry: f.feature.geometry })),
    [fields],
  );

  const draftIssues = useMemo(() => {
    if (view.kind !== 'add' || !view.draft) return [];
    return [...validateGeometry(view.draft.geometry), ...overlapIssues(view.draft.geometry, others())];
  }, [view, others]);

  const fieldIssues = useMemo(() => (selected ? [...validateGeometry(selected.feature.geometry), ...overlapIssues(selected.feature.geometry, others(selected.id))] : []), [selected, others]);

  const editIssues = useMemo(() => {
    if (view.kind !== 'field' || !view.edit?.geometry) return [];
    return [...validateGeometry(view.edit.geometry), ...overlapIssues(view.edit.geometry, others(view.id))];
  }, [view, others]);

  // ---------- map wiring ----------
  const shapes: MapShape[] = useMemo(
    () =>
      fields.map((f) => ({
        id: f.id,
        name: f.name,
        geometry: f.feature.geometry,
        pinOnly: f.boundary === 'approximate' && f.pin ? f.pin.center : undefined,
        tone: view.kind === 'field' && view.id === f.id ? 'selected' : view.kind === 'add' ? 'muted' : 'default',
      })),
    [fields, view],
  );

  let mode: MapMode = 'browse';
  let draft: { geometry?: FieldGeometry; pin?: LonLat } | null = null;
  if (view.kind === 'add') {
    if (view.step === 'pin' && !view.located) mode = 'pin';
    if (view.step === 'draw' && !view.draft) mode = 'draw';
    draft = view.draft ? { geometry: view.draft.geometry } : view.located ? { pin: view.located.center } : null;
  } else if (view.kind === 'field' && view.edit) {
    if (view.edit.kind === 'vertices') mode = 'edit';
    else if (!view.edit.geometry) mode = 'draw';
    else draft = { geometry: view.edit.geometry };
    if (view.edit.kind === 'draw' && !view.edit.geometry && selected?.boundary === 'approximate' && selected.pin) draft = { pin: selected.pin.center };
  }

  // Keep the map usable on phones while drawing or placing a pin.
  useEffect(() => {
    if (mode === 'draw' || mode === 'pin' || mode === 'edit') setSnap('peek');
  }, [mode]);

  const selectField = (id: string) => {
    const f = fields.find((x) => x.id === id);
    void store.rememberField(id);
    setView({ kind: 'field', id, edit: null });
    setSnap('half');
    if (f) setFocus({ key: `sel-${id}-${Date.now()}`, kind: 'geometry', geometry: f.feature.geometry });
  };

  /** A location was chosen (address, ZIP, pin, coordinates): zoom in and go straight to drawing. */
  const locate = (where: Located) => {
    setFocus({ key: `loc-${Date.now()}`, kind: 'point', center: where.center, zoom: DRAW_ZOOM });
    setView({ kind: 'add', step: 'draw', located: where, draft: null });
  };

  const saveDraft = async (name: string) => {
    if (view.kind !== 'add' || !view.draft) return;
    const field = createField({ name, geometry: view.draft.geometry, definedBy: 'polygon', locatedVia: view.located?.via ?? 'map' });
    await store.addFields([field]);
    void store.rememberField(field.id);
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
              setView({ kind: 'add', step: 'choose', located: null, draft: null });
              setSnap('half');
            }}
            onToggleLookups={(on) => void store.setSettings({ ...settings, externalLookups: on })}
            demoBlocker={loaded ? demoBlocker(fields) : 'loading'}
            onLoadDemo={async () => {
              const demo = buildDemoFarm();
              await store.addFields(demo);
              setFocus({ key: `demo-${Date.now()}`, kind: 'geometry', geometry: demo.map((f) => f.feature.geometry) });
              setToast('Loaded the demo farm: 6 example fields near Ames, Iowa. Their crop histories are made-up examples; weather and soil are real.');
            }}
          />
        )}
        {view.kind === 'add' && (
          <AddFieldPanel
            key={view.draft ? 'draft' : view.step}
            step={view.step}
            located={view.located}
            draft={view.draft}
            issues={draftIssues}
            defaultName={`Field ${fields.length + 1}`}
            lookupsOn={settings.externalLookups}
            onStep={(step) => setView({ kind: 'add', step, located: null, draft: null })}
            onCancel={() => setView({ kind: 'list' })}
            onLocate={locate}
            onRedraw={() => setView({ ...view, step: 'draw', draft: null })}
            onSave={saveDraft}
            addressStep={<AddressSearch lookupsOn={settings.externalLookups} autoFocus onPick={(center, label) => locate({ center, via: 'address', label })} />}
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
              if (kind === 'vertices') {
                setView({ ...view, edit: { kind: 'vertices', geometry: selected.feature.geometry } });
              } else {
                setView({ ...view, edit: { kind: 'draw', geometry: null } });
                if (selected.boundary === 'approximate' && selected.pin) setFocus({ key: `draw-${Date.now()}`, kind: 'point', center: selected.pin.center, zoom: DRAW_ZOOM });
              }
            }}
            onSaveEdit={() => {
              if (!view.edit?.geometry) return;
              update(withGeometry(selected, view.edit.geometry, { pin: null }));
              setView({ ...view, edit: null });
              setSnap('half');
              setFocus({ key: `edited-${Date.now()}`, kind: 'geometry', geometry: view.edit.geometry });
            }}
            onCancelEdit={() => {
              setView({ ...view, edit: null });
              setSnap('half');
            }}
            onDelete={() => {
              void store.deleteField(selected.id);
              setToast(`Deleted ${selected.name}.`);
              setView({ kind: 'list' });
            }}
            onRefreshSource={(id) => store.refreshSource(selected.id, id)}
            onRetryCdl={() => store.retryCdl(selected.id)}
            onTurnOnLookups={() => void store.setSettings({ ...settings, externalLookups: true })}
            actions={
              !view.edit && (
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/rotation?field=${selected.id}`}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-field px-4 text-[15px] font-semibold text-white hover:bg-[#245530]"
                  >
                    Explore rotation
                    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
                      <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                  </Link>
                  {plans.some((pl) => pl.fieldId === selected.id) && (
                    <Link
                      href={`/planner?field=${selected.id}`}
                      className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-control)] border border-line-strong bg-panel px-4 text-[15px] font-semibold text-ink hover:border-sky hover:text-sky-deep"
                    >
                      Open plan
                    </Link>
                  )}
                </div>
              )
            }
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
          onPinPlaced={(center) => {
            if (view.kind === 'add' && view.step === 'pin') locate({ center, via: 'pin', label: 'At your pin' });
          }}
          onDrawn={(geometry) => {
            if (view.kind === 'add') setView({ ...view, draft: { geometry } });
            else if (view.kind === 'field' && view.edit?.kind === 'draw') setView({ ...view, edit: { kind: 'draw', geometry } });
            setSnap('half');
          }}
          onEditChange={(geometry) => {
            if (view.kind === 'field' && view.edit?.kind === 'vertices') setView({ ...view, edit: { kind: 'vertices', geometry } });
          }}
        />
        {mode === 'browse' && view.kind !== 'add' && (
          <div className="absolute left-3 top-3 z-[1001] w-[min(360px,calc(100%-72px))]">
            {desktop || searchOpen ? (
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <AddressSearch
                    variant="toolbar"
                    lookupsOn={settings.externalLookups}
                    autoFocus={!desktop}
                    onPick={(center) => {
                      setFocus({ key: `search-${Date.now()}`, kind: 'point', center, zoom: 16 });
                      if (!desktop) setSearchOpen(false);
                    }}
                  />
                </div>
                {!desktop && (
                  <button type="button" onClick={() => setSearchOpen(false)} className="min-h-12 shrink-0 rounded-[var(--radius-control)] border border-line bg-panel px-3 text-[15px] font-semibold shadow-sm">
                    Close
                  </button>
                )}
              </div>
            ) : (
              <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search an address" className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-control)] border border-line bg-panel text-ink shadow-sm">
                <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden>
                  <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
                  <path d="m13 13 4.5 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        )}
        {toast && (
          <div role="status" className="absolute left-1/2 top-[4.5rem] z-[1002] w-[min(92vw,440px)] -translate-x-1/2 rounded-[var(--radius-panel)] lg:left-auto lg:right-16 lg:top-3 lg:translate-x-0 border border-field/30 bg-panel px-4 py-3 text-[15px] shadow-[0_10px_30px_-12px_rgba(29,43,34,0.4)]">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
