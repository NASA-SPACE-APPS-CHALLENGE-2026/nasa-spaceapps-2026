import * as XLSX from 'xlsx';
import type { Cell, ImportFormat, Table } from '../types';

/** Read CSV, Excel (.xlsx, .xls) or OpenDocument (.ods) into one table per non-empty sheet. */
export function readTabular(bytes: ArrayBuffer | Uint8Array, fileName: string): { format: ImportFormat; tables: Table[] } {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  const format: ImportFormat = ext === 'xlsx' || ext === 'xlsm' ? 'xlsx' : ext === 'xls' ? 'xls' : ext === 'ods' ? 'ods' : 'csv';
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // CSV is read as plain text so "01/02" or "1e5" are not guessed into dates and numbers; we coerce per column later.
  const wb = format === 'csv' ? XLSX.read(new TextDecoder('utf-8').decode(data).replace(/^﻿/, ''), { type: 'string', raw: true }) : XLSX.read(data, { type: 'array', cellDates: true });
  const tables: Table[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
    const table = toTable(name, grid.map((r) => r.map(cell)));
    if (table) tables.push(table);
  }
  return { format, tables };
}

function cell(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** Turn a grid into a table, choosing the header row as the first row that looks like headings. */
export function toTable(name: string, grid: Cell[][], headerHint?: (h: string) => boolean): Table | null {
  const rows = grid.filter((r) => r.some((c) => c !== null && c !== ''));
  if (rows.length < 2) return null;
  let headerIdx = 0;
  let best = -1;
  for (let i = 0; i < Math.min(rows.length - 1, 25); i++) {
    const r = rows[i];
    const texts = r.filter((c) => typeof c === 'string' && !/^[\d$.,()\-\s/]+$/.test(c)).length;
    const hinted = headerHint ? r.filter((c) => typeof c === 'string' && headerHint(c)).length * 3 : 0;
    const score = texts + hinted - (r.filter((c) => typeof c === 'number').length > texts ? 5 : 0);
    if (texts >= 2 && score > best) {
      best = score;
      headerIdx = i;
    }
  }
  const width = Math.max(...rows.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => String(rows[headerIdx][i] ?? `Column ${i + 1}`).trim());
  const body = rows.slice(headerIdx + 1).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? null));
  return { name, headers, rows: body };
}
