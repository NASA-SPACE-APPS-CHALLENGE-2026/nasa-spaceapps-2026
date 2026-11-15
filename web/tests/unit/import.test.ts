import { DOMParser } from '@xmldom/xmldom';
import shpwrite from '@mapbox/shp-write';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { acresFromM2, areaM2 } from '@/lib/domain/acreage';
import { candidateName, nameColumns, normalizeFeatures } from '@/lib/import/normalize';
import { detectFormat, ImportError, parseBoundaryFile, parseGeoJSON, parseKML, parseShapefileZip } from '@/lib/import/parse';

const square = (x: number, y: number, d = 0.004) => [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]];

const sampleFC = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { FIELD_NAME: 'North 80', CROP: 'Corn' }, geometry: { type: 'Polygon', coordinates: square(-93.6, 42) } },
    { type: 'Feature', properties: { FIELD_NAME: 'Creek split' }, geometry: { type: 'MultiPolygon', coordinates: [square(-93.59, 42), square(-93.58, 42)] } },
    { type: 'Feature', properties: { FIELD_NAME: 'Well pin' }, geometry: { type: 'Point', coordinates: [-93.57, 42.01] } },
    { type: 'Feature', properties: { FIELD_NAME: 'Fence' }, geometry: { type: 'LineString', coordinates: [[-93.6, 42], [-93.59, 42]] } },
    { type: 'Feature', properties: {}, geometry: null },
  ],
};

describe('format detection', () => {
  it('detects by extension', () => {
    expect(detectFormat('farm.geojson')).toBe('geojson');
    expect(detectFormat('FARM.JSON')).toBe('geojson');
    expect(detectFormat('fields.kml')).toBe('kml');
    expect(detectFormat('boundaries.zip')).toBe('shapefile');
    expect(detectFormat('fields.kmz')).toBeNull();
    expect(detectFormat('yield.csv')).toBeNull();
  });

  it('gives a clear error for unsupported files', async () => {
    await expect(parseBoundaryFile({ name: 'notes.txt', text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) })).rejects.toThrow(/not a supported format/);
  });
});

describe('GeoJSON', () => {
  it('parses FeatureCollections, Features and bare geometries', () => {
    expect(parseGeoJSON(JSON.stringify(sampleFC))).toHaveLength(5);
    expect(parseGeoJSON(JSON.stringify(sampleFC.features[0]))).toHaveLength(1);
    expect(parseGeoJSON(JSON.stringify({ type: 'Polygon', coordinates: square(-93, 42) }))[0].geometry?.type).toBe('Polygon');
    expect(parseGeoJSON('﻿' + JSON.stringify(sampleFC))).toHaveLength(5); // BOM
  });

  it('rejects broken or non-GeoJSON input with plain messages', () => {
    expect(() => parseGeoJSON('{"type": "FeatureCollection", ')).toThrow(ImportError);
    expect(() => parseGeoJSON('{"hello": 1}')).toThrow(/not a GeoJSON file/);
  });
});

describe('normalize', () => {
  it('turns polygons into boundaries, points into 40-ac pins, and skips lines and empties', () => {
    const { candidates, skipped } = normalizeFeatures(parseGeoJSON(JSON.stringify(sampleFC)), { splitMultiPolygons: false });
    expect(candidates.map((c) => [c.key, c.kind, c.geometry.type])).toEqual([
      ['0', 'boundary', 'Polygon'],
      ['1', 'boundary', 'MultiPolygon'],
      ['2', 'pin', 'Polygon'],
    ]);
    expect(acresFromM2(areaM2(candidates[2].geometry))).toBeCloseTo(40, 0);
    expect(skipped).toEqual([
      { sourceIndex: 3, reason: 'Not a boundary (a line, not a closed shape)' },
      { sourceIndex: 4, reason: 'No geometry' },
    ]);
  });

  it('splits multipolygons into parts when asked', () => {
    const { candidates } = normalizeFeatures(parseGeoJSON(JSON.stringify(sampleFC)), { splitMultiPolygons: true });
    const parts = candidates.filter((c) => c.sourceIndex === 1);
    expect(parts.map((c) => c.key)).toEqual(['1.0', '1.1']);
    expect(candidateName(parts[1], 'FIELD_NAME', 2)).toBe('Creek split (part 2)');
  });

  it('closes open rings and drops Z values', () => {
    const open = { type: 'Polygon', coordinates: [[[-93.6, 42, 300], [-93.59, 42, 301], [-93.59, 42.01, 302], [-93.6, 42.01, 303]]] };
    const { candidates } = normalizeFeatures(parseGeoJSON(JSON.stringify(open)), { splitMultiPolygons: false });
    const ring = (candidates[0].geometry as { coordinates: number[][][] }).coordinates[0];
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual([-93.6, 42]);
    expect(ring[4]).toEqual(ring[0]);
  });

  it('attaches validation issues (self-intersection blocks)', () => {
    const bowtie = { type: 'Polygon', coordinates: [[[-93.6, 42], [-93.59, 42.01], [-93.59, 42], [-93.6, 42.01], [-93.6, 42]]] };
    const { candidates } = normalizeFeatures(parseGeoJSON(JSON.stringify(bowtie)), { splitMultiPolygons: false });
    expect(candidates[0].issues.map((i) => i.code)).toContain('self-intersecting');
  });

  it('auto-picks a name column and ignores crop columns', () => {
    const items = sampleFC.features.map((f) => ({ properties: f.properties as Record<string, unknown> }));
    expect(nameColumns(items).best).toBe('FIELD_NAME');
    expect(nameColumns([{ properties: { Label: 'A', acres: 3 } }]).best).toBe('Label');
    expect(nameColumns([{ properties: { acres: 3 } }]).best).toBeNull();
    const { candidates } = normalizeFeatures(parseGeoJSON(JSON.stringify(sampleFC)), { splitMultiPolygons: false });
    expect(candidateName(candidates[0], null, 1)).toBe('Imported field 1');
    expect(candidateName(candidates[0], 'FIELD_NAME', 1)).toBe('North 80');
  });
});

describe('KML', () => {
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Placemark><name>South field</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
    -93.60,42.00,0 -93.596,42.00,0 -93.596,42.004,0 -93.60,42.004,0 -93.60,42.00,0
  </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
  <Placemark><name>Gate</name><Point><coordinates>-93.59,42.0,0</coordinates></Point></Placemark>
</Document></kml>`;

  it('parses placemarks with names', async () => {
    const features = await parseKML(kml, new DOMParser() as unknown as { parseFromString(s: string, t: string): Document });
    expect(features).toHaveLength(2);
    expect(features[0].properties?.name).toBe('South field');
    expect(features[0].geometry?.type).toBe('Polygon');
    const { candidates } = normalizeFeatures(features, { splitMultiPolygons: false });
    expect(candidates.map((c) => c.kind)).toEqual(['boundary', 'pin']);
  });

  it('rejects files that are not KML', async () => {
    await expect(parseKML('<html><body>nope</body></html>', new DOMParser() as unknown as { parseFromString(s: string, t: string): Document })).rejects.toThrow(/not valid KML/);
  });
});

describe('zipped shapefile', () => {
  async function zipOf(fc: object): Promise<ArrayBuffer> {
    const out = await shpwrite.zip(fc, { outputType: 'arraybuffer', compression: 'STORE' });
    return out instanceof ArrayBuffer ? out : (out as Uint8Array).buffer.slice(0) as ArrayBuffer;
  }

  it('reads polygons and attributes from a WGS84 shapefile zip', async () => {
    const fc = { type: 'FeatureCollection', features: [sampleFC.features[0], { type: 'Feature', properties: { FIELD_NAME: 'East' }, geometry: { type: 'Polygon', coordinates: square(-93.55, 42) } }] };
    const features = await parseShapefileZip(await zipOf(fc));
    const polys = features.filter((f) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon');
    expect(polys).toHaveLength(2);
    expect(polys.map((f) => f.properties?.FIELD_NAME).sort()).toEqual(['East', 'North 80']);
    const { candidates } = normalizeFeatures(polys, { splitMultiPolygons: false });
    // 0.004° square at 42°N ≈ 444 m × 330 m ≈ 36.3 ac
    expect(acresFromM2(areaM2(candidates[0].geometry))).toBeCloseTo(36.3, 0);
  });

  it('refuses projected shapefiles without a .prj', async () => {
    const projected = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id: 1 }, geometry: { type: 'Polygon', coordinates: [[[500000, 4600000], [501000, 4600000], [501000, 4601000], [500000, 4600000]]] } }] };
    const zip = await JSZip.loadAsync(await zipOf(projected));
    for (const name of Object.keys(zip.files)) if (name.toLowerCase().endsWith('.prj')) zip.remove(name);
    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    await expect(parseShapefileZip(buf)).rejects.toThrow(/not latitude\/longitude/);
  });

  it('gives a clear error for zips without a shapefile', async () => {
    const zip = new JSZip();
    zip.file('readme.txt', 'hello');
    await expect(parseShapefileZip(await zip.generateAsync({ type: 'arraybuffer' }))).rejects.toThrow(ImportError);
  });
});
