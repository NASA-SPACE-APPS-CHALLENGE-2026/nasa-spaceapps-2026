import { z } from 'zod';
import type { FieldGeometry } from '../domain/types';

const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]).rest(z.number());
const ring = z.array(position).min(4).max(20000);
const polygon = z.object({ type: z.literal('Polygon'), coordinates: z.array(ring).min(1).max(200) });
const multiPolygon = z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(ring).min(1)).min(1).max(200) });

export const geometrySchema = z.union([polygon, multiPolygon]);

export const profileRequest = z.object({ geometry: geometrySchema });
export const cdlRequest = z.object({
  geometry: geometrySchema,
  years: z.array(z.number().int().min(2008).max(2100)).max(10),
});

export function parseGeometryBody<T extends z.ZodTypeAny>(schema: T, body: unknown): { ok: true; data: z.infer<T> } | { ok: false; error: string } {
  const r = schema.safeParse(body);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, error: `Invalid request: ${r.error.issues[0]?.path.join('.') || 'body'} ${r.error.issues[0]?.message ?? ''}`.trim() };
}

export type { FieldGeometry };
