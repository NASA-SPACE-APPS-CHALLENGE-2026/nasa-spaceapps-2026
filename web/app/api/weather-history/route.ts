import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverDeps } from '@/lib/server/deps';
import { SourceError } from '@/lib/server/http';
import { fetchWeatherHistory } from '@/lib/sources/weatherHistory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 40 years of NASA POWER monthly data can take a while on a cold cache.
export const maxDuration = 60;

const body = z.object({ lon: z.number().min(-180).max(180), lat: z.number().min(-90).max(90) });

/** POST {lon, lat} → 40 years of NASA POWER monthly rain and heat for the Finance risk view. */
export async function POST(req: Request) {
  let parsed: z.infer<typeof body>;
  try {
    parsed = body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Send {"lon": number, "lat": number}.' }, { status: 400 });
  }
  try {
    const { years, fetchedAt } = await fetchWeatherHistory([parsed.lon, parsed.lat], serverDeps());
    return NextResponse.json({ years, fetchedAt });
  } catch (err) {
    return NextResponse.json({ error: err instanceof SourceError ? err.message : 'Weather history is unavailable.' }, { status: 502 });
  }
}
