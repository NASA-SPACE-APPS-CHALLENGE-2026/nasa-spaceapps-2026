import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverCache } from '@/lib/server/cache';
import { cleanAddress, geocodeAddress, MAX_ADDRESS_LENGTH } from '@/lib/server/geocode';
import { SourceError } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.object({ address: z.string() });

/**
 * POST so the address travels in the request body, not in URLs or access logs.
 * The browser only calls this after the farmer submits, and only when public data lookups are on.
 */
export async function POST(req: Request) {
  let parsed: z.infer<typeof body>;
  try {
    parsed = body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Send {"address": "..."}.' }, { status: 400 });
  }
  const address = cleanAddress(parsed.address);
  if (address.length < 3) return NextResponse.json({ error: 'Enter a street address, for example "2229 Lincoln Way, Ames, IA".' }, { status: 400 });
  if (address.length > MAX_ADDRESS_LENGTH) return NextResponse.json({ error: `Addresses can be at most ${MAX_ADDRESS_LENGTH} characters.` }, { status: 400 });
  try {
    const matches = await geocodeAddress(address, { fetch: globalThis.fetch.bind(globalThis), cache: serverCache() });
    return NextResponse.json({ matches, source: 'US Census Bureau Geocoder' });
  } catch (err) {
    const message = err instanceof SourceError ? err.message : 'Address search failed.';
    return NextResponse.json({ error: `${message} Try a ZIP code or coordinates instead.` }, { status: 502 });
  }
}
