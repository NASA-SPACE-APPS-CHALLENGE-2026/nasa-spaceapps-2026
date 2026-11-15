'use client';

import { useId, useMemo, useState } from 'react';
import { useFarm, useStore } from '@/lib/client/StoreProvider';
import { emptyForecastRecords, type Dataset, type RawRow } from '@/lib/domain/finance/forecastRecords';
import { validateForecastRecords } from '@/lib/domain/finance/forecastImport';
import { parseRecordFile } from '@/lib/import/recordFile';
import { Button } from '../ui/Button';
import { DropZone } from './DropZone';
import { forms, labelOf, lists, numbers } from './recordForms';

const inputStyle = 'mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-line-strong bg-panel px-3 text-[15px] font-normal';
const pageSize = 10;
function textValue(value: unknown) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.join(', ');
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function FieldReference() {
  const { fields, forecastRecords } = useFarm();
  const names = new Map(fields.map(field => [field.id, field.name]));
  for (const row of forecastRecords.land) if (row.id != null) names.set(String(row.id), textValue(row.name) || names.get(String(row.id)) || '');
  if (!names.size) return null;
  return <details className="mt-4 rounded-[var(--radius-control)] border border-line bg-panel px-4 py-3 text-sm">
    <summary className="cursor-pointer font-semibold">Field IDs for your files ({names.size})</summary>
    <dl className="mt-2 divide-y divide-line">{[...names].map(([id, name]) => <div key={id} className="flex flex-wrap gap-x-4 py-1"><dt>{name || 'Unnamed field'}</dt><dd><code>{id}</code></dd></div>)}</dl>
  </details>;
}

function RecordEditor({ dataset, initial, onCancel, onSave, onRemove, busy }: {
  dataset: Dataset; initial: RawRow; onCancel: () => void; onSave: (record: RawRow) => void; onRemove?: () => void; busy: boolean;
}) {
  const spec = forms[dataset];
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(spec.columns.map(key => [key, textValue(initial[key])])));
  const { fields, forecastRecords } = useFarm();
  const datalist = useId();
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const record = { ...initial };
    for (const key of spec.columns) {
      const value = values[key].trim();
      if (value === textValue(initial[key]).trim()) continue;
      if (!value) delete record[key];
      else if (lists.has(key)) record[key] = value.split(',').map(item => item.trim()).filter(Boolean);
      else if (numbers.has(key)) record[key] = Number(value);
      else record[key] = value;
    }
    onSave(record);
  };
  const fieldOptions = new Map(fields.map(field => [field.id, field.name]));
  for (const row of forecastRecords.land) if (row.id != null) fieldOptions.set(String(row.id), textValue(row.name));
  return (
    <form onSubmit={save} className="mt-3 rounded-[var(--radius-control)] border border-line bg-paper p-4">
      <datalist id={datalist}>{[...fieldOptions].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</datalist>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-base font-semibold">{initial.id ? 'Edit record' : 'New record'}</legend>
        {spec.columns.map(key => {
          const choices = spec.choices?.[key];
          const onChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => setValues(prev => ({ ...prev, [key]: e.target.value }));
          return <label key={key} className="min-w-0 text-sm font-semibold">
            {key === 'id' && dataset === 'land' ? 'Field ID' : labelOf(key)}
            {choices
              ? <select value={values[key]} onChange={onChange} className={inputStyle}><option value="">Select…</option>{[...new Set([...choices, ...(values[key] ? [values[key]] : [])])].map(choice => <option key={choice}>{choice}</option>)}</select>
              : <input required={key === 'id' || key === 'source'} list={key === 'fieldId' || (key === 'id' && dataset === 'land') ? datalist : undefined}
                  value={values[key]} onChange={onChange} type={numbers.has(key) ? 'number' : 'text'} step={key === 'season' ? 1 : 'any'} className={inputStyle} />}
          </label>;
        })}
        <div className="col-span-full flex flex-wrap gap-2"><Button type="submit">Save record</Button><Button variant="secondary" onClick={onCancel}>Cancel</Button>{onRemove && <Button variant="ghost" onClick={onRemove}>Remove this record</Button>}</div>
      </fieldset>
    </form>
  );
}

export function RecordImportCard({ dataset }: { dataset: Dataset }) {
  const id = useId();
  const spec = forms[dataset];
  const store = useStore();
  const { forecastRecords, loaded } = useFarm();
  const rows = forecastRecords[dataset];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [edit, setEdit] = useState<{ index: number; row: RawRow } | null>(null);
  const [page, setPage] = useState(0);
  const [removed, setRemoved] = useState<{ row: RawRow; index: number } | null>(null);
  const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
  const first = Math.min(page, lastPage) * pageSize;

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try { setMessage(await work()); }
    catch (err) { setError(err instanceof Error ? err.message : 'The records could not be saved.'); }
    finally { setBusy(false); }
  };
  const addFiles = (files: File[]) => void run(async () => {
    const added: RawRow[] = [];
    for (const file of files) {
      try { for (const row of parseRecordFile(file.name, await file.text())) added.push(row); }
      catch (err) { throw new Error(`${file.name}: ${(err as Error).message}`); }
    }
    const current = store.getSnapshot().forecastRecords[dataset];
    await store.saveForecastRows(dataset, [...current, ...added]);
    setPage(Math.floor(current.length / pageSize));
    return `Imported ${added.length} record${added.length === 1 ? '' : 's'} from ${files.map(f => f.name).join(', ')}.`;
  });
  const saveRow = (next: RawRow) => void run(async () => {
    if (!edit) return '';
    const current = store.getSnapshot().forecastRecords[dataset];
    if (edit.index >= 0 && current[edit.index] !== edit.row) throw new Error('This row changed while you were editing. Cancel and reopen the latest record.');
    const record: RawRow = edit.index >= 0 ? { ...next, originalRecord: edit.row.originalRecord ?? edit.row, correctedAt: new Date().toISOString() } : next;
    await store.saveForecastRows(dataset, edit.index < 0 ? [...current, record] : current.map((row, i) => i === edit.index ? record : row));
    if (edit.index < 0) setPage(Math.floor(current.length / pageSize));
    setEdit(null);
    return `Saved ${String(record.id)}.`;
  });
  const begin = (index: number) => { setError(''); setMessage(''); setEdit({ index, row: index < 0 ? {} : rows[index] }); };
  const removeRow = () => void run(async () => {
    const current = store.getSnapshot().forecastRecords[dataset];
    if (!edit || current[edit.index] !== edit.row) throw new Error('Reopen the latest record to remove it.');
    await store.saveForecastRows(dataset, current.filter((_, i) => i !== edit.index));
    setRemoved(edit); setEdit(null);
    return 'Record removed.';
  });
  const undoRemoval = () => void run(async () => {
    if (!removed) return '';
    const current = [...store.getSnapshot().forecastRecords[dataset]];
    current.splice(removed.index, 0, removed.row);
    await store.saveForecastRows(dataset, current);
    setRemoved(null);
    return 'Record restored.';
  });
  const review = useMemo(() => validateForecastRecords({ ...emptyForecastRecords(), [dataset]: rows }).issues, [dataset, rows]);
  return (
    <section aria-labelledby={id} className="min-w-0 self-start rounded-[var(--radius-panel)] border border-line bg-panel p-5 lg:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="font-plate text-xl">{spec.title}</h2>
        <span className="text-sm tabular-nums text-ink-soft">{rows.length} saved</span>
      </div>
      <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">{spec.description}</p>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold text-sky-deep">File format and example</summary>
        <p className="mt-2">Use these column names in CSV or an array of objects in JSON. Put one record on each row. The file name and record number are saved with imported values.</p>
        <p className="mt-2 break-words text-ink-soft">{spec.columns.join(', ')}</p>
        {Object.entries(spec.choices ?? {}).map(([key, choices]) => <p className="mt-2" key={key}><strong>{labelOf(key)}</strong> · {choices.join(', ')}</p>)}
        {dataset === 'agronomy' && <p className="mt-2">Enter yield per acre in the crop unit, such as bu. Enter harvest efficiency as a fraction. Enter soil nitrogen opening balances and changes in lb N/ac and the yield response in crop units per lb N.</p>}
        {dataset === 'markets' && <p className="mt-2">For operating-rate use USD/acre. An input-rate replaces the budget for its category with the sourced quantity per planted acre, using the original lot ID and unit. To confirm complete historical operating records, enter expense-coverage with value 1 and unit complete for that field, crop and year.</p>}
        <pre className="mt-2 overflow-x-auto rounded bg-paper p-3 text-xs">{JSON.stringify([spec.example], null, 2)}</pre>
      </details>
      <div className="mt-3">
        <DropZone multiple accept={['.csv', '.json']} acceptLabel="CSV or JSON records" busy={busy} disabled={!loaded || !!edit} onFiles={addFiles} onReject={setError} testId={`${dataset}-file`} />
      </div>
      {error && <p role="alert" className="mt-2 rounded bg-alert-tint p-2 text-sm text-alert">{error}</p>}
      {message && <p role="status" className="mt-2 text-sm text-field">{message}</p>}
      {removed && <Button variant="ghost" disabled={busy || !!edit} onClick={undoRemoval}>Undo removal</Button>}
      {review.length > 0 && <details className="mt-2 rounded bg-wheat-tint p-2 text-sm"><summary className="cursor-pointer font-semibold">Records to review ({review.length})</summary><ul className="ml-4 mt-2 list-disc">{review.map((issue, i) => <li key={i}>{issue}</li>)}</ul></details>}
      {edit ? <RecordEditor key={edit.index} initial={edit.row} dataset={dataset} busy={busy} onCancel={() => setEdit(null)} onSave={saveRow} onRemove={edit.index >= 0 ? removeRow : undefined} />
        : <Button className="mt-2" variant="secondary" disabled={busy || !loaded} onClick={() => begin(-1)}>Add record</Button>}
      {rows.length > 0 && <details className="mt-3 border-t border-line pt-3 text-sm">
        <summary className="cursor-pointer font-semibold">Review and correct records ({rows.length})</summary>
        <ul className="mt-2 divide-y divide-line">
          {rows.slice(first, first + pageSize).map((row, i) => <li key={first + i} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0"><strong className="block break-words">{textValue(row.id) || `Row ${first + i + 1} · missing ID`}</strong><span className="block break-words text-ink-soft">{[row.kind ?? row.operation, row.crop ?? row.product, row.season, row.source].filter(Boolean).map(textValue).join(' · ')}</span>
              <details className="mt-1"><summary className="cursor-pointer text-sky-deep">Source and saved values</summary><pre className="mt-1 overflow-x-auto rounded bg-paper p-2 text-xs">{JSON.stringify(row, null, 2)}</pre></details></div>
            <Button variant="ghost" disabled={busy || !!edit} onClick={() => begin(first + i)}>Edit</Button>
          </li>)}
        </ul>
        {lastPage > 0 && <div className="mt-2 flex items-center gap-2"><Button variant="secondary" disabled={first === 0} onClick={() => setPage(first / pageSize - 1)}>Previous</Button><span>Page {first / pageSize + 1} of {lastPage + 1}</span><Button variant="secondary" disabled={first / pageSize === lastPage} onClick={() => setPage(first / pageSize + 1)}>Next</Button></div>}
      </details>}
    </section>
  );
}
