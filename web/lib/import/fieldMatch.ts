import { insideGeometry } from '../domain/acreage';
import type { Field, LonLat } from '../domain/types';

/** "North 40 (Home)" → "north 40 home"; "NORTH_FORTY" stays "north forty". */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export type MatchHow = 'exact' | 'similar' | 'location' | 'none';

/** Match a field name from a file to a PlotTwist field: exact, then contained, then a close spelling. */
export function matchFieldName(name: string | undefined, fields: Field[]): { fieldId?: string; how: MatchHow } {
  if (!name) return { how: 'none' };
  const n = normName(name);
  if (!n) return { how: 'none' };
  const byNorm = fields.find((f) => normName(f.name) === n);
  if (byNorm) return { fieldId: byNorm.id, how: 'exact' };
  const contained = fields.filter((f) => {
    const m = normName(f.name);
    return m.length >= 3 && (n.includes(m) || m.includes(n));
  });
  if (contained.length === 1) return { fieldId: contained[0].id, how: 'similar' };
  let best: { id: string; d: number } | null = null;
  for (const f of fields) {
    const m = normName(f.name);
    const d = lev(n, m);
    if (d <= Math.max(1, Math.floor(Math.min(n.length, m.length) / 5)) && (!best || d < best.d)) best = { id: f.id, d };
  }
  return best ? { fieldId: best.id, how: 'similar' } : { how: 'none' };
}

/** Field containing a point (for map and machine-log data). */
export function fieldAtPoint(p: LonLat, fields: Field[]): Field | undefined {
  return fields.find((f) => insideGeometry(p, f.feature.geometry));
}

/** Map of distinct names in a file → matched field id (or undefined). */
export function matchNames(names: Iterable<string | undefined>, fields: Field[]): Record<string, { fieldId?: string; how: MatchHow }> {
  const out: Record<string, { fieldId?: string; how: MatchHow }> = {};
  for (const n of names) if (n && !(n in out)) out[n] = matchFieldName(n, fields);
  return out;
}
