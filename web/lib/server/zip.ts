import zcta from '../../data/zcta.json';

const TABLE = zcta as unknown as Record<string, [number, number]>;

/** ZIP → approximate centre, from Census ZCTA internal points. PO-box-only ZIPs have no ZCTA. */
export function lookupZip(zip: string): { lat: number; lon: number } | null {
  if (!/^\d{5}$/.test(zip)) return null;
  const hit = TABLE[zip];
  return hit ? { lat: hit[0], lon: hit[1] } : null;
}
