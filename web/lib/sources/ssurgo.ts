import { area, simplify } from '@turf/turf';
import { SOURCE_META } from '../domain/sourceMeta';
import type { FieldGeometry, ProfileValue, SourceResult } from '../domain/types';
import { DAY } from '../server/cache';
import { fetchText, parseJson, SourceError } from '../server/http';
import { messageOf } from './power';
import type { ProfileSource, SourceContext, SourceDeps } from './types';

const SDA_URL = 'https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest';
const MAX_VERTICES = 400;

/** WKT with 6-decimal coordinates; simplified first when the boundary is very detailed. */
export function toWkt(geometry: FieldGeometry): string {
  let g = geometry;
  const count = (x: FieldGeometry) => JSON.stringify(x.coordinates).split('],[').length;
  for (let tol = 0.00001; count(g) > MAX_VERTICES && tol < 0.01; tol *= 2) {
    g = simplify(geometry, { tolerance: tol, highQuality: true }) as FieldGeometry;
  }
  const ring = (r: number[][]) => `(${r.map(([x, y]) => `${x.toFixed(6)} ${y.toFixed(6)}`).join(', ')})`;
  const poly = (rings: number[][][]) => `(${rings.map(ring).join(', ')})`;
  return g.type === 'Polygon' ? `POLYGON${poly(g.coordinates)}` : `MULTIPOLYGON(${g.coordinates.map(poly).join(', ')})`;
}

export function mukeyAreaQuery(wkt: string): string {
  if (!/^[A-Z]+[()0-9.,\s-]+$/.test(wkt)) throw new SourceError('Field boundary could not be converted for the soil query.', 'format');
  return (
    `~DeclareGeometry(@aoi)~ select @aoi = geometry::STGeomFromText('${wkt}', 4326).MakeValid() ` +
    '~DeclareIdGeomTable(@intersectedPolygonGeometries)~ ~GetClippedMapunits(@aoi,polygon,geo,@intersectedPolygonGeometries)~ ' +
    '~DeclareIdGeogTable(@intersectedPolygonGeographies)~ ~GetGeogFromGeomWgs84(@intersectedPolygonGeometries,@intersectedPolygonGeographies)~ ' +
    'select id as mukey, sum(geog.STArea()) as area_m2 from @intersectedPolygonGeographies group by id'
  );
}

export function propertiesQuery(mukeys: string[]): string {
  if (!mukeys.every((k) => /^\d+$/.test(k))) throw new SourceError('Soil survey returned an unexpected map unit key.', 'format');
  return (
    'SELECT mu.mukey, mu.muname, ma.drclassdcd, ma.hydgrpdcd, c.cokey, c.compname, c.comppct_r, c.majcompflag, ' +
    'h.hzdept_r, h.hzdepb_r, h.om_r, tg.texdesc FROM mapunit mu LEFT JOIN muaggatt ma ON ma.mukey = mu.mukey ' +
    'JOIN component c ON c.mukey = mu.mukey LEFT JOIN chorizon h ON h.cokey = c.cokey AND h.hzdept_r = 0 ' +
    "LEFT JOIN chtexturegrp tg ON tg.chkey = h.chkey AND tg.rvindicator = 'Yes' " +
    `WHERE mu.mukey IN (${mukeys.map((k) => `'${k}'`).join(',')}) ORDER BY mu.mukey, c.comppct_r DESC`
  );
}

type Row = Record<string, string | null>;

/** SDA "JSON+COLUMNNAME": { Table: [[header...], [row...], ...] }. An empty result is `{}`. */
export function parseTable(text: string): Row[] {
  const json = parseJson<{ Table?: Array<Array<string | null>> }>(text, 'Soil Data Access');
  if (!json.Table || json.Table.length < 2) return [];
  const [header, ...rows] = json.Table;
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [String(h), r[i] ?? null])));
}

async function sdaQuery(deps: SourceDeps, query: string): Promise<string> {
  const { status, text } = await fetchText(deps.fetch, SDA_URL, {
    label: 'USDA Soil Data Access',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'JSON+COLUMNNAME', query }),
    timeoutMs: 30000,
  });
  if (status !== 200) {
    const detail = text.match(/<ServiceException>\s*([\s\S]*?)<\/ServiceException>/)?.[1]?.trim();
    throw new SourceError(`USDA Soil Data Access returned an error (HTTP ${status})${detail ? `: ${detail}` : ''}.`, 'http', status);
  }
  return text;
}

export interface SoilSummary {
  mapUnitCount: number;
  dominant: { mukey: string; name: string; pctOfField: number };
  texture: string | null;
  drainage: string | null;
  hydrologicGroup: string | null;
  organicMatterPct: number | null;
  coveredPct: number;
}

export function summarizeSoil(areas: Row[], props: Row[], fieldAreaM2: number): SoilSummary | null {
  const areaBy = new Map<string, number>();
  for (const a of areas) {
    const m2 = Number(a.area_m2);
    if (a.mukey && Number.isFinite(m2) && m2 > 0) areaBy.set(a.mukey, (areaBy.get(a.mukey) ?? 0) + m2);
  }
  const total = [...areaBy.values()].reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  const byMukey = new Map<string, Row[]>();
  for (const p of props) if (p.mukey) byMukey.set(p.mukey, [...(byMukey.get(p.mukey) ?? []), p]);

  const [domKey, domArea] = [...areaBy.entries()].sort((a, b) => b[1] - a[1])[0];
  const domRows = byMukey.get(domKey) ?? [];
  const domComp = [...domRows].sort((a, b) => Number(b.comppct_r ?? 0) - Number(a.comppct_r ?? 0))[0];

  // Organic matter: component-weighted within each map unit, then area-weighted across map units.
  let omSum = 0;
  let omArea = 0;
  for (const [mukey, m2] of areaBy) {
    let w = 0;
    let s = 0;
    for (const r of byMukey.get(mukey) ?? []) {
      const pct = Number(r.comppct_r);
      const om = r.om_r === null ? NaN : Number(r.om_r);
      if (Number.isFinite(pct) && pct > 0 && Number.isFinite(om)) {
        w += pct;
        s += pct * om;
      }
    }
    if (w > 0) {
      omSum += (s / w) * m2;
      omArea += m2;
    }
  }

  return {
    mapUnitCount: areaBy.size,
    dominant: { mukey: domKey, name: domRows[0]?.muname ?? `Map unit ${domKey}`, pctOfField: Math.round((domArea / total) * 100) },
    texture: domComp?.texdesc ?? null,
    drainage: domRows[0]?.drclassdcd ?? null,
    hydrologicGroup: domRows[0]?.hydgrpdcd ?? null,
    organicMatterPct: omArea > 0 ? Math.round((omSum / omArea) * 10) / 10 : null,
    coveredPct: fieldAreaM2 > 0 ? Math.min(100, Math.round((total / fieldAreaM2) * 100)) : 100,
  };
}

export function soilValues(s: SoilSummary): ProfileValue[] {
  const survey = 'From the county soil survey map (generalized map units with typical values), not a soil test of this field.';
  const v: ProfileValue[] = [
    { key: 'dominantSoil', label: 'Main soil', value: s.dominant.name, honesty: 'Estimated', note: `Covers about ${s.dominant.pctOfField}% of the field; ${s.mapUnitCount} soil map unit${s.mapUnitCount === 1 ? '' : 's'} in total.` },
  ];
  if (s.texture) v.push({ key: 'texture', label: 'Surface texture', value: s.texture, honesty: 'Estimated', note: `Main component of the main soil. ${survey}` });
  if (s.organicMatterPct !== null) v.push({ key: 'organicMatter', label: 'Organic matter (surface layer)', value: s.organicMatterPct, unit: '%', honesty: 'Estimated', note: `Area-weighted representative value. ${survey}` });
  if (s.drainage) v.push({ key: 'drainage', label: 'Drainage class', value: s.drainage, honesty: 'Estimated', note: `Dominant condition of the main soil. ${survey}` });
  if (s.hydrologicGroup) v.push({ key: 'hydrologicGroup', label: 'Hydrologic soil group', value: s.hydrologicGroup, honesty: 'Estimated', note: 'A = water soaks in fastest (least runoff) … D = slowest (most runoff). A dual group like B/D means drained / undrained.' });
  return v;
}

export const ssurgoSource: ProfileSource = {
  id: 'ssurgo',
  async run(ctx: SourceContext, deps: SourceDeps): Promise<SourceResult> {
    const meta = SOURCE_META.ssurgo;
    const base = { sourceId: meta.id, sourceName: meta.provider, docsUrl: meta.docsUrl, values: [] as ProfileValue[] };
    try {
      const wkt = toWkt(ctx.geometry);
      const areaRes = await deps.cache.getOrFetch(`ssurgo:areas:${wkt}`, 30 * DAY, () => sdaQuery(deps, mukeyAreaQuery(wkt)), ctx.now);
      const areas = parseTable(areaRes.value);
      if (areas.length === 0) {
        return { ...base, status: 'unavailable', fetchedAt: areaRes.fetchedAt, message: 'No soil survey (SSURGO) map units cover this location. Soil survey data is mainly available in the US.' };
      }
      const keys = [...new Set(areas.map((a) => String(a.mukey)))].sort();
      const propRes = await deps.cache.getOrFetch(`ssurgo:props:${keys.join(',')}`, 30 * DAY, () => sdaQuery(deps, propertiesQuery(keys)), ctx.now);
      const summary = summarizeSoil(areas, parseTable(propRes.value), area(ctx.geometry));
      if (!summary) throw new SourceError('Soil survey returned map units without usable areas.', 'empty');
      return {
        ...base,
        status: 'ok',
        fetchedAt: areaRes.fetchedAt,
        message: summary.coveredPct < 95 ? `Soil survey covers about ${summary.coveredPct}% of this field.` : undefined,
        values: soilValues(summary),
      };
    } catch (err) {
      return { ...base, status: 'unavailable', message: messageOf(err) };
    }
  },
};
