import { CROP_CATALOG } from '../domain/crops';
import type { Cell, ImportKind, Table } from './types';

/**
 * Column roles per record type and the header words that identify them. Matching is on normalized
 * headers (lower case, no punctuation), so "Yield (bu/ac)", "YIELD_BU_AC" and "Dry Yield" all match.
 */
export interface Role {
  id: string;
  label: string;
  required?: boolean;
  /** Each entry is a list of words that must all appear in the header. */
  synonyms: string[][];
}

export const ROLES: Record<ImportKind, Role[]> = {
  yield: [
    { id: 'field', label: 'Field name', synonyms: [['field'], ['farm', 'field'], ['client', 'field'], ['paddock'], ['block']] },
    { id: 'year', label: 'Year or harvest date', synonyms: [['year'], ['season'], ['crop', 'year'], ['harvest', 'date'], ['date']] },
    { id: 'crop', label: 'Crop', required: true, synonyms: [['crop'], ['commodity'], ['product'], ['variety', 'crop']] },
    { id: 'buPerAc', label: 'Yield (bu/ac)', synonyms: [['yield', 'bu', 'ac'], ['dry', 'yield'], ['avg', 'yield'], ['average', 'yield'], ['yield']] },
    { id: 'totalBu', label: 'Total bushels', synonyms: [['total', 'bu'], ['bushels'], ['dry', 'volume'], ['total', 'yield'], ['volume']] },
    { id: 'acres', label: 'Acres harvested', synonyms: [['harvested', 'acres'], ['area'], ['acres'], ['ac']] },
    { id: 'moisture', label: 'Moisture (%)', synonyms: [['moisture'], ['moist']] },
  ],
  finance: [
    { id: 'date', label: 'Date', required: true, synonyms: [['date'], ['transaction', 'date'], ['created'], ['posted']] },
    { id: 'name', label: 'Payer or payee', synonyms: [['name'], ['payee'], ['customer'], ['vendor'], ['merchant'], ['counterparty']] },
    { id: 'memo', label: 'Description or memo', synonyms: [['memo', 'description'], ['description'], ['memo'], ['details'], ['narrative']] },
    { id: 'account', label: 'Account or category', synonyms: [['account'], ['category'], ['split'], ['class'], ['type']] },
    { id: 'amount', label: 'Amount', synonyms: [['amount'], ['net'], ['total'], ['value']] },
    { id: 'debit', label: 'Money out (debit)', synonyms: [['debit'], ['withdrawal'], ['payment'], ['money', 'out'], ['spent']] },
    { id: 'credit', label: 'Money in (credit)', synonyms: [['credit'], ['deposit'], ['money', 'in'], ['received']] },
    { id: 'qty', label: 'Quantity (bushels)', synonyms: [['qty'], ['quantity'], ['bushels'], ['bu']] },
    { id: 'product', label: 'Product or item', synonyms: [['product', 'service'], ['item'], ['product'], ['commodity']] },
  ],
  supplier: [
    { id: 'date', label: 'Date', synonyms: [['invoice', 'date'], ['date']] },
    { id: 'supplier', label: 'Supplier', synonyms: [['supplier'], ['vendor'], ['dealer'], ['seller'], ['coop'], ['retailer']] },
    { id: 'product', label: 'Product', required: true, synonyms: [['product'], ['description'], ['item'], ['material'], ['name']] },
    { id: 'qty', label: 'Quantity', synonyms: [['qty'], ['quantity'], ['units'], ['amount', 'ordered'], ['count']] },
    { id: 'unit', label: 'Unit', synonyms: [['unit'], ['uom'], ['u', 'm'], ['measure']] },
    { id: 'unitPrice', label: 'Unit price', synonyms: [['unit', 'price'], ['price', 'unit'], ['rate'], ['price'], ['each']] },
    { id: 'total', label: 'Line total', synonyms: [['extended'], ['line', 'total'], ['ext', 'price'], ['total'], ['amount']] },
  ],
  machine: [
    { id: 'field', label: 'Field name', synonyms: [['field'], ['farm', 'field'], ['client', 'field'], ['location']] },
    { id: 'date', label: 'Date', synonyms: [['start', 'date'], ['date'], ['time'], ['start']] },
    { id: 'operation', label: 'Operation', synonyms: [['operation'], ['activity'], ['task'], ['job'], ['work', 'type'], ['type']] },
    { id: 'product', label: 'Product or variety', synonyms: [['product'], ['variety'], ['hybrid'], ['material'], ['chemical'], ['fertilizer']] },
    { id: 'crop', label: 'Crop', synonyms: [['crop'], ['commodity']] },
    { id: 'rate', label: 'Average rate', synonyms: [['avg', 'rate'], ['average', 'rate'], ['applied', 'rate'], ['rate'], ['target', 'rate']] },
    { id: 'rateUnit', label: 'Rate unit', synonyms: [['rate', 'unit'], ['unit'], ['uom']] },
    { id: 'area', label: 'Area (ac)', synonyms: [['area'], ['acres'], ['worked', 'area'], ['ac']] },
  ],
};

export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[_/\\().,:;#%$-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(h: string): string[] {
  return norm(h).split(' ');
}

/** Higher = better match; 0 = no match. Earlier synonyms and full-header matches score higher. */
function score(header: string, role: Role): number {
  const w = words(header);
  let best = 0;
  role.synonyms.forEach((syn, i) => {
    if (syn.every((s) => w.some((x) => x === s || (s.length > 3 && x.startsWith(s))))) {
      const exact = syn.length === w.length ? 3 : 0;
      best = Math.max(best, 10 * syn.length + exact - i);
    }
  });
  return best;
}

export type ColumnMapping = Record<string, number | null>;

/** Pick the best column for each role; one column serves one role. */
export function detectMapping(headers: string[], kind: ImportKind): ColumnMapping {
  const roles = ROLES[kind];
  const pairs: Array<{ role: string; col: number; s: number }> = [];
  roles.forEach((r) => headers.forEach((h, col) => {
    const s = score(h, r);
    if (s > 0) pairs.push({ role: r.id, col, s });
  }));
  pairs.sort((a, b) => b.s - a.s);
  const out: ColumnMapping = Object.fromEntries(roles.map((r) => [r.id, null]));
  const usedCols = new Set<number>();
  for (const p of pairs) {
    if (out[p.role] !== null || usedCols.has(p.col)) continue;
    out[p.role] = p.col;
    usedCols.add(p.col);
  }
  return out;
}

export function isHeaderFor(kind: ImportKind) {
  return (h: string) => ROLES[kind].some((r) => score(h, r) > 0);
}

/** How well a table fits a record type, to pick the right sheet of a workbook. */
export function tableFit(t: Table, kind: ImportKind): number {
  const m = detectMapping(t.headers, kind);
  return Object.values(m).filter((v) => v !== null).length * 10 + Math.min(t.rows.length, 9);
}

// ---------- cell parsing ----------

/** "$1,234.50" → 1234.5, "(12.00)" → -12, "12.5 bu/ac" → 12.5, "" → undefined. */
export function toNumber(c: Cell | undefined): number | undefined {
  if (c === null || c === undefined) return undefined;
  if (typeof c === 'number') return Number.isFinite(c) ? c : undefined;
  let s = c.trim();
  if (!s) return undefined;
  const negParen = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, '');
  const trailingMinus = /-$/.test(s);
  const m = s.replace(/,(?=\d{3}\b)/g, '').match(/-?\$?\s*-?\d+(\.\d+)?|-?\$?\s*-?\.\d+/);
  if (!m) return undefined;
  const n = Number(m[0].replace(/[$\s]/g, ''));
  if (!Number.isFinite(n)) return undefined;
  return negParen || trailingMinus ? -Math.abs(n) : n;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Excel serials, ISO dates, US m/d/y (2- or 4-digit year), "Nov 3, 2025", "2025-11-03 14:02". Returns YYYY-MM-DD. */
export function toDate(c: Cell | undefined): string | undefined {
  if (c === null || c === undefined) return undefined;
  if (typeof c === 'number') {
    if (c > 20000 && c < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(c) * 86400000);
      return d.toISOString().slice(0, 10);
    }
    if (c >= 1990 && c <= 2100) return `${c}-01-01`;
    if (c > 1e9 && c < 1e10) return new Date(c * 1000).toISOString().slice(0, 10); // unix seconds (Stripe)
    return undefined;
  }
  const s = c.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return iso(y, +m[1], +m[2]);
  }
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mo >= 0) return iso(+m[3], mo + 1, +m[2]);
  }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})/);
  if (m) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mo >= 0) return iso(+m[3], mo + 1, +m[1]);
  }
  m = s.match(/^(\d{4})$/);
  if (m) return `${m[1]}-01-01`;
  return undefined;
}

function iso(y: number, mo: number, d: number): string | undefined {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return undefined;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function yearOf(c: Cell | undefined): number | undefined {
  const n = typeof c === 'number' && c >= 1990 && c <= 2100 ? c : undefined;
  if (n) return n;
  const d = toDate(c);
  if (d) return Number(d.slice(0, 4));
  const m = typeof c === 'string' ? c.match(/\b(19|20)\d{2}\b/) : null;
  return m ? Number(m[0]) : undefined;
}

export function text(c: Cell | undefined): string {
  return c === null || c === undefined ? '' : String(c).trim();
}

// ---------- crops ----------

const CROP_WORDS: Array<[RegExp, string]> = [
  [/\bsoy\s*beans?\b|\bsoybeans?\b|\bsoy\b|\bbeans?\b/, 'soybeans'],
  [/\bsweet\s*corn\b/, 'sweet-corn'],
  [/\bpop\s*corn\b/, 'popcorn'],
  [/\bcorn\b|\bmaize\b|\byellow\s*dent\b|\bgrain\s*corn\b/, 'corn'],
  [/\bwinter\s*wheat\b|\bhrw\b|\bsrw\b/, 'winter-wheat'],
  [/\bspring\s*wheat\b|\bhrs\b/, 'spring-wheat'],
  [/\bdurum\b/, 'durum-wheat'],
  [/\bwheat\b/, 'winter-wheat'],
  [/\boats?\b/, 'oats'],
  [/\bbarley\b/, 'barley'],
  [/\brye\b/, 'rye'],
  [/\bsorghum\b|\bmilo\b/, 'sorghum'],
  [/\balfalfa\b/, 'alfalfa'],
  [/\bhay\b/, 'other-hay'],
  [/\bcanola\b/, 'canola'],
  [/\bsunflowers?\b/, 'sunflower'],
  [/\bcotton\b/, 'cotton'],
];

/** Recognize a crop in free text ("CORN #2 YEL", "Soybeans - RR2X", "HRW Wheat"). */
export function cropFromText(s: string): string | null {
  const t = s.toLowerCase();
  for (const [re, id] of CROP_WORDS) if (re.test(t)) return id;
  const hit = CROP_CATALOG.find((c) => [c.name, ...(c.aliases ?? [])].some((n) => t.includes(n.toLowerCase())));
  return hit?.id ?? null;
}
