import type { Feature, FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

export type BoundaryFormat = 'geojson' | 'kml' | 'shapefile';

export const ACCEPTED_BOUNDARY_EXTENSIONS = ['.geojson', '.json', '.kml', '.zip'];

export function detectFormat(fileName: string): BoundaryFormat | null {
  const n = fileName.toLowerCase();
  if (n.endsWith('.geojson') || n.endsWith('.json')) return 'geojson';
  if (n.endsWith('.kml')) return 'kml';
  if (n.endsWith('.zip')) return 'shapefile';
  return null;
}

export type AnyFeature = Feature<Geometry | null, GeoJsonProperties>;

/** Flatten any GeoJSON object (FeatureCollection, Feature, bare geometry, GeometryCollection) into features. */
export function toFeatures(obj: unknown): AnyFeature[] {
  if (!obj || typeof obj !== 'object') throw new ImportError('The file does not contain GeoJSON.');
  const o = obj as { type?: string };
  switch (o.type) {
    case 'FeatureCollection': {
      const fc = obj as FeatureCollection;
      if (!Array.isArray(fc.features)) throw new ImportError('The FeatureCollection has no "features" list.');
      return fc.features as AnyFeature[];
    }
    case 'Feature':
      return [obj as AnyFeature];
    case 'GeometryCollection':
      return ((obj as { geometries?: Geometry[] }).geometries ?? []).map((g) => ({ type: 'Feature', properties: {}, geometry: g }));
    case 'Polygon':
    case 'MultiPolygon':
    case 'Point':
    case 'MultiPoint':
    case 'LineString':
    case 'MultiLineString':
      return [{ type: 'Feature', properties: {}, geometry: obj as Geometry }];
    default:
      throw new ImportError(`This is not a GeoJSON file (found type "${String(o.type ?? 'none')}").`);
  }
}

export function parseGeoJSON(text: string): AnyFeature[] {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new ImportError('The file is not valid JSON. Check that it is a complete GeoJSON export.');
  }
  return toFeatures(json);
}

interface XmlParser {
  parseFromString(s: string, type: string): Document;
}

export async function parseKML(text: string, parser?: XmlParser): Promise<AnyFeature[]> {
  const { kml } = await import('@tmcw/togeojson');
  const p: XmlParser = parser ?? new DOMParser();
  const doc = p.parseFromString(text, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0 || !doc.getElementsByTagName('kml').length) {
    throw new ImportError('The file is not valid KML (the XML could not be read). If it is a .kmz, unzip it first.');
  }
  return toFeatures(kml(doc));
}

export async function parseShapefileZip(buffer: ArrayBuffer): Promise<AnyFeature[]> {
  const { default: shp } = await import('shpjs');
  let out: unknown;
  try {
    out = await shp(buffer);
  } catch (err) {
    throw new ImportError(`The zip could not be read as a shapefile (${(err as Error).message}). It must contain at least the .shp, .shx and .dbf files.`);
  }
  const collections = (Array.isArray(out) ? out : [out]) as FeatureCollection[];
  const features = collections.flatMap((fc) => toFeatures(fc));
  if (features.some((f) => f.geometry && looksProjected(f.geometry))) {
    throw new ImportError('The shapefile coordinates are not latitude/longitude and no usable .prj projection file was found. Re-export it with a .prj file, or as GeoJSON in WGS84.');
  }
  return features;
}

function looksProjected(g: Geometry): boolean {
  const first = JSON.stringify(g).match(/-?\d+(\.\d+)?(e[-+]?\d+)?/gi)?.slice(0, 2).map(Number) ?? [];
  return first.length === 2 && (Math.abs(first[0]) > 180 || Math.abs(first[1]) > 90);
}

export interface FileLike {
  name: string;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export async function parseBoundaryFile(file: FileLike): Promise<AnyFeature[]> {
  const fmt = detectFormat(file.name);
  if (!fmt) throw new ImportError(`"${file.name}" is not a supported format. Use GeoJSON (.geojson or .json), KML (.kml) or a zipped shapefile (.zip).`);
  if (fmt === 'geojson') return parseGeoJSON(await file.text());
  if (fmt === 'kml') return parseKML(await file.text());
  return parseShapefileZip(await file.arrayBuffer());
}
