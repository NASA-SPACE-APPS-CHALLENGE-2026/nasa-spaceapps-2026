declare module 'shpjs' {
  import type { FeatureCollection } from 'geojson';
  type ShpResult = FeatureCollection & { fileName?: string };
  export default function shp(input: ArrayBuffer | Uint8Array | string): Promise<ShpResult | ShpResult[]>;
}
declare module '@mapbox/shp-write' {
  const shpwrite: { zip(geojson: unknown, options?: Record<string, unknown>): Promise<ArrayBuffer | Uint8Array> };
  export default shpwrite;
}
