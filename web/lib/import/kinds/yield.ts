import { cropKeyOf, type CropKey } from '../../domain/finance/budget';
import { cropName } from '../../domain/rotation/agronomy';
import type { Field, LonLat } from '../../domain/types';
import { cropsOn, fieldAcresOf, type ImportContext, matchField, plural, r1, seasonOf, seasonText, yearsText } from '../context';
import { fieldAtPoint } from '../fieldMatch';
import { cropFromText, text, toNumber, yearOf, type ColumnMapping } from '../mapping';
import type { Finding, Table, YieldRow } from '../types';

/** Plausible yields (bu/ac). Rows outside are reported and left out of averages. */
const PLAUSIBLE: Record<CropKey, [number, number]> = { corn: [20, 350], soybeans: [5, 120], oats: [15, 220], wheat: [10, 160], rice: [20, 150], sorghum: [10, 250], cotton: [100, 2000] };

export function yieldRowsFromTable(t: Table, m: ColumnMapping, ctx: ImportContext): { rows: YieldRow[]; warnings: string[] } {
  const rows: YieldRow[] = [];
  const warnings: string[] = [];
  let noYear = 0;
  let noYield = 0;
  const col = (r: (string | number | null)[], role: string) => (m[role] === null || m[role] === undefined ? null : r[m[role]!]);
  for (const r of t.rows) {
    const fieldName = text(col(r, 'field')) || undefined;
    const match = matchField(ctx, fieldName);
    const field = ctx.fields.find((f) => f.id === match.fieldId);
    const year = yearOf(col(r, 'year'));
    if (!year) {
      noYear++;
      continue;
    }
    const cropText = text(col(r, 'crop'));
    let crop = cropText ? cropFromText(cropText) : null;
    if (!crop && !cropText) crop = cropsOn(field, year)?.[0] ?? null; // no crop column: use the crop history
    const acres = toNumber(col(r, 'acres')) ?? fieldAcresOf(field);
    let buPerAc = toNumber(col(r, 'buPerAc'));
    const totalBu = toNumber(col(r, 'totalBu'));
    if (buPerAc === undefined && totalBu !== undefined && acres) buPerAc = totalBu / acres;
    if (buPerAc === undefined) {
      noYield++;
      continue;
    }
    rows.push({ fieldName, fieldId: match.fieldId, year, crop, cropText: cropText || (crop ? cropName(crop) : ''), acres, buPerAc: r1(buPerAc), totalBu, moisturePct: toNumber(col(r, 'moisture')), via: 'table' });
  }
  if (noYear) warnings.push(`${plural(noYear, 'row')} had no year or harvest date and ${noYear === 1 ? 'was' : 'were'} skipped.`);
  if (noYield) warnings.push(`${plural(noYield, 'row')} had no yield (bu/ac, or total bushels with acres) and ${noYield === 1 ? 'was' : 'were'} skipped.`);
  return { rows, warnings };
}

export interface YieldPoint {
  point: LonLat;
  /** Dry yield, bu/ac. */
  buPerAc: number;
  moisturePct?: number;
  crop?: string | null;
  year?: number;
}

/** Yield-map points (shapefile or machine log): the mean of the points inside each field. */
export function yieldRowsFromPoints(points: YieldPoint[], ctx: ImportContext, defaults: { year?: number; crop?: string | null; cropText?: string }): { rows: YieldRow[]; warnings: string[] } {
  const groups = new Map<string, { field: Field; sum: number; n: number; moist: number; mn: number; year?: number; crop?: string | null }>();
  let outside = 0;
  for (const p of points) {
    if (!Number.isFinite(p.buPerAc) || p.buPerAc <= 0) continue;
    const field = fieldAtPoint(p.point, ctx.fields);
    if (!field) {
      outside++;
      continue;
    }
    const year = p.year ?? defaults.year;
    const key = `${field.id}:${year ?? ''}:${p.crop ?? defaults.crop ?? ''}`;
    const g = groups.get(key) ?? { field, sum: 0, n: 0, moist: 0, mn: 0, year, crop: p.crop ?? defaults.crop };
    g.sum += p.buPerAc;
    g.n++;
    if (p.moisturePct !== undefined) {
      g.moist += p.moisturePct;
      g.mn++;
    }
    groups.set(key, g);
  }
  const warnings: string[] = [];
  if (outside) warnings.push(`${plural(outside, 'map point')} fell outside your fields and ${outside === 1 ? 'was' : 'were'} left out.`);
  const rows: YieldRow[] = [];
  for (const g of groups.values()) {
    const year = g.year ?? ctx.currentYear;
    if (!g.year) warnings.push(`The map has no date, so ${g.field.name} was treated as the ${year} harvest. Change the year in review if that's wrong.`);
    const crop = g.crop ?? cropsOn(g.field, year)?.[0] ?? null;
    rows.push({ fieldName: g.field.name, fieldId: g.field.id, year, crop, cropText: defaults.cropText ?? (crop ? cropName(crop) : ''), acres: fieldAcresOf(g.field), buPerAc: r1(g.sum / g.n), moisturePct: g.mn ? r1(g.moist / g.mn) : undefined, via: 'map', points: g.n });
  }
  return { rows, warnings };
}

export function yieldSummary(rows: YieldRow[]): string {
  const fields = new Set(rows.map((r) => r.fieldId ?? r.fieldName ?? '?'));
  const pts = rows.reduce((s, r) => s + (r.points ?? 0), 0);
  return `${plural(rows.length, 'yield record')}${pts ? ` from ${plural(pts, 'map point')}` : ''}, ${yearsText(rows.map((r) => r.year))}, ${plural(fields.size, 'field')}`;
}

/** Yields and crop history the records support. */
export function yieldFindings(rows: YieldRow[], ctx: ImportContext): { findings: Finding[]; warnings: string[] } {
  const findings: Finding[] = [];
  const warnings: string[] = [];
  const byField = new Map(ctx.fields.map((f) => [f.id, f]));

  // ---- expected yields: the latest year with data, acre-weighted, corn split by what came before ----
  const buckets = new Map<string, { sum: number; w: number; fields: Set<string>; acres: number; year: number; map: boolean; n: number }>();
  for (const r of rows) {
    const key = r.crop ? cropKeyOf(r.crop) : null;
    if (!key || r.buPerAc === undefined) continue;
    const [lo, hi] = PLAUSIBLE[key];
    if (r.buPerAc < lo || r.buPerAc > hi) {
      warnings.push(`${r.fieldName ?? 'A row'} ${r.year}: ${r.buPerAc} bu/ac of ${cropName(r.crop!)} looks implausible and was left out.`);
      continue;
    }
    let target = `${key}.yield`;
    if (key === 'corn') {
      // The crop before: from the same file if it has the previous year, else from the Fields crop history.
      const prevRow = r.fieldId ? rows.find((x) => x.fieldId === r.fieldId && x.year === r.year - 1 && x.crop) : undefined;
      const prev = prevRow ? [prevRow.crop!] : r.fieldId ? cropsOn(byField.get(r.fieldId), r.year - 1) : null;
      if (prev?.includes('corn')) target = 'corn.yieldAfterCorn';
    }
    const b = buckets.get(target);
    if (b && b.year > r.year) continue;
    const w = r.acres && r.acres > 0 ? r.acres : 1;
    const fresh = !b || r.year > b.year ? { sum: 0, w: 0, fields: new Set<string>(), acres: 0, year: r.year, map: false, n: 0 } : b;
    fresh.sum += r.buPerAc * w;
    fresh.w += w;
    fresh.acres += r.acres ?? 0;
    fresh.n++;
    fresh.map ||= r.via !== 'table';
    fresh.fields.add(r.fieldId ?? r.fieldName ?? `row${fresh.n}`);
    buckets.set(target, fresh);
  }
  const LABEL: Record<string, string> = {
    'corn.yield': 'Corn yield (after soybeans or another crop)',
    'corn.yieldAfterCorn': 'Corn yield after corn',
    'soybeans.yield': 'Soybean yield',
    'oats.yield': 'Oat (small grain) yield',
    'wheat.yield': 'Wheat yield',
  };
  for (const [target, b] of buckets) {
    findings.push({
      target: `param:${target}`,
      label: LABEL[target],
      group: 'Yields',
      value: r1(b.sum / b.w),
      unit: 'bu/ac',
      evidence: `${b.year} harvest, ${plural(b.fields.size, 'field')}${b.acres ? `, ${Math.round(b.acres).toLocaleString('en-US')} ac` : ''}${b.map ? ' (yield map average)' : ''}`,
      confidence: b.acres > 0 && b.fields.size > 0 ? (b.map ? 'medium' : 'high') : 'low',
      suggested: true,
    });
  }

  // ---- crop history on Fields ----
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.fieldId || !r.crop) continue;
    const field = byField.get(r.fieldId);
    const season = field && seasonOf(field, r.year);
    if (!field || !season) continue;
    const target = `crop:${r.fieldId}:${r.year}`;
    if (seen.has(target)) continue;
    seen.add(target);
    const current = cropsOn(field, r.year);
    if (season.status === 'confirmed' && current?.includes(r.crop)) continue;
    const differs = season.status === 'confirmed';
    findings.push({
      target,
      label: `${field.name}, ${r.year}: ${cropName(r.crop)}`,
      group: 'Crop history',
      value: r.crop,
      evidence: differs ? `You entered ${seasonText(field, r.year)}; the record says ${cropName(r.crop)}.` : season.status === 'detected' ? `Confirms the crop detected from USDA maps (${seasonText(field, r.year)}).` : 'This season is empty on Fields.',
      confidence: differs ? 'low' : 'high',
      suggested: !differs,
    });
  }
  return { findings, warnings };
}
