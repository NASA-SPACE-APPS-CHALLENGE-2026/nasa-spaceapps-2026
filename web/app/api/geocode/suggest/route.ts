import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverCache } from '@/lib/server/cache';
import { MAX_ADDRESS_LENGTH } from '@/lib/server/geocode';
import { SourceError } from '@/lib/server/http';
import { suggestAddresses } from '@/lib/server/photon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.object({ q: z.string().max(MAX_ADDRESS_LENGTH) });

/** Type-ahead suggestions. POST keeps what the farmer types out of URLs and access logs. */
export async function POST(req: Request) {
  let parsed: z.infer<typeof body>;
  try {
    parsed = body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Send {"q": "..."}.' }, { status: 400 });
  }
  try {
    const matches = await suggestAddresses(parsed.q, { fetch: globalThis.fetch.bind(globalThis), cache: serverCache() });
    return NextResponse.json({ matches });
  } catch (err) {
    return NextResponse.json({ error: err instanceof SourceError ? err.message : 'Suggestions are unavailable.' }, { status: 502 });
  }
}
