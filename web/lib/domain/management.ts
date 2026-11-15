import { z } from 'zod';
import type { ManagementAnswers } from './types';

/**
 * Layer 3: how the farmer manages a field, from the Rotation Explorer questionnaire.
 * Every question can be skipped or answered "Not sure"; scoring treats both as missing evidence
 * (see docs/rotation-rubric.md), never as a favourable answer.
 */
export const ANSWERS_SCHEMA_VERSION = 1;

export const TILLAGE = ['no-till', 'reduced', 'conventional', 'unsure'] as const;
export const IRRIGATION = ['none', 'supplemental', 'full', 'unsure'] as const;
export const COVER_EXPERIENCE = ['never', 'sometimes', 'every-year', 'unsure'] as const;
export const YES_NO = ['yes', 'no', 'unsure'] as const;
export const PROBLEMS = ['rootworm', 'scn', 'white-mold', 'resistant-weeds', 'erosion', 'wet-spots'] as const;

export type Tillage = (typeof TILLAGE)[number];
export type Irrigation = (typeof IRRIGATION)[number];
export type CoverExperience = (typeof COVER_EXPERIENCE)[number];
export type YesNo = (typeof YES_NO)[number];
export type Problem = (typeof PROBLEMS)[number];

const num = (min: number, max: number) => z.number().finite().min(min).max(max);

export const soilTestSchema = z
  .object({
    /** YYYY-MM-DD */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    ph: num(3, 10).optional(),
    organicMatterPct: num(0, 30).optional(),
    pPpm: num(0, 500).optional(),
    kPpm: num(0, 2000).optional(),
  })
  .strict();

export type SoilTest = z.infer<typeof soilTestSchema>;

export const rotationAnswersSchema = z
  .object({
    tillage: z.enum(TILLAGE).optional(),
    irrigation: z.enum(IRRIGATION).optional(),
    coverExperience: z.enum(COVER_EXPERIENCE).optional(),
    livestock: z.enum(YES_NO).optional(),
    smallGrainEquipment: z.enum(YES_NO).optional(),
    smallGrainMarket: z.enum(YES_NO).optional(),
    /** undefined = not answered; [] = "None of these"; 'unsure' = "Not sure". */
    problems: z.union([z.array(z.enum(PROBLEMS)), z.literal('unsure')]).optional(),
    /** Usual harvest month of this season's crop, 1–12, or "Not sure". */
    harvestMonth: z.union([z.number().int().min(1).max(12), z.literal('unsure')]).optional(),
    soilTest: soilTestSchema.optional(),
  })
  .strict();

export type RotationAnswers = z.infer<typeof rotationAnswersSchema>;

export const PROBLEM_LABELS: Record<Problem, string> = {
  rootworm: 'Corn rootworm',
  scn: 'Soybean cyst nematode (SCN)',
  'white-mold': 'White mold',
  'resistant-weeds': 'Herbicide-resistant weeds',
  erosion: 'Erosion (gullies, washed slopes)',
  'wet-spots': 'Wet spots or ponding',
};

export const TILLAGE_LABELS: Record<Tillage, string> = {
  'no-till': 'No-till',
  reduced: 'Reduced tillage (strip-till, vertical tillage)',
  conventional: 'Conventional tillage (moldboard or chisel plow, disk)',
  unsure: 'Not sure',
};

export const IRRIGATION_LABELS: Record<Irrigation, string> = {
  none: 'No irrigation (rain-fed)',
  supplemental: 'Some irrigation in dry spells',
  full: 'Fully irrigated',
  unsure: 'Not sure',
};

export const COVER_LABELS: Record<CoverExperience, string> = {
  never: 'Never',
  sometimes: 'Some years or some fields',
  'every-year': 'Every year',
  unsure: 'Not sure',
};

export const YES_NO_LABELS: Record<YesNo, string> = { yes: 'Yes', no: 'No', unsure: 'Not sure' };

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));

/** Read the answers out of a stored record. Anything unreadable is dropped instead of breaking the page. */
export function answersOf(record: ManagementAnswers | undefined): RotationAnswers {
  if (!record) return {};
  const parsed = rotationAnswersSchema.safeParse(record.answers);
  if (parsed.success) return parsed.data;
  // Keep each key that is valid on its own.
  const out: Record<string, unknown> = {};
  const shape = rotationAnswersSchema.shape;
  for (const [k, v] of Object.entries(record.answers ?? {})) {
    const field = shape[k as keyof typeof shape];
    if (field && field.safeParse(v).success) out[k] = v;
  }
  return out as RotationAnswers;
}

export function toManagementRecord(fieldId: string, answers: RotationAnswers, now = new Date()): ManagementAnswers {
  return { fieldId, schemaVersion: ANSWERS_SCHEMA_VERSION, answers: rotationAnswersSchema.parse(clean(answers)), updatedAt: now.toISOString() };
}

/** Drop undefined keys and an empty soil test so stored records stay small and comparable. */
function clean(a: RotationAnswers): RotationAnswers {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a)) {
    if (v === undefined) continue;
    if (k === 'soilTest') {
      const st = Object.fromEntries(Object.entries(v as SoilTest).filter(([, x]) => x !== undefined));
      if (Object.keys(st).length) out.soilTest = st;
      continue;
    }
    out[k] = v;
  }
  return out as RotationAnswers;
}

/** The questions that count toward "x of 8 answered" (the soil test is optional and counted separately). */
export const QUESTION_KEYS = ['tillage', 'irrigation', 'coverExperience', 'livestock', 'smallGrainEquipment', 'smallGrainMarket', 'problems', 'harvestMonth'] as const;

export function answeredCount(a: RotationAnswers): number {
  return QUESTION_KEYS.filter((k) => a[k] !== undefined).length;
}

export function hasSoilTest(a: RotationAnswers): boolean {
  return !!a.soilTest && Object.values(a.soilTest).some((v) => v !== undefined);
}

/** "Not sure" and unanswered are the same thing for scoring. */
export function known<T extends string | number>(v: T | 'unsure' | undefined): Exclude<T, 'unsure'> | undefined {
  return v === undefined || v === 'unsure' ? undefined : (v as Exclude<T, 'unsure'>);
}
