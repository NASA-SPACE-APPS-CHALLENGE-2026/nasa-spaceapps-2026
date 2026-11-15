'use client';

import { useId, useMemo, useState } from 'react';
import { setSeasonCrop } from '@/lib/domain/cropHistory';
import { CURRENT_SEASON } from '@/lib/domain/cropHistory';
import { newId } from '@/lib/domain/field';
import { useFarm, useStore } from '@/lib/client/StoreProvider';
import { cropConfirmations } from '@/lib/import/derive';
import { ACCEPT, readFile, ReadError, toRecord, type Draft, type Evaluation } from '@/lib/import/process';
import { browserPdfJs, renderPageToCanvas } from '@/lib/import/readers/pdf';
import { BROWSER_OCR_PATHS, ocrImages } from '@/lib/import/readers/ocr';
import type { ImportKind, ImportRecord } from '@/lib/import/types';
import { Button } from '../ui/Button';
import { DropZone, formatBytes } from './DropZone';
import { FindingList, ImportReview } from './ImportReview';

interface Props {
  kind: ImportKind;
  title: string;
  description: string;
  acceptLabel: string;
  note?: React.ReactNode;
}

const FORMAT_LABEL: Record<string, string> = { csv: 'CSV', xlsx: 'Excel', xls: 'Excel 97–2003', ods: 'OpenDocument', pdf: 'PDF', image: 'Image (read with OCR)', shapefile: 'Shapefile map', isoxml: 'ISOXML task data' };

/** One record type on the Imports tab: drop a file, review what was read, apply, and manage what's applied. */
export function RecordImportCard({ kind, title, description, acceptLabel, note }: Props) {
  const store = useStore();
  const { fields, finance, imports } = useFarm();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const headingId = useId();
  const mine = imports.filter((r) => r.kind === kind);
  const ctx = useMemo(() => ({ fields, currentYear: CURRENT_SEASON, finance }), [fields, finance]);

  const onFiles = async (files: File[]) => {
    const file = files[0];
    setError(null);
    setDraft(null);
    setBusy(`Reading ${file.name}…`);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const d = await readFile({ name: file.name, size: file.size, bytes }, kind, ctx, {
        pdfjs: browserPdfJs,
        renderPage: (p) => renderPageToCanvas(p),
        ocr: (images, onProgress) => ocrImages(images, { paths: BROWSER_OCR_PATHS, onProgress }),
        onStatus: setBusy,
      });
      setDraft(d);
    } catch (e) {
      setError(e instanceof ReadError ? e.message : `PlotTwist couldn't read ${file.name}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  /** Crop-history findings change Fields directly; apply the newly ticked ones. */
  const applyCrops = async (rec: ImportRecord, before: ImportRecord | undefined) => {
    const had = new Set(before ? cropConfirmations(before).map((c) => `${c.fieldId}:${c.year}`) : []);
    for (const c of cropConfirmations(rec)) {
      if (had.has(`${c.fieldId}:${c.year}`)) continue;
      const f = store.field(c.fieldId);
      if (f) await store.updateField({ ...f, crops: setSeasonCrop(f.crops, c.year, { kind: 'catalog', id: c.crop }), updatedAt: new Date().toISOString() });
    }
  };

  const apply = async (d: Draft, ev: Evaluation, applied: string[]) => {
    const rec = toRecord(d, ev, applied, newId());
    await store.saveImport(rec);
    await applyCrops(rec, undefined);
    setDraft(null);
  };

  return (
    <section className="flex flex-col rounded-parcel border border-line bg-panel p-5 lg:p-6" aria-labelledby={headingId} data-testid={`import-card-${kind}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 id={headingId} className="font-plate text-xl">
          {title}
        </h2>
        {mine.length > 0 && <span className="shrink-0 rounded-full bg-field-tint px-2.5 py-1 text-[12.5px] font-semibold text-field">{mine.length} imported</span>}
      </div>
      <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">{description}</p>
      {note && <div className="mt-2 text-[14px] leading-snug text-ink-soft">{note}</div>}
      <div className="mt-4">
        <DropZone accept={ACCEPT[kind]} acceptLabel={acceptLabel} busy={!!busy} onFiles={(fs) => void onFiles(fs)} onReject={setError} testId={`file-${kind}`} />
      </div>
      {busy && (
        <p className="mt-3 flex items-center gap-2 text-[14.5px] text-ink-soft" role="status">
          <span className="spinner" aria-hidden />
          {busy}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-parcel bg-alert-tint px-3 py-2 text-[14.5px] text-[#7a2c1d]" role="alert">
          {error}
        </p>
      )}
      {draft && <ImportReview key={draft.fileName + draft.size} draft={draft} ctx={ctx} others={imports} onApply={(d, ev, a) => void apply(d, ev, a)} onCancel={() => setDraft(null)} />}

      {mine.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label={`${title}: imported files`}>
          {mine.map((r) => (
            <li key={r.id} className="rounded-parcel border border-line bg-paper px-3 py-2.5" data-testid="imported-file">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{r.fileName}</p>
                  <p className="text-[13.5px] text-ink-soft">
                    {FORMAT_LABEL[r.format] ?? r.format}, {formatBytes(r.size)}. {r.summary}.
                  </p>
                  <p className="text-[13.5px] font-semibold text-field">{r.applied.length ? `Using ${r.applied.length} value${r.applied.length === 1 ? '' : 's'} from this file` : 'Records kept; no values used'}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                  <button type="button" onClick={() => setEditing(editing === r.id ? null : r.id)} className="min-h-11 rounded-parcel px-2 text-[14px] font-semibold text-field hover:bg-field-tint" aria-expanded={editing === r.id}>
                    Change<span className="sr-only"> what is used from {r.fileName}</span>
                  </button>
                  <button type="button" onClick={() => void store.removeImport(r.id)} className="min-h-11 rounded-parcel px-2 text-[14px] font-semibold text-alert hover:bg-alert-tint" aria-label={`Remove ${r.fileName}`}>
                    Remove
                  </button>
                </div>
              </div>
              {editing === r.id && <AppliedEditor record={r} others={imports.filter((x) => x.id !== r.id)} onSave={async (applied) => {
                const next = { ...r, applied };
                await store.saveImport(next);
                await applyCrops(next, r);
                setEditing(null);
              }} />}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-auto pt-4 text-[13px] text-ink-faint">Files are read in your browser and never uploaded. Only the rows PlotTwist needs are kept, in this browser. Removing a file undoes the values it set (crop history changes on Fields stay).</p>
    </section>
  );
}

function AppliedEditor({ record, others, onSave }: { record: ImportRecord; others: ImportRecord[]; onSave: (applied: string[]) => void }) {
  const { fields, finance } = useFarm();
  const [picked, setPicked] = useState(new Set(record.applied));
  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3">
      {record.warnings.length > 0 && <p className="text-[13.5px] text-wheat-deep">{record.warnings[0]}</p>}
      <FindingList
        findings={record.findings}
        picked={picked}
        onToggle={(t, on) => {
          const next = new Set(picked);
          if (on) next.add(t);
          else next.delete(t);
          setPicked(next);
        }}
        finance={finance}
        others={others}
        fields={fields}
      />
      <Button onClick={() => onSave([...picked])}>Save</Button>
    </div>
  );
}
