import JSZip from 'jszip';
import { centroid } from '@turf/turf';
import { cropName } from '../domain/rotation/agronomy';
import type { LonLat } from '../domain/types';
import { cropsOn, type ImportContext, matchField, plural } from './context';
import { fieldAtPoint } from './fieldMatch';
import { financeFindings, financeSummary, txnsFromTable } from './kinds/finance';
import { machineFindings, machineSummary, operationsFromTable } from './kinds/machine';
import { supplierFindings, supplierSummary, purchasesFromTable } from './kinds/supplier';
import { yieldFindings, yieldRowsFromPoints, yieldRowsFromTable, yieldSummary, type YieldPoint } from './kinds/yield';
import { cropFromText, detectMapping, isHeaderFor, ROLES, tableFit, text, toDate, type ColumnMapping } from './mapping';
import { nLbsPerAcre, productInfo } from './products';
import { readIsoxml, TEST_WEIGHT, type IsoTask } from './readers/isoxml';
import { invoiceMeta, plainText, tableFromItems, type TextItem } from './readers/layout';
import { readMapFeatures, type MapRead } from './readers/maps';
import type { OcrResult } from './readers/ocr';
import { readPdf, type PdfJs, type PdfPage } from './readers/pdf';
import { readTabular } from './readers/tabular';
import { parseShapefileZip } from './parse';
import { MAX_STORED_ROWS, type Finding, type ImportFormat, type ImportKind, type ImportRecord, type NormalizedRows, type Operation, type Table } from './types';

export const ACCEPT: Record<ImportKind, string[]> = {
  yield: ['.csv', '.xlsx', '.xls', '.ods', '.zip', '.xml'],
  machine: ['.csv', '.xlsx', '.xls', '.ods', '.zip', '.xml'],
  supplier: ['.csv', '.xlsx', '.xls', '.ods', '.pdf', '.png', '.jpg', '.jpeg', '.webp'],
  finance: ['.csv', '.xlsx', '.xls', '.ods', '.pdf'],
};

/** Everything read from a file, kept in memory while the farmer reviews it. */
export interface Draft {
  kind: ImportKind;
  fileName: string;
  size: number;
  format: ImportFormat;
  tables: Table[];
  tableIndex: number;
  mapping: ColumnMapping | null;
  map?: MapRead;
  iso?: IsoTask[];
  meta: { supplier?: string; date?: string };
  readWarnings: string[];
  /** Mean OCR confidence (0–100) when text came from images. */
  ocrConfidence?: number;
  /** Year to use for undated maps (the farmer can change it in review). */
  mapYear?: number;
}

/** Browser or test implementations of the heavy readers. */
export interface ReadEnv {
  pdfjs?: () => Promise<PdfJs>;
  ocr?: (images: Array<Uint8Array | HTMLCanvasElement>, onProgress?: (p: number) => void) => Promise<OcrResult>;
  renderPage?: (page: PdfPage) => Promise<HTMLCanvasElement>;
  onStatus?: (s: string) => void;
}

export class ReadError extends Error {}

const ext = (n: string) => n.toLowerCase().slice(n.lastIndexOf('.'));

export async function readFile(file: { name: string; size: number; bytes: Uint8Array }, kind: ImportKind, ctx: ImportContext, env: ReadEnv = {}): Promise<Draft> {
  const e = ext(file.name);
  const base = { kind, fileName: file.name, size: file.size, tables: [] as Table[], tableIndex: 0, mapping: null as ColumnMapping | null, meta: {}, readWarnings: [] as string[] };

  if (['.csv', '.xlsx', '.xls', '.ods', '.xlsm'].includes(e)) {
    const { format, tables } = readTabular(file.bytes, file.name);
    if (!tables.length) throw new ReadError('The file has no rows to read.');
    const best = tables.map((t, i) => ({ i, s: tableFit(t, kind) })).sort((a, b) => b.s - a.s)[0].i;
    return { ...base, format, tables, tableIndex: best, mapping: detectMapping(tables[best].headers, kind) };
  }

  if (e === '.zip' || e === '.xml') {
    let isIso = e === '.xml';
    if (e === '.zip') {
      const zip = await JSZip.loadAsync(file.bytes);
      const names = Object.keys(zip.files).map((n) => n.toLowerCase());
      isIso = names.some((n) => n.endsWith('taskdata.xml'));
      if (!isIso && !names.some((n) => n.endsWith('.shp'))) throw new ReadError('This zip has neither ISOXML task data (TASKDATA.XML) nor a shapefile (.shp).');
    }
    if (isIso) {
      env.onStatus?.('Reading ISOXML task data and time logs…');
      const { tasks, warnings } = await readIsoxml(file.bytes, e === '.zip');
      return { ...base, format: 'isoxml', iso: tasks, readWarnings: warnings, mapYear: undefined };
    }
    env.onStatus?.('Reading the map…');
    const features = await parseShapefileZip(file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) as ArrayBuffer);
    const map = readMapFeatures(features, kind === 'yield' ? 'yield' : 'application');
    if (!map.type) throw new ReadError(`No ${kind === 'yield' ? 'yield' : 'application or seeding rate'} attribute found in the map. Attributes in the file: ${map.attributes.slice(0, 12).join(', ') || 'none'}.`);
    return { ...base, format: 'shapefile', map, mapYear: map.points.find((p) => p.date)?.date ? undefined : ctx.currentYear };
  }

  if (e === '.pdf') {
    if (!env.pdfjs) throw new ReadError('PDF reading is not available here.');
    env.onStatus?.('Reading the PDF…');
    const pdf = await readPdf(file.bytes, await env.pdfjs());
    let items: TextItem[] = pdf.items;
    let ocrConfidence: number | undefined;
    const warnings: string[] = [];
    if (pdf.scannedPages.length) {
      if (!env.ocr || !env.renderPage) {
        warnings.push(`${plural(pdf.scannedPages.length, 'page')} looks scanned (no text layer) and could not be read here.`);
      } else {
        env.onStatus?.(`This PDF is a scan. Reading text from ${plural(pdf.scannedPages.length, 'page image')} (about 20 seconds a page)…`);
        const canvases: HTMLCanvasElement[] = [];
        for (const p of pdf.scannedPages) canvases.push(await env.renderPage(await pdf.doc.getPage(p)));
        const ocr = await env.ocr(canvases, (p) => env.onStatus?.(`Reading text from the scan… ${Math.round(p * 100)}%`));
        items = [...items.filter((i) => !pdf.scannedPages.includes(i.page)), ...ocr.items.map((i) => ({ ...i, page: pdf.scannedPages[i.page - 1] }))];
        ocrConfidence = ocr.confidence;
      }
    }
    await pdf.doc.destroy();
    return { ...fromItems(base, items, kind, 'pdf'), ocrConfidence, readWarnings: warnings };
  }

  if (['.png', '.jpg', '.jpeg', '.webp'].includes(e)) {
    if (!env.ocr) throw new ReadError('Reading images is not available here.');
    env.onStatus?.('Reading text from the image (about 20 seconds)…');
    const ocr = await env.ocr([file.bytes], (p) => env.onStatus?.(`Reading text from the image… ${Math.round(p * 100)}%`));
    return { ...fromItems(base, ocr.items, kind, 'image'), ocrConfidence: ocr.confidence };
  }

  throw new ReadError(`PlotTwist can't read ${e || 'this kind of'} file here.`);
}

function fromItems(base: Omit<Draft, 'format'>, items: TextItem[], kind: ImportKind, format: ImportFormat): Draft {
  const table = tableFromItems(items, isHeaderFor(kind), format === 'pdf' ? 'PDF table' : 'Scanned table');
  if (!table) throw new ReadError(`No table with ${ROLES[kind].filter((r) => r.required).map((r) => r.label.toLowerCase()).join(' and ') || 'recognisable'} columns was found in the ${format === 'pdf' ? 'PDF' : 'image'}. Try exporting it as CSV or Excel instead.`);
  const meta = invoiceMeta(plainText(items));
  return { ...base, format, tables: [table], tableIndex: 0, mapping: detectMapping(table.headers, kind), meta: { supplier: meta.supplier, date: meta.date ? toDate(meta.date) : undefined } };
}

export interface Evaluation {
  data: NormalizedRows;
  findings: Finding[];
  warnings: string[];
  summary: string;
  /** Field names in the file, for re-assigning them in review. */
  fieldNames: string[];
}

/** Turn a draft into rows and findings, honouring the farmer's mapping and field choices (ctx.assign). */
export function evaluate(d: Draft, ctx: ImportContext): Evaluation {
  const t = d.tables[d.tableIndex];
  const warnings = [...d.readWarnings];
  if (d.ocrConfidence !== undefined && d.ocrConfidence < 80) warnings.push(`The text was read from an image with ${Math.round(d.ocrConfidence)}% confidence. Check every number before using it.`);
  const fieldNames = t && d.mapping?.field !== undefined && d.mapping.field !== null ? [...new Set(t.rows.map((r) => text(r[d.mapping!.field!])).filter(Boolean))] : d.iso ? [...new Set(d.iso.map((x) => x.partfieldName ?? x.name))] : [];

  if (d.kind === 'yield') {
    let res: { rows: import('./types').YieldRow[]; warnings: string[] };
    if (t && d.mapping) res = yieldRowsFromTable(t, d.mapping, ctx);
    else if (d.map) res = yieldRowsFromPoints(mapYieldPoints(d.map, ctx, d.mapYear), ctx, { year: d.mapYear });
    else res = isoYield(d.iso ?? [], ctx, d.mapYear);
    const f = yieldFindings(res.rows, ctx);
    return { data: { kind: 'yield', rows: res.rows.slice(0, MAX_STORED_ROWS) }, findings: f.findings, warnings: [...warnings, ...res.warnings, ...f.warnings], summary: yieldSummary(res.rows), fieldNames };
  }
  if (d.kind === 'machine') {
    let res: { rows: Operation[]; warnings: string[] };
    if (t && d.mapping) res = operationsFromTable(t, d.mapping, ctx, { fileKind: d.fileName });
    else if (d.map) res = mapOperations(d.map, ctx, d.mapYear, d.fileName);
    else res = isoOperations(d.iso ?? [], ctx);
    const f = machineFindings(res.rows, ctx);
    return { data: { kind: 'machine', rows: res.rows.slice(0, MAX_STORED_ROWS) }, findings: f.findings, warnings: [...warnings, ...res.warnings, ...f.warnings], summary: machineSummary(res.rows), fieldNames };
  }
  if (!t || !d.mapping) return { data: { kind: d.kind, rows: [] } as NormalizedRows, findings: [], warnings: [...warnings, 'Nothing could be read.'], summary: 'Nothing read', fieldNames };
  if (d.kind === 'supplier') {
    const res = purchasesFromTable(t, d.mapping, d.meta);
    const f = supplierFindings(res.rows, ctx);
    return { data: { kind: 'supplier', rows: res.rows.slice(0, MAX_STORED_ROWS) }, findings: f.findings, warnings: [...warnings, ...res.warnings, ...f.warnings], summary: supplierSummary(res.rows), fieldNames };
  }
  const res = txnsFromTable(t, d.mapping);
  const f = financeFindings(res.rows, ctx);
  return { data: { kind: 'finance', rows: res.rows.slice(0, MAX_STORED_ROWS) }, findings: f.findings, warnings: [...warnings, ...res.warnings, ...f.warnings], summary: financeSummary(res.rows), fieldNames };
}

/** Bushels per acre for a map point: volume yields as is; mass yields ÷ the crop's test weight. */
function mapYieldPoints(map: MapRead, ctx: ImportContext, year?: number): YieldPoint[] {
  return map.points.map((p) => {
    const y = p.date ? Number(p.date.slice(0, 4)) : year;
    let crop = p.crop ? cropFromText(p.crop) : null;
    if (!crop && y) crop = cropsOn(fieldAtPoint(p.point, ctx.fields), y)?.[0] ?? null;
    const bu = map.type === 'yield-mass' ? (crop && TEST_WEIGHT[crop] ? p.value / TEST_WEIGHT[crop] : NaN) : p.value;
    return { point: p.point, buPerAc: bu, moisturePct: p.moisturePct, crop, year: y };
  });
}

function isoField(t: IsoTask, ctx: ImportContext): string | undefined {
  const byName = matchField(ctx, t.partfieldName ?? t.name);
  if (byName.fieldId || (ctx.assign && (t.partfieldName ?? t.name) in ctx.assign)) return byName.fieldId;
  if (t.boundary) {
    try {
      const c = centroid({ type: 'Feature', properties: {}, geometry: t.boundary }).geometry.coordinates as LonLat;
      return fieldAtPoint(c, ctx.fields)?.id;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function isoYield(tasks: IsoTask[], ctx: ImportContext, year?: number) {
  const points: YieldPoint[] = [];
  const warnings: string[] = [];
  for (const t of tasks) {
    if (!t.yieldPoints.length) continue;
    const y = t.date ? Number(t.date.slice(0, 4)) : year;
    const fid = isoField(t, ctx);
    const crop = cropFromText(`${t.cropName ?? ''} ${t.products.join(' ')} ${t.name}`) ?? (fid && y ? cropsOn(ctx.fields.find((f) => f.id === fid), y)?.[0] ?? null : null);
    const tw = crop ? TEST_WEIGHT[crop] : undefined;
    if (!tw && t.yieldPoints.some((p) => p.lbPerAc !== undefined && p.buPerAc === undefined)) warnings.push(`"${t.name}": the crop is unknown, so mass yields could not be turned into bushels.`);
    for (const p of t.yieldPoints) {
      const bu = p.buPerAc ?? (p.lbPerAc !== undefined && tw ? p.lbPerAc / tw : undefined);
      if (bu !== undefined) points.push({ point: p.point, buPerAc: bu, moisturePct: p.moisturePct, crop, year: y });
    }
  }
  if (!points.length) warnings.push('No yield values were found in the task data time logs.');
  const res = yieldRowsFromPoints(points, ctx, { year });
  return { rows: res.rows.map((r) => ({ ...r, via: 'log' as const })), warnings: [...warnings, ...res.warnings] };
}

/** Per-field average rate from an as-applied or seeding map. */
function mapOperations(map: MapRead, ctx: ImportContext, year: number | undefined, fileName: string): { rows: Operation[]; warnings: string[] } {
  const groups = new Map<string, { sum: number; n: number; date?: string; product?: string; crop?: string }>();
  let outside = 0;
  for (const p of map.points) {
    const f = fieldAtPoint(p.point, ctx.fields);
    if (!f) {
      outside++;
      continue;
    }
    const g = groups.get(f.id) ?? { sum: 0, n: 0 };
    g.sum += p.value;
    g.n++;
    g.date ??= p.date;
    g.product ??= p.product;
    g.crop ??= p.crop;
    groups.set(f.id, g);
  }
  const seeding = /seed/.test(map.unit) || /seed|plant/i.test(`${map.attribute} ${fileName}`);
  const rows: Operation[] = [];
  for (const [fieldId, g] of groups) {
    const rate = g.sum / g.n;
    const info = productInfo(g.product ?? '');
    const field = ctx.fields.find((f) => f.id === fieldId)!;
    rows.push({
      fieldName: field.name,
      fieldId,
      date: g.date ?? (year ? `${year}-01-01` : undefined),
      kind: seeding ? 'plant' : 'apply',
      product: g.product,
      productType: info.type,
      crop: seeding ? cropFromText(g.crop ?? g.product ?? '') : undefined,
      rate,
      rateUnit: map.unit,
      nLbsPerAc: !seeding ? nLbsPerAcre(rate, map.unit || 'lb/ac', info) : undefined,
      seedsPerAc: seeding ? rate : undefined,
      via: 'map',
    });
  }
  const warnings = outside ? [`${plural(outside, 'map point')} fell outside your fields and ${outside === 1 ? 'was' : 'were'} left out.`] : [];
  if (!seeding && rows.some((r) => r.nLbsPerAc === undefined)) warnings.push('The product could not be recognised as a nitrogen fertilizer, so no nitrogen rate was worked out. Name the product (for example UAN 28% or anhydrous) in the map attributes.');
  return { rows, warnings };
}

function isoOperations(tasks: IsoTask[], ctx: ImportContext): { rows: Operation[]; warnings: string[] } {
  const rows: Operation[] = [];
  const warnings: string[] = [];
  for (const t of tasks) {
    const fieldId = isoField(t, ctx);
    const field = ctx.fields.find((f) => f.id === fieldId);
    const product = t.products[0];
    const info = productInfo(`${product ?? ''} ${t.name}`);
    const pick = (kinds: string[]) => t.measures.filter((m) => kinds.includes(m.kind)).sort((a, b) => Number(b.actual) - Number(a.actual))[0];
    const count = pick(['rate-count']);
    const mass = pick(['rate-mass']);
    const vol = pick(['rate-volume']);
    const yieldM = pick(['yield-mass', 'yield-volume', 'yield-dry-mass']);
    const base = { fieldName: field?.name ?? t.partfieldName ?? t.name, fieldId, date: t.date, product, productType: info.type, via: 'isoxml' as const };
    if (count) rows.push({ ...base, kind: 'plant', crop: cropFromText(`${t.cropName ?? ''} ${product ?? ''} ${t.name}`), rate: count.mean, rateUnit: 'seeds/ac', seedsPerAc: count.mean });
    else if (mass || vol) {
      const m = (mass ?? vol)!;
      rows.push({ ...base, kind: 'apply', rate: m.mean, rateUnit: m.unit, nLbsPerAc: nLbsPerAcre(m.mean, m.unit, info) });
    } else if (yieldM) rows.push({ ...base, kind: 'harvest', crop: cropFromText(`${t.cropName ?? ''} ${t.name}`) });
    else rows.push({ ...base, kind: 'other' });
    if (t.planned) warnings.push(`"${t.name}" has no time log, so its planned (prescription) rate was used.`);
  }
  return { rows, warnings };
}

/** The record to store once the farmer clicks Apply. */
export function toRecord(d: Draft, ev: Evaluation, applied: string[], id: string, now = new Date()): ImportRecord {
  return { id, kind: d.kind, fileName: d.fileName, size: d.size, format: d.format, importedAt: now.toISOString(), summary: ev.summary, warnings: ev.warnings.slice(0, 20), data: ev.data, findings: ev.findings, applied: applied.filter((t) => ev.findings.some((f) => f.target === t)) };
}

export function describeCrop(id: string | null | undefined): string {
  return id ? cropName(id) : 'Unknown crop';
}
