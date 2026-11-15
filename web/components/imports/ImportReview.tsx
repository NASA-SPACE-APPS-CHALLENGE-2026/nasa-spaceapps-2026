'use client';

import { useId, useMemo, useState } from 'react';
import { ASSUMPTION_BY_ID } from '@/lib/domain/finance/assumptions';
import { buildParams, effectiveLastYear, withImports, type FinanceInputs } from '@/lib/domain/finance/inputs';
import { cropName } from '@/lib/domain/rotation/agronomy';
import type { Field } from '@/lib/domain/types';
import { seasonText, type ImportContext } from '@/lib/import/context';
import { derivedFromImports } from '@/lib/import/derive';
import { detectMapping, ROLES, text } from '@/lib/import/mapping';
import { evaluate, type Draft, type Evaluation } from '@/lib/import/process';
import type { Finding, ImportRecord } from '@/lib/import/types';
import { Button } from '../ui/Button';

const GROUP_ORDER: Finding['group'][] = ['Totals', 'Yields', 'Prices', 'Input costs', 'Field practices', 'Your actual costs', 'Suppliers', 'Crop history'];

const fmt = (v: number | string, unit?: string) => {
  if (typeof v === 'string') return v;
  const n = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : String(v);
  return unit === '$' ? `$${n}` : `${n}${unit ? ` ${unit}` : ''}`;
};

/** What PlotTwist uses today for a finding's target, ignoring the record being reviewed. */
function currentValue(f: Finding, finance: FinanceInputs, others: ImportRecord[], fields: Field[]): string {
  const eff = withImports(finance, derivedFromImports(others));
  const [kind, ...rest] = f.target.split(':');
  if (kind === 'param') {
    const id = rest.join(':');
    if (!ASSUMPTION_BY_ID[id]) return '—';
    const r = buildParams(eff).resolve(id);
    return `${fmt(Math.round(r.value * 100) / 100, r.assumption.unit)}${r.origin === 'default' ? ' (default)' : r.origin === 'import' ? ' (another file)' : ' (you entered)'}`;
  }
  if (kind === 'lastYear') {
    const ly = effectiveLastYear(eff);
    const v = rest[0] === 'totalRevenue' ? ly.totalRevenue : ly.totalCosts;
    return v === undefined ? 'not entered' : fmt(v, '$');
  }
  if (kind === 'supplier') {
    const key = rest[0] as 'seedSupplier' | 'fertilizerSupplier' | 'grainBuyer';
    return finance.suppliers[key] ?? eff.imported?.suppliers[key] ?? 'not entered';
  }
  if (kind === 'field') {
    const [fieldId, what] = rest;
    const sim = finance.simulator[fieldId];
    if (what === 'nRateCorn') {
      const v = sim?.nRateCorn ?? eff.imported?.fields[fieldId]?.nRateCorn;
      return v === undefined ? `budget default (${buildParams(eff).get('corn.nLbs')} lb N/ac)` : `${v} lb N/ac`;
    }
    return sim?.tillage ?? eff.imported?.fields[fieldId]?.tillage ?? 'not set';
  }
  if (kind === 'crop') {
    const field = fields.find((x) => x.id === rest[0]);
    return field ? seasonText(field, Number(rest[1])) : '—';
  }
  return '—';
}

export function FindingList({ findings, picked, onToggle, finance, others, fields }: { findings: Finding[]; picked: Set<string>; onToggle: (target: string, on: boolean) => void; finance: FinanceInputs; others: ImportRecord[]; fields: Field[] }) {
  const groups = GROUP_ORDER.map((g) => ({ g, items: findings.filter((f) => f.group === g) })).filter((x) => x.items.length);
  if (!findings.length) return <p className="text-[15px] text-ink-soft">Nothing in this file changes your numbers. The records are kept for your exports.</p>;
  return (
    <div className="space-y-4">
      {groups.map(({ g, items }) => (
        <fieldset key={g}>
          <legend className="text-[14px] font-semibold uppercase tracking-wide text-ink-soft">{g}</legend>
          <ul className="mt-1 divide-y divide-line rounded-parcel border border-line">
            {items.map((f) => (
              <li key={f.target} className="px-3 py-2.5">
                <label className="flex items-start gap-3">
                  <input type="checkbox" checked={picked.has(f.target)} onChange={(e) => onToggle(f.target, e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-field)]" data-testid={`finding-${f.target}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-[15px] font-semibold">{f.label}</span>
                      <span className="text-[15px] tabular-nums">
                        <span className="text-ink-faint">{currentValue(f, finance, others, fields)}</span>
                        <span aria-hidden> → </span>
                        <span className="sr-only"> would become </span>
                        <strong>{f.target.startsWith('crop:') && typeof f.value === 'string' ? cropName(f.value) : fmt(f.value, f.unit)}</strong>
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[13.5px] text-ink-soft">
                      {f.evidence}
                      {f.confidence === 'low' && <span className="ml-1 font-semibold text-wheat-deep">Check this one.</span>}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}

/** Review a freshly read file: sheet, columns, fields, then which values to use. */
export function ImportReview({ draft, ctx, others, onApply, onCancel }: { draft: Draft; ctx: ImportContext; others: ImportRecord[]; onApply: (d: Draft, ev: Evaluation, applied: string[]) => void; onCancel: () => void }) {
  const [d, setD] = useState(draft);
  const [assign, setAssign] = useState<Record<string, string | null>>({});
  const ev = useMemo(() => evaluate(d, { ...ctx, assign }), [d, ctx, assign]);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const chosen = picked ?? new Set(ev.findings.filter((f) => f.suggested).map((f) => f.target));
  const sheetId = useId();
  const yearId = useId();
  const table = d.tables[d.tableIndex];
  const roles = ROLES[d.kind];
  const unmatched = ev.fieldNames.filter((n) => !(n in assign) && !ctx.fields.some((f) => f.name.toLowerCase() === n.toLowerCase()));
  const fieldNames = ev.fieldNames.slice(0, 30);

  const toggle = (target: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(target);
    else next.delete(target);
    setPicked(next);
  };

  return (
    <div className="mt-4 space-y-5 rounded-parcel border border-field/40 bg-field-tint/40 p-4" data-testid="import-review">
      <div>
        <p className="text-[16px] font-semibold">{d.fileName}</p>
        <p className="text-[14.5px] text-ink-soft">{ev.summary}</p>
      </div>

      {ev.warnings.length > 0 && (
        <ul className="space-y-1 rounded-parcel border border-wheat/40 bg-wheat-tint px-3 py-2 text-[14px] text-wheat-deep" aria-label="Notes about this file">
          {ev.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      {d.tables.length > 1 && (
        <div>
          <label htmlFor={sheetId} className="block text-[14.5px] font-semibold">
            Sheet
          </label>
          <select id={sheetId} value={d.tableIndex} onChange={(e) => {
              const i = Number(e.target.value);
              setD({ ...d, tableIndex: i, mapping: detectMapping(d.tables[i].headers, d.kind) });
            }} className="mt-1 min-h-11 rounded-parcel border border-line-strong bg-panel px-3 text-[15px]">
            {d.tables.map((t, i) => (
              <option key={t.name + i} value={i}>
                {t.name} ({t.rows.length} rows)
              </option>
            ))}
          </select>
        </div>
      )}

      {table && d.mapping && (
        <details className="rounded-parcel border border-line bg-panel" open={roles.some((r) => r.required && d.mapping![r.id] === null)}>
          <summary className="min-h-11 cursor-pointer content-center px-3 text-[15px] font-semibold">Columns PlotTwist read ({Object.values(d.mapping).filter((v) => v !== null).length} matched)</summary>
          <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-2">
            {roles.map((r) => (
              <ColumnSelect key={r.id} label={`${r.label}${r.required ? ' (needed)' : ''}`} headers={table.headers} sample={table.rows[0]} value={d.mapping![r.id] ?? null} onChange={(col) => setD({ ...d, mapping: { ...d.mapping!, [r.id]: col } })} />
            ))}
          </div>
        </details>
      )}

      {d.mapYear !== undefined && (
        <div>
          <label htmlFor={yearId} className="block text-[14.5px] font-semibold">
            Year of this map
          </label>
          <input id={yearId} type="number" min={2000} max={2100} value={d.mapYear} onChange={(e) => setD({ ...d, mapYear: Number(e.target.value) || d.mapYear })} className="mt-1 min-h-11 w-32 rounded-parcel border border-line-strong bg-panel px-3 text-[16px]" />
          <p className="mt-1 text-[13.5px] text-ink-faint">The map has no dates, so PlotTwist needs the harvest or application year.</p>
        </div>
      )}

      {fieldNames.length > 0 && (unmatched.length > 0 || Object.keys(assign).length > 0) && (
        <fieldset className="rounded-parcel border border-line bg-panel p-3">
          <legend className="px-1 text-[15px] font-semibold">Which of your fields is which?</legend>
          <p className="text-[14px] text-ink-soft">Field names in the file that PlotTwist could not match exactly.</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {fieldNames
              .filter((n) => unmatched.includes(n) || n in assign)
              .map((n) => (
                <FieldAssign key={n} name={n} fields={ctx.fields} value={n in assign ? assign[n] : undefined} onChange={(v) => setAssign({ ...assign, [n]: v })} />
              ))}
          </div>
        </fieldset>
      )}

      <div>
        <h3 className="text-[16px] font-semibold">What this file can update</h3>
        <p className="mb-2 text-[14px] text-ink-soft">Tick what to use. Your current value is on the left; a number you typed in Finance always stays in charge.</p>
        <FindingList findings={ev.findings} picked={chosen} onToggle={toggle} finance={ctx.finance} others={others} fields={ctx.fields} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onApply(d, ev, [...chosen])} data-testid="apply-import">
          {chosen.size ? `Use ${chosen.size} selected value${chosen.size === 1 ? '' : 's'}` : 'Keep the records only'}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ColumnSelect({ label, headers, sample, value, onChange }: { label: string; headers: string[]; sample?: Array<string | number | null>; value: number | null; onChange: (col: number | null) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[14px] font-semibold">
        {label}
      </label>
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} className="mt-1 min-h-11 w-full rounded-parcel border border-line-strong bg-panel px-3 text-[15px]">
        <option value="">Not in this file</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h}
            {sample && text(sample[i]) ? ` (e.g. ${text(sample[i]).slice(0, 24)})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

function FieldAssign({ name, fields, value, onChange }: { name: string; fields: Field[]; value: string | null | undefined; onChange: (v: string | null) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[14px] font-semibold">
        “{name}” in the file
      </label>
      <select id={id} value={value === undefined ? '' : value === null ? '__none' : value} onChange={(e) => onChange(e.target.value === '__none' ? null : e.target.value || null)} className="mt-1 min-h-11 w-full rounded-parcel border border-line-strong bg-panel px-3 text-[15px]">
        <option value="">Pick a field…</option>
        {fields.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
        <option value="__none">Not one of my fields</option>
      </select>
    </div>
  );
}
