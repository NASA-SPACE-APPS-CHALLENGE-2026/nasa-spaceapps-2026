import { NextResponse } from 'next/server';
import { isSourceId } from '@/lib/domain/sourceMeta';
import type { FieldGeometry } from '@/lib/domain/types';
import { serverDeps } from '@/lib/server/deps';
import { parseGeometryBody, profileRequest } from '@/lib/server/requestSchema';
import { runSource } from '@/lib/sources/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  if (!isSourceId(source)) return NextResponse.json({ error: `Unknown source "${source}".` }, { status: 404 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }
  const parsed = parseGeometryBody(profileRequest, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const result = await runSource(source, parsed.data.geometry as FieldGeometry, serverDeps());
  return NextResponse.json(result);
}
