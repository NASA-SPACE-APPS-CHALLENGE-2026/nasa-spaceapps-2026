import { NextResponse } from 'next/server';
import { lookupZip } from '@/lib/server/zip';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ zip: string }> }) {
  const { zip } = await params;
  const clean = zip.trim().slice(0, 5);
  if (!/^\d{5}$/.test(clean)) return NextResponse.json({ error: 'Enter a 5-digit US ZIP code.' }, { status: 400 });
  const hit = lookupZip(clean);
  if (!hit) {
    return NextResponse.json({ error: `ZIP ${clean} was not found. It may be a PO-box-only ZIP; try a nearby ZIP or enter coordinates.` }, { status: 404 });
  }
  return NextResponse.json({ zip: clean, ...hit, source: 'US Census Bureau ZCTA centroids (2024 Gazetteer)', approximate: true });
}
