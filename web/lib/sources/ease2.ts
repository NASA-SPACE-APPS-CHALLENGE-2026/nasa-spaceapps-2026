import proj4 from 'proj4';
import type { LonLat } from '../domain/types';

/**
 * EASE-Grid 2.0 global 9 km grid (EPSG:6933), used by SMAP L3 enhanced products.
 * Grid constants from the NSIDC EASE-Grid 2.0 definition (M09: 3856 columns × 1624 rows).
 * Verified live 2026-11-15: the pixel returned for (-93.62, 42.03) has its centre at (-93.594, 42.043).
 */
proj4.defs('EPSG:6933', '+proj=cea +lat_ts=30 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs');
const toEase = proj4('EPSG:4326', 'EPSG:6933');

export const M09 = { cols: 3856, rows: 1624, cell: 9008.055210146, x0: -17367530.44516138, y0: 7314540.83086444 };

export function ease2M09RowCol([lon, lat]: LonLat): { row: number; col: number } {
  const [x, y] = toEase.forward([lon, lat]);
  const col = Math.min(M09.cols - 1, Math.max(0, Math.floor((x - M09.x0) / M09.cell)));
  const row = Math.min(M09.rows - 1, Math.max(0, Math.floor((M09.y0 - y) / M09.cell)));
  return { row, col };
}

/** Centre of a grid cell, for tests and debugging. */
export function ease2M09Centre(row: number, col: number): LonLat {
  const [lon, lat] = toEase.inverse([M09.x0 + (col + 0.5) * M09.cell, M09.y0 - (row + 0.5) * M09.cell]);
  return [lon, lat];
}
