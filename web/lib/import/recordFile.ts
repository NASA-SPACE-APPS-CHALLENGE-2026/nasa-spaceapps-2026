import type { RawRow } from '../domain/finance/forecastRecords';

const structuredColumns = new Set(['geometry', 'currentRotation', 'proposedRotation', 'supportedCrops', 'soil', 'location']);

/** CSV with quoted commas, newlines and escaped quotes. ID and date cells stay as text. */
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '';
  let quoted = false, closed = false;
  const finishCell = () => {
    row.push(cell);
    cell = '';
    closed = false;
  };
  const finishRow = () => {
    finishCell();
    if (row.some((part) => part.trim() !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') cell += char;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = false;
        closed = true;
      }
    } else if (char === ',') finishCell();
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      finishRow();
    } else if (char === '"' && !closed && cell === '') quoted = true;
    else if (closed || char === '"') throw new Error(`Invalid quoting in CSV record ${rows.length + 1}.`);
    else cell += char;
  }
  if (quoted) throw new Error('The last quoted cell has no closing quote.');
  finishRow();
  return rows;
}

export function parseRecordFile(name: string, contents: string): RawRow[] {
  const text = contents.replace(/^\uFEFF/, '');
  let records: unknown;
  if (name.toLowerCase().endsWith('.csv')) {
    const [head, ...rows] = csvRows(text);
    const keys = head?.map((cell) => cell.trim());
    if (!keys?.length || keys.some((key) => !key) || new Set(keys).size !== keys.length) {
      throw new Error('CSV needs one distinct, nonempty column name per column.');
    }
    records = rows.map((row, i) => {
      if (row.length !== keys.length) throw new Error(`Record ${i + 1} has ${row.length} cells for ${keys.length} columns.`);
      return Object.fromEntries(keys.flatMap((key, j) => {
        const value = row[j].trim();
        if (!value) return [];
        if (structuredColumns.has(key) && (value.startsWith('[') || value.startsWith('{'))) {
          try { return [[key, JSON.parse(value)]]; }
          catch { throw new Error(`Record ${i + 1}, column "${key}" contains invalid JSON.`); }
        }
        return [[key, value]];
      }));
    });
  } else {
    try { records = JSON.parse(text); }
    catch { throw new Error('The file contains invalid JSON. Use an array of records.'); }
  }
  if (!Array.isArray(records) || !records.length) throw new Error('Supply at least one record as a JSON array or CSV with a header.');
  return records.map((row: unknown, i) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Record ${i + 1} must be an object with named fields.`);
    const item = row as RawRow;
    const origin = `${name}, record ${i + 1}`;
    return { ...item, source: item.source || origin, importSource: origin };
  });
}
