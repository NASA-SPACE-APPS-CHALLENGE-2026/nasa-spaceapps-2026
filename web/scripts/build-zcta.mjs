// Builds data/zcta.json ({ "50010": [lat, lon], ... }) from the Census Gazetteer ZCTA file.
// Source (public domain): https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_zcta_national.zip
// Usage: node scripts/build-zcta.mjs path/to/2024_Gaz_zcta_national.txt
import { readFileSync, writeFileSync } from 'node:fs';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/build-zcta.mjs <gazetteer .txt>');
  process.exit(1);
}
const lines = readFileSync(input, 'utf8').split(/\r?\n/).slice(1);
const out = {};
for (const line of lines) {
  const cols = line.split('\t').map((c) => c.trim());
  if (cols.length < 7 || !/^\d{5}$/.test(cols[0])) continue;
  const lat = Number(cols[5]);
  const lon = Number(cols[6]);
  if (Number.isFinite(lat) && Number.isFinite(lon)) out[cols[0]] = [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5];
}
writeFileSync(new URL('../data/zcta.json', import.meta.url), JSON.stringify(out));
console.log(`Wrote ${Object.keys(out).length} ZCTAs`);
