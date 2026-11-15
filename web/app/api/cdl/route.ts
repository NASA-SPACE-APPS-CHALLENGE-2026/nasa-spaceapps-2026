import { NextResponse } from 'next/server';
import type { FieldGeometry } from '@/lib/domain/types';
import { serverDeps } from '@/lib/server/deps';
import { cdlRequest, parseGeometryBody } from '@/lib/server/requestSchema';
import { detectCdl } from '@/lib/sources/cdl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }
  const parsed = parseGeometryBody(cdlRequest, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    return NextResponse.json(await detectCdl(parsed.data.geometry as FieldGeometry, parsed.data.years, serverDeps()));
  } catch (err) {
    return NextResponse.json({ status: 'unavailable', message: `Crop history detection failed: ${(err as Error).message}`, years: [] });
  }
}
