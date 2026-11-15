import type { Tillage } from '../../domain/finance/budget';
import { buildParams } from '../../domain/finance/inputs';
import { cropName } from '../../domain/rotation/agronomy';
import { cropsOn, type ImportContext, matchField, plural, r1, seasonOf, seasonText, yearsText } from '../context';
import { cropFromText, norm, text, toDate, toNumber, type ColumnMapping } from '../mapping';
import { nLbsPerAcre, productInfo } from '../products';
import type { Finding, Operation, OperationKind, Table } from '../types';

/** Operation type from the operation, product and file wording used by JD Operations Center, FieldView, Ag Leader and CNH exports. */
export function operationKind(s: string): OperationKind {
  const t = norm(s);
  if (/harvest|yield|combine/.test(t)) return 'harvest';
  if (/plant|seed(ing)?\b|drill(ing)?\b/.test(t)) return 'plant';
  if (/till|disk|chisel|plow|cultivat|ripper|vertical|strip|field cultivator/.test(t)) return 'tillage';
  if (/appl|spray|fert|nh3|anhydrous|side ?dress|nitrogen|uan|urea|spread|as applied|liquid|dry|chemical|herbicide/.test(t)) return 'apply';
  return 'other';
}

/** Tillage system implied by a tillage pass. */
export function tillageFrom(s: string): Tillage | undefined {
  const t = norm(s);
  if (/moldboard|chisel|disk|plow|ripper|field cultivator/.test(t)) return 'conventional';
  if (/vertical|strip|turbo|light/.test(t)) return 'reduced';
  return undefined;
}

export function operationsFromTable(t: Table, m: ColumnMapping, ctx: ImportContext, opts: { fileKind?: string } = {}): { rows: Operation[]; warnings: string[] } {
  const rows: Operation[] = [];
  const warnings: string[] = [];
  const col = (r: (string | number | null)[], role: string) => (m[role] === null || m[role] === undefined ? null : r[m[role]!]);
  for (const r of t.rows) {
    const opText = text(col(r, 'operation'));
    const product = text(col(r, 'product'));
    const fromOp = operationKind(`${opText} ${opts.fileKind ?? ''}`);
    const kind = fromOp !== 'other' ? fromOp : operationKind(product);
    const fieldName = text(col(r, 'field')) || undefined;
    const match = matchField(ctx, fieldName);
    const rate = toNumber(col(r, 'rate'));
    const rateUnitCell = text(col(r, 'rateUnit'));
    const rateUnit = rateUnitCell || (text(col(r, 'rate')).match(/[a-z].*$/i)?.[0] ?? '');
    const info = productInfo(product || opText);
    const crop = cropFromText(text(col(r, 'crop')) || product) ?? null;
    let seedsPerAc: number | undefined;
    if (kind === 'plant' && rate !== undefined) {
      const u = norm(rateUnit);
      if (/k ?(seeds?|sds)|thousand/.test(u)) seedsPerAc = rate * 1000;
      else if (/seed|sds/.test(u) || rate > 10000) seedsPerAc = rate;
    }
    rows.push({
      fieldName,
      fieldId: match.fieldId,
      date: toDate(col(r, 'date')),
      kind,
      product: product || undefined,
      productType: info.type,
      crop: kind === 'plant' || kind === 'harvest' ? crop : undefined,
      rate,
      rateUnit: rateUnit || undefined,
      nLbsPerAc: kind === 'apply' && rate !== undefined ? nLbsPerAcre(rate, rateUnit, info) : undefined,
      seedsPerAc,
      areaAc: toNumber(col(r, 'area')),
      via: 'table',
    });
  }
  const noField = rows.filter((r) => !r.fieldId).length;
  if (noField) warnings.push(`${plural(noField, 'operation')} could not be matched to one of your fields. Pick the field in review, or they are left out.`);
  return { rows, warnings };
}

export function machineSummary(rows: Operation[]): string {
  const kinds = new Map<string, number>();
  for (const r of rows) kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
  const parts = [...kinds].map(([k, n]) => `${n} ${k === 'apply' ? 'application' : k === 'plant' ? 'planting' : k}${n === 1 ? '' : 's'}`);
  return `${plural(rows.length, 'operation')} (${parts.join(', ')}), ${yearsText(rows.flatMap((r) => (r.date ? [Number(r.date.slice(0, 4))] : [])))}`;
}

export function machineFindings(rows: Operation[], ctx: ImportContext): { findings: Finding[]; warnings: string[] } {
  const findings: Finding[] = [];
  const warnings: string[] = [];
  const byField = new Map(ctx.fields.map((f) => [f.id, f]));
  const P = buildParams(ctx.finance);
  const yearOf = (o: Operation) => (o.date ? Number(o.date.slice(0, 4)) : ctx.currentYear);
  const matched = rows.filter((r) => r.fieldId);
  const latest = Math.max(...matched.map(yearOf), 0);
  if (!latest) return { findings, warnings };

  // ---- nitrogen applied to corn, per field (Simulator) and farm average (Finance) ----
  const nByField = new Map<string, { n: number; acres: number; afterCorn: boolean }>();
  for (const o of matched.filter((x) => x.kind === 'apply' && x.nLbsPerAc !== undefined && yearOf(x) === latest)) {
    const field = byField.get(o.fieldId!)!;
    const crop = cropsOn(field, latest);
    if (!crop?.includes('corn')) continue;
    const cur = nByField.get(field.id) ?? { n: 0, acres: field.areaM2 / 4046.86, afterCorn: !!cropsOn(field, latest - 1)?.includes('corn') };
    cur.n += o.nLbsPerAc!;
    nByField.set(field.id, cur);
  }
  for (const [fieldId, v] of nByField) {
    findings.push({ target: `field:${fieldId}:nRateCorn`, label: `${byField.get(fieldId)!.name}: nitrogen on corn`, group: 'Field practices', value: Math.round(v.n), unit: 'lb N/ac', evidence: `${latest}: all N applications on this field added up`, confidence: 'high', suggested: true });
  }
  for (const afterCorn of [false, true]) {
    const set = [...nByField.values()].filter((v) => v.afterCorn === afterCorn);
    if (!set.length) continue;
    const w = set.reduce((s, v) => s + v.acres, 0);
    findings.push({
      target: `param:${afterCorn ? 'corn.nLbsAfterCorn' : 'corn.nLbs'}`,
      label: afterCorn ? 'Nitrogen for corn after corn (farm average)' : 'Nitrogen for corn after soybeans (farm average)',
      group: 'Input costs',
      value: Math.round(set.reduce((s, v) => s + v.n * v.acres, 0) / w),
      unit: 'lb N/ac',
      evidence: `${latest}: ${plural(set.length, 'field')}, acre-weighted`,
      confidence: 'high',
      suggested: true,
    });
  }

  // ---- seeding rates → seed cost per acre at the current seed price ----
  for (const [crop, id, perAcDefault, perSeeds] of [
    ['corn', 'corn.seed', P.get('corn.seed'), 30000],
    ['soybeans', 'soybeans.seed', P.get('soybeans.seed'), 140000],
  ] as const) {
    const ops = matched.filter((o) => o.kind === 'plant' && o.seedsPerAc && yearOf(o) === latest && (o.crop === crop || cropsOn(byField.get(o.fieldId!), latest)?.includes(crop)));
    if (!ops.length) continue;
    const rate = ops.reduce((s, o) => s + o.seedsPerAc!, 0) / ops.length;
    if (rate < perSeeds * 0.3 || rate > perSeeds * 2.5) {
      warnings.push(`The ${crop} seeding rate (${Math.round(rate).toLocaleString('en-US')} seeds/ac) looks off, so seed cost was not changed.`);
      continue;
    }
    findings.push({
      target: `param:${id}`,
      label: `${cropName(crop)} seed cost at your seeding rate`,
      group: 'Input costs',
      value: r1((perAcDefault * rate) / perSeeds),
      unit: '$/ac',
      evidence: `${latest}: average ${Math.round(rate).toLocaleString('en-US')} seeds/ac over ${plural(ops.length, 'planting')}, priced like the current seed cost`,
      confidence: 'medium',
      suggested: true,
    });
  }

  // ---- tillage system per field ----
  const tillByField = new Map<string, Tillage>();
  for (const o of matched.filter((x) => x.kind === 'tillage' && yearOf(x) >= latest - 1)) {
    const t = tillageFrom(`${o.product ?? ''} ${o.rateUnit ?? ''} ${o.fieldName ?? ''}`) ?? tillageFrom(o.product ?? '') ?? 'conventional';
    const prev = tillByField.get(o.fieldId!);
    if (!prev || (prev === 'reduced' && t === 'conventional')) tillByField.set(o.fieldId!, t);
  }
  for (const [fieldId, t] of tillByField) {
    findings.push({ target: `field:${fieldId}:tillage`, label: `${byField.get(fieldId)!.name}: tillage`, group: 'Field practices', value: t, evidence: 'From the tillage passes in your machine records', confidence: 'medium', suggested: true });
  }

  // ---- crop history from plantings and harvests ----
  const seen = new Set<string>();
  for (const o of matched.filter((x) => (x.kind === 'plant' || x.kind === 'harvest') && x.crop)) {
    const field = byField.get(o.fieldId!)!;
    const year = yearOf(o);
    const season = seasonOf(field, year);
    const target = `crop:${field.id}:${year}`;
    if (!season || seen.has(target)) continue;
    seen.add(target);
    const current = cropsOn(field, year);
    if (season.status === 'confirmed' && current?.includes(o.crop!)) continue;
    const differs = season.status === 'confirmed';
    findings.push({ target, label: `${field.name}, ${year}: ${cropName(o.crop!)}`, group: 'Crop history', value: o.crop!, evidence: differs ? `You entered ${seasonText(field, year)}.` : `From a ${o.kind === 'plant' ? 'planting' : 'harvest'} record.`, confidence: differs ? 'low' : 'high', suggested: !differs });
  }
  return { findings, warnings };
}
