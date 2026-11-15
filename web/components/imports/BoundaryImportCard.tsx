'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { formatAcres, areaM2 } from '@/lib/domain/acreage';
import { createField } from '@/lib/domain/field';
import { setSeasonCrop } from '@/lib/domain/cropHistory';
import { CROP_CATALOG } from '@/lib/domain/crops';
import { hasBlockingIssue, overlapIssues } from '@/lib/domain/validation';
import { useFarm, useStore } from '@/lib/client/StoreProvider';
import { type BoundaryCandidate, candidateName, nameColumns, normalizeFeatures, type SkippedFeature } from '@/lib/import/normalize';
import { type AnyFeature, ImportError, parseBoundaryFile } from '@/lib/import/parse';
import type { MapShape } from '../map/FieldMap';
import { Button } from '../ui/Button';
import { DropZone, formatBytes } from './DropZone';

const FieldMap = dynamic(() => import('../map/FieldMap'), { ssr: false, loading: () => <div className="h-full w-full bg-[#dfe8e2]" /> });

interface Parsed {
  fileName: string;
  size: number;
  features: AnyFeature[];
  /** Fields that existed when the file was read; overlap checks use these, not fields this import adds. */
  existing: Array<{ id: string; name: string; geometry: import('@/lib/domain/types').FieldGeometry }>;
}

export function BoundaryImportCard() {
  const store = useStore();
  const { fields } = useFarm();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [split, setSplit] = useState(false);
  const [column, setColumn] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const result = useMemo(() => (parsed ? normalizeFeatures(parsed.features, { splitMultiPolygons: split }) : null), [parsed, split]);
  const columns = useMemo(() => (result ? nameColumns(result.candidates) : { columns: [], best: null }), [result]);
  const hasMulti = !!parsed?.features.some((f) => f.geometry?.type === 'MultiPolygon' && f.geometry.coordinates.length > 1);

  const withOverlaps = useMemo(
    () => (result?.candidates ?? []).map((c) => ({ ...c, issues: [...c.issues, ...overlapIssues(c.geometry, parsed?.existing ?? [])] })),
    [result, parsed],
  );

  const reset = () => {
    setParsed(null);
    setError(null);
    setPicked(new Set());
  };

  const onFiles = async ([file]: File[]) => {
    setError(null);
    setBusy(true);
    try {
      const features = await parseBoundaryFile(file);
      const norm = normalizeFeatures(features, { splitMultiPolygons: false });
      if (norm.candidates.length === 0) {
        setError(`No field boundaries were found in "${file.name}". ${norm.skipped.length ? `It has ${norm.skipped.length} feature${norm.skipped.length === 1 ? '' : 's'}, but none are areas (polygons) or points.` : 'The file is empty.'}`);
        return;
      }
      setParsed({ fileName: file.name, size: file.size, features, existing: fields.map((f) => ({ id: f.id, name: f.name, geometry: f.feature.geometry })) });
      setSplit(false);
      setColumn(nameColumns(norm.candidates).best);
      setPicked(new Set(norm.candidates.filter((c) => !hasBlockingIssue(c.issues)).map((c) => c.key)));
    } catch (err) {
      setError(err instanceof ImportError ? err.message : `"${file.name}" could not be read: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: string) => {
    const c = withOverlaps.find((x) => x.key === key);
    if (!c || hasBlockingIssue(c.issues)) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const add = async () => {
    if (!parsed) return;
    setAdding(true);
    setError(null);
    try {
      const used = new Set(store.getSnapshot().fields.map(field => field.id));
      const newFields = withOverlaps.filter(c => picked.has(c.key)).map((c, i) => {
        const entries = Object.entries(c.properties);
        const sourceId = entries.find(([key]) => /^field[_\s-]?id$/i.test(key))?.[1] ?? parsed.features[c.sourceIndex].id ?? entries.find(([key]) => /^id$/i.test(key))?.[1];
        const base = typeof sourceId === 'string' || typeof sourceId === 'number' ? String(sourceId).trim() : '';
        const id = base && c.partIndex !== undefined ? `${base}.part${c.partIndex + 1}` : base;
        if (id && (used.has(id) || Object.hasOwn(Object.prototype, id) || id === 'prototype')) throw new Error(`Field ID "${id}" is already in use or reserved. Choose a different ID in the file.`);
        const field = createField({ id: id || undefined, name: candidateName(c, column, i + 1), geometry: c.geometry,
          definedBy: 'import', importMeta: { fileName: parsed.fileName, sourceFeatureIndex: c.sourceIndex } });
        used.add(field.id);
        // Whole-feature acreage cannot also be assigned in full to each split part.
        const properties = c.partIndex === undefined ? c.properties : Object.fromEntries(entries.filter(([key]) => !/acre|area/i.test(key)));
        field.feature.properties = { ...properties, name: field.name, originalProperties: c.properties };
        for (const season of [field.crops.current, ...field.crops.history]) {
          const raw = entries.find(([key]) => new RegExp(`^crop[_ -]?${season.year}$`, 'i').test(key))?.[1];
          if (typeof raw !== 'string' || !raw.trim()) continue;
          const value = raw.trim().toLowerCase();
          const crop = CROP_CATALOG.find(entry => entry.name.toLowerCase() === value || entry.id === value || entry.aliases?.includes(value));
          field.crops = setSeasonCrop(field.crops, season.year, crop ? { kind: 'catalog', id: crop.id } : { kind: 'other', text: raw.trim() });
        }
        return field;
      });
      await store.addFields(newFields);
      router.push(`/fields?imported=${newFields.length}`);
    } catch (err) {
      setError((err as Error).message);
    } finally { setAdding(false); }
  };

  const shapes: MapShape[] = withOverlaps.map((c, i) => ({
    id: c.key,
    name: candidateName(c, column, i + 1),
    geometry: c.geometry,
    tone: hasBlockingIssue(c.issues) ? 'error' : picked.has(c.key) ? 'selected' : 'muted',
  }));

  return (
    <section className="rounded-[var(--radius-panel)] border border-line bg-panel p-5 md:col-span-2 lg:p-6" aria-labelledby="boundaries-h">
      <div className={parsed ? '' : 'grid gap-6 lg:grid-cols-2 lg:items-stretch'}>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h2 id="boundaries-h" className="font-plate text-xl">
              Land boundaries
            </h2>
            <span className="shrink-0 rounded-full bg-field-tint px-2.5 py-1 text-[12.5px] font-semibold text-field">Available</span>
          </div>
          <p className="mt-1 max-w-[62ch] text-[15px] leading-relaxed text-ink-soft">
            Import field outlines from a farm platform, GIS or Google Earth. Include a fieldId to join your other records. Crop columns named crop_YYYY supply the crop for that season.
          </p>
          {!parsed && (
            <ol className="mt-4 space-y-2 text-[15px] leading-snug">
              {[
                'Export your field boundaries as GeoJSON, KML, or a zipped shapefile.',
                'Drop the file here. It is read in your browser and not uploaded anywhere.',
                'Pick which shapes become fields. PlotTwist then looks up crop history, weather and soil for each one.',
              ].map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-tint text-[14px] font-semibold text-sky-deep" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="pt-0.5 text-ink-soft">{step}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {!parsed && (
          <div className="flex min-w-0 flex-col">
            <DropZone
              className="flex-1"
              accept={['.geojson', '.json', '.kml', '.zip']}
              acceptLabel="GeoJSON (.geojson, .json), KML (.kml), or a zipped shapefile (.zip with .shp, .shx, .dbf and .prj)"
              busy={busy}
              onFiles={onFiles}
              onReject={setError}
              testId="boundary-file"
            />
            {error && (
              <p className="mt-3 rounded-[var(--radius-control)] bg-alert-tint px-3 py-2 text-[14.5px] text-[#7a2c1d]" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </div>

      {parsed && result && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="relative h-[320px] overflow-hidden rounded-[var(--radius-panel)] border border-line lg:h-[460px]">
            <FieldMap className="absolute inset-0" shapes={shapes} onSelect={toggle} focus={{ key: `${parsed.fileName}-${split}`, kind: 'geometry', geometry: shapes.map((s) => s.geometry) }} />
          </div>
          <div className="min-w-0">
            <p className="text-[15px]">
              <span className="font-semibold">{parsed.fileName}</span> <span className="text-ink-soft">({formatBytes(parsed.size)})</span>
            </p>
            <p className="text-[14.5px] text-ink-soft">
              {result.candidates.length} shape{result.candidates.length === 1 ? '' : 's'} found. Tap a shape or a row to include or leave it out.
            </p>

            <div className="mt-3 space-y-3">
              {columns.columns.length > 0 && (
                <label className="block text-[15px] font-semibold">
                  Name fields from
                  <select value={column ?? ''} onChange={(e) => setColumn(e.target.value || null)} className="mt-1 block min-h-12 w-full rounded-[var(--radius-control)] border border-line-strong bg-panel px-3 font-normal">
                    <option value="">Number them (Imported field 1, 2…)</option>
                    {columns.columns.map((c) => (
                      <option key={c} value={c}>
                        Column &ldquo;{c}&rdquo;
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {hasMulti && (
                <label className="flex items-start gap-3 text-[15px]">
                  <input
                    type="checkbox"
                    checked={split}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setSplit(next);
                      const n = normalizeFeatures(parsed.features, { splitMultiPolygons: next });
                      setPicked(new Set(n.candidates.filter((c) => !hasBlockingIssue(c.issues)).map((c) => c.key)));
                    }}
                    className="mt-1 h-5 w-5 accent-[var(--color-sky)]"
                  />
                  <span>
                    <span className="font-semibold">Split multi-part shapes</span>
                    <span className="block text-ink-soft">Make each separate piece its own field.</span>
                  </span>
                </label>
              )}
            </div>

            <ul className="mt-3 max-h-[300px] space-y-2 overflow-y-auto pr-1" aria-label="Shapes in the file">
              {withOverlaps.map((c, i) => (
                <CandidateRow key={c.key} c={c} name={candidateName(c, column, i + 1)} checked={picked.has(c.key)} onToggle={() => toggle(c.key)} />
              ))}
            </ul>

            {result.skipped.length > 0 && (
              <details className="mt-3 text-[14px] text-ink-soft">
                <summary className="min-h-10 cursor-pointer font-semibold">
                  {result.skipped.length} feature{result.skipped.length === 1 ? '' : 's'} skipped
                </summary>
                <ul className="mt-1 space-y-1">
                  {result.skipped.map((s: SkippedFeature) => (
                    <li key={s.sourceIndex}>
                      Feature {s.sourceIndex + 1}: {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={add} disabled={picked.size === 0 || adding}>
                {adding ? 'Adding…' : `Add ${picked.size} field${picked.size === 1 ? '' : 's'}`}
              </Button>
              <Button variant="secondary" onClick={reset}>
                Choose a different file
              </Button>
            </div>
            {error && <p role="alert" className="mt-2 text-sm text-alert">{error}</p>}
          </div>
        </div>
      )}
    </section>
  );
}

function CandidateRow({ c, name, checked, onToggle }: { c: BoundaryCandidate; name: string; checked: boolean; onToggle: () => void }) {
  const blocking = hasBlockingIssue(c.issues);
  return (
    <li>
      <label className={`flex items-start gap-3 rounded-[var(--radius-control)] border px-3 py-2 ${blocking ? 'border-alert/30 bg-alert-tint/50' : checked ? 'border-sky/50 bg-sky-tint/50' : 'border-line bg-paper'}`}>
        <input type="checkbox" checked={checked} disabled={blocking} onChange={onToggle} className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-sky)]" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[15px] font-semibold">{name}</span>
            <span className="shrink-0 text-[14px] text-ink-soft">{formatAcres(areaM2(c.geometry))}</span>
          </span>
          {c.issues.map((i) => (
            <span key={i.code + i.message} className={`block text-[13.5px] leading-snug ${i.level === 'error' ? 'text-alert' : 'text-wheat-deep'}`}>
              {i.message}
            </span>
          ))}
        </span>
      </label>
    </li>
  );
}
