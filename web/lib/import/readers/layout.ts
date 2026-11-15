import type { Cell, Table } from '../types';
import { toNumber } from '../mapping';

/** A piece of text on a page with its box, in page units, y growing downward. */
export interface TextItem {
  str: string;
  x0: number;
  x1: number;
  /** Vertical centre. */
  y: number;
  /** Text height, for grouping tolerance. */
  h: number;
  page: number;
}

interface Chunk {
  text: string;
  x0: number;
  x1: number;
}

/** Group items into lines (same page, close vertical centres), then merge close items into chunks. */
export function linesOf(items: TextItem[]): Chunk[][] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => a.page - b.page || a.y - b.y || a.x0 - b.x0);
  const lines: TextItem[][] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    const ref = last?.[0];
    if (ref && ref.page === it.page && Math.abs(ref.y - it.y) <= Math.max(2, Math.min(ref.h, it.h) * 0.5)) last.push(it);
    else lines.push([it]);
  }
  return lines.map((l) => {
    const xs = l.sort((a, b) => a.x0 - b.x0);
    const chunks: Chunk[] = [];
    for (const it of xs) {
      const prev = chunks[chunks.length - 1];
      const gap = prev ? it.x0 - prev.x1 : Infinity;
      // A space-sized gap joins words; anything wider starts a new cell.
      if (prev && gap < Math.max(3, it.h * 0.9)) {
        prev.text += (gap > it.h * 0.15 ? ' ' : '') + it.str.trim();
        prev.x1 = Math.max(prev.x1, it.x1);
      } else chunks.push({ text: it.str.trim(), x0: it.x0, x1: it.x1 });
    }
    return chunks;
  });
}

/** Plain text of the page(s), one line per row, for finding a supplier name and invoice date. */
export function plainText(items: TextItem[]): string {
  return linesOf(items)
    .map((l) => l.map((c) => c.text).join('  '))
    .join('\n');
}

/**
 * Rebuild a table: the header is the line with the most header words (per `isHeader`); every later line's chunks
 * are placed in the header column they overlap most (or the nearest one). Lines with a single chunk and no
 * number (section titles, notes) are skipped.
 */
export function tableFromItems(items: TextItem[], isHeader: (s: string) => boolean, name = 'PDF'): Table | null {
  const lines = linesOf(items);
  let hi = -1;
  let best = 1;
  lines.forEach((l, i) => {
    const s = l.filter((c) => isHeader(c.text)).length;
    if (s > best) {
      best = s;
      hi = i;
    }
  });
  if (hi < 0) return null;
  const header = lines[hi];
  const centre = (c: Chunk) => (c.x0 + c.x1) / 2;
  const rows: Cell[][] = [];
  for (const line of lines.slice(hi + 1)) {
    if (line.length === 1 && toNumber(line[0].text) === undefined) continue;
    const row: Cell[] = header.map(() => null);
    for (const c of line) {
      let col = -1;
      let bestOverlap = 0;
      header.forEach((h, j) => {
        const ov = Math.min(h.x1, c.x1) - Math.max(h.x0, c.x0);
        if (ov > bestOverlap) {
          bestOverlap = ov;
          col = j;
        }
      });
      if (col < 0) col = header.reduce((bi, h, j) => (Math.abs(centre(h) - centre(c)) < Math.abs(centre(header[bi]) - centre(c)) ? j : bi), 0);
      row[col] = row[col] === null ? c.text : `${row[col]} ${c.text}`;
    }
    if (row.filter((v) => v !== null).length >= 2) rows.push(row);
  }
  return rows.length ? { name, headers: header.map((h) => h.text), rows } : null;
}

/** Supplier (first prominent line) and invoice date from free text. */
export function invoiceMeta(text: string): { supplier?: string; date?: string } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const supplier = lines.find((l) => /[a-z]{3}/i.test(l) && !/invoice|statement|bill to|ship to|page \d|date|^\d/i.test(l))?.split('  ')[0];
  const dm = text.match(/(?:invoice|statement|order)?\s*date[:\s]*([A-Za-z]{3,9}\.? \d{1,2},? \d{4}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})/i);
  return { supplier: supplier?.slice(0, 60), date: dm?.[1] };
}
