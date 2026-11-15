/**
 * Layer 6: records the farmer imported (yield, machine, supplier and finance files).
 * Files are read in the browser. Only normalized, aggregated rows are stored, never the file itself.
 */

export type ImportKind = 'yield' | 'machine' | 'supplier' | 'finance';
export type ImportFormat = 'csv' | 'xlsx' | 'xls' | 'ods' | 'pdf' | 'image' | 'shapefile' | 'isoxml';
export type FindingConfidence = 'high' | 'medium' | 'low';

/** A season's crop as recorded in a file, before mapping to the crop catalogue. */
export interface YieldRow {
  fieldName?: string;
  fieldId?: string;
  year: number;
  /** Catalog crop id, or null when the crop name was not recognised. */
  crop: string | null;
  cropText: string;
  acres?: number;
  buPerAc?: number;
  totalBu?: number;
  moisturePct?: number;
  /** Where the row came from: a table row, a map (points averaged inside a field), or a machine log. */
  via: 'table' | 'map' | 'log';
  points?: number;
}

export type TxnCategory =
  | 'seed'
  | 'fertilizer'
  | 'chemicals'
  | 'insurance'
  | 'machinery'
  | 'labor'
  | 'interest'
  | 'land'
  | 'cover'
  | 'irrigation'
  | 'other'
  | 'grain-sale'
  | 'program'
  | 'other-income'
  | 'transfer';

export interface Txn {
  date: string; // YYYY-MM-DD
  description: string;
  account?: string;
  /** Positive = money in, negative = money out. */
  amount: number;
  category: TxnCategory;
  /** Catalog crop id when a grain sale names the crop. */
  crop?: string;
  /** Bushels sold, when the record says so. */
  bushels?: number;
}

export type ProductType = 'n-fertilizer' | 'p-fertilizer' | 'k-fertilizer' | 'blend' | 'lime' | 'seed-corn' | 'seed-soybeans' | 'seed-small-grain' | 'seed-cover' | 'herbicide' | 'insecticide' | 'fungicide' | 'fuel' | 'other';

export interface PurchaseLine {
  date?: string;
  supplier?: string;
  product: string;
  productType: ProductType;
  qty?: number;
  unit?: string;
  unitPrice?: number;
  total?: number;
  /** N-P2O5-K2O percentages for fertilizers. */
  analysis?: [number, number, number];
  /** Pounds of product per unit, when known (ton = 2000, gal of UAN 28% ≈ 10.67…). */
  lbsPerUnit?: number;
}

export type OperationKind = 'plant' | 'apply' | 'harvest' | 'tillage' | 'other';

export interface Operation {
  fieldName?: string;
  fieldId?: string;
  date?: string;
  kind: OperationKind;
  product?: string;
  productType?: ProductType;
  crop?: string | null;
  /** Average rate over the area, in rateUnit. */
  rate?: number;
  rateUnit?: string;
  /** Pounds of N per acre, when the product and rate allow it. */
  nLbsPerAc?: number;
  /** Seeds per acre for planting operations. */
  seedsPerAc?: number;
  areaAc?: number;
  via: 'table' | 'map' | 'isoxml';
}

export type NormalizedRows =
  | { kind: 'yield'; rows: YieldRow[] }
  | { kind: 'finance'; rows: Txn[] }
  | { kind: 'supplier'; rows: PurchaseLine[] }
  | { kind: 'machine'; rows: Operation[] };

/**
 * A value the file suggests for PlotTwist. Targets:
 *   param:<assumption id>         a finance assumption (corn.yield, n.price, rent, actual.seed…)
 *   lastYear:totalRevenue | lastYear:totalCosts
 *   supplier:seedSupplier | supplier:fertilizerSupplier | supplier:grainBuyer
 *   field:<fieldId>:nRateCorn     per-field corn nitrogen rate (Simulator)
 *   field:<fieldId>:tillage
 *   crop:<fieldId>:<year>         confirm a season's crop on Fields (value = catalog crop id)
 */
export interface Finding {
  target: string;
  label: string;
  group: 'Totals' | 'Yields' | 'Prices' | 'Input costs' | 'Your actual costs' | 'Field practices' | 'Crop history' | 'Suppliers';
  value: number | string;
  unit?: string;
  /** Short text: which rows, years or fields this came from. */
  evidence: string;
  confidence: FindingConfidence;
  /** Ticked by default in review. */
  suggested: boolean;
}

export interface ImportRecord {
  id: string;
  kind: ImportKind;
  fileName: string;
  size: number;
  format: ImportFormat;
  importedAt: string;
  /** One line for the card, e.g. "42 rows, 2023–2025, 5 fields". */
  summary: string;
  warnings: string[];
  data: NormalizedRows;
  findings: Finding[];
  /** Targets the farmer chose to use. Unticking or removing the record undoes them. */
  applied: string[];
}

/** A rectangular table read from CSV, Excel, a PDF page or OCR. */
export interface Table {
  name: string;
  headers: string[];
  rows: Cell[][];
}

export type Cell = string | number | null;

/** Stored records are capped so localStorage stays well under its quota. */
export const MAX_STORED_ROWS = 2000;
