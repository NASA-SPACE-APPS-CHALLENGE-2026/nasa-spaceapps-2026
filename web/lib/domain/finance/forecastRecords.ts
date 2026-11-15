/** Original import rows are kept intact, including unfamiliar supplier columns and rejected rows. */
export const DATASETS = ['land', 'equipment', 'purchases', 'payments', 'harvests', 'agronomy', 'markets'] as const;
export type Dataset = (typeof DATASETS)[number];
export type RawRow = Record<string, unknown>;
export type ForecastRecords = Record<Dataset, RawRow[]>;

export function emptyForecastRecords(): ForecastRecords {
  return { land: [], equipment: [], purchases: [], payments: [], harvests: [], agronomy: [], markets: [] };
}
