import { acresFromM2 } from '../domain/acreage';
import { cropLabel } from '../domain/crops';
import type { FinanceInputs } from '../domain/finance/inputs';
import type { Field, SeasonCrop } from '../domain/types';
import { matchFieldName, type MatchHow } from './fieldMatch';
import { cropIdsOf } from '../domain/rotation/agronomy';

/** What the readers know about the farm while turning a file into rows and findings. */
export interface ImportContext {
  fields: Field[];
  /** The season the farmer just grew (CURRENT_SEASON). */
  currentYear: number;
  /** The farmer's finance inputs (raw, without imports), for "old → new" and modeled costs. */
  finance: FinanceInputs;
  /** Field names in the file the farmer re-assigned in review: name → field id, or null for "not one of my fields". */
  assign?: Record<string, string | null>;
}

/** Field for a name in a file, honouring the farmer's choices in review. */
export function matchField(ctx: ImportContext, name: string | undefined): { fieldId?: string; how: MatchHow } {
  if (name && ctx.assign && name in ctx.assign) {
    const id = ctx.assign[name];
    return id ? { fieldId: id, how: 'exact' } : { how: 'none' };
  }
  return matchFieldName(name, ctx.fields);
}

export function seasonOf(field: Field, year: number): SeasonCrop | undefined {
  return [field.crops.current, ...field.crops.history].find((s) => s.year === year);
}

/** Catalog crop ids grown on a field in a year, from the Fields crop history. */
export function cropsOn(field: Field | undefined, year: number): string[] | null {
  if (!field) return null;
  const s = seasonOf(field, year);
  return s ? cropIdsOf(s.crop) : null;
}

export function seasonText(field: Field, year: number): string {
  const s = seasonOf(field, year);
  return s?.crop ? cropLabel(s.crop) : 'not entered';
}

export function fieldAcresOf(field: Field | undefined): number | undefined {
  return field ? Math.round(acresFromM2(field.areaM2) * 10) / 10 : undefined;
}

export const r1 = (n: number) => Math.round(n * 10) / 10;
export const r2 = (n: number) => Math.round(n * 100) / 100;

export function yearsText(years: number[]): string {
  const ys = [...new Set(years)].sort();
  if (!ys.length) return 'no dates';
  return ys.length === 1 ? String(ys[0]) : `${ys[0]}–${ys[ys.length - 1]}`;
}

export function plural(n: number, word: string): string {
  return `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;
}
