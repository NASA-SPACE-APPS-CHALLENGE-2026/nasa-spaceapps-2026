import type { Dataset, RawRow } from '@/lib/domain/finance/forecastRecords';

const operatingCategories = ['seed', 'fertilizer', 'chemicals', 'fuel', 'labor', 'irrigation', 'machinery', 'cover', 'other'];
const scenario = ['conservative', 'expected', 'optimistic'];

interface FormSpec {
  title: string;
  description: string;
  columns: string[];
  choices?: Record<string, string[]>;
  example: RawRow;
}

export const forms: Record<Dataset, FormSpec> = {
  land: {
    title: 'Field acreage and rotations',
    description: 'Use one field ID across all five datasets. Enter each rotation in growing-season order, starting with the first forecast year.',
    columns: ['id', 'name', 'acres', 'unavailableAcres', 'usableAcres', 'plantedAcres', 'harvestedAcres', 'previousCrop', 'previousCover', 'currentRotation', 'proposedRotation', 'location', 'soil', 'source'],
    example: { id: 'north-40', name: 'North 40', acres: 40, unavailableAcres: 2, plantedAcres: 38, harvestedAcres: 37, previousCrop: 'corn', currentRotation: ['corn'], proposedRotation: ['soybeans', 'corn'], source: 'Verified field map' },
  },
  equipment: {
    title: 'Machine and equipment data',
    description: 'Enter working capacity and available days for each planting or harvesting machine. Efficiency is a fraction from 0 to 1.',
    columns: ['id', 'machineId', 'operation', 'supportedCrops', 'widthM', 'speedKph', 'hoursPerDay', 'efficiency', 'dailyCapacityAcres', 'availableDays', 'season', 'operatingCostPerHour', 'fuelPerHour', 'fuelPrice', 'source'],
    choices: { operation: ['plant', 'harvest'] },
    example: { id: 'combine-1', operation: 'harvest', supportedCrops: ['corn', 'soybeans'], widthM: 6, speedKph: 5, hoursPerDay: 8, efficiency: 0.7, availableDays: 12, source: 'Combine log' },
  },
  purchases: {
    title: 'Supplier and purchase records',
    description: 'Enter purchases and opening inventory by lot. Record each application separately with the original lot ID, field, crop and growing season.',
    columns: ['id', 'kind', 'lotId', 'transactionId', 'product', 'category', 'quantity', 'unit', 'totalPrice', 'actualUsage', 'fieldId', 'crop', 'season', 'supplier', 'date', 'source'],
    choices: { kind: ['purchase', 'opening', 'application'], category: operatingCategories },
    example: { id: 'lot-N7', kind: 'purchase', product: 'Urea', category: 'fertilizer', quantity: 2000, unit: 'lb', totalPrice: 540, supplier: 'Farm co-op', source: 'Invoice 208' },
  },
  payments: {
    title: 'Finance and payments',
    description: 'Use the production season for sales and contracts. Enter net sale proceeds, quantity and unit for realized prices, plus payment status for cash and receivables.',
    columns: ['id', 'kind', 'transactionId', 'season', 'crop', 'fieldId', 'amount', 'quantity', 'unit', 'price', 'status', 'cashReceived', 'category', 'lotId', 'buyer', 'date', 'paymentDate', 'source'],
    choices: { kind: ['sale', 'contract', 'operating', 'supplier-payment', 'government', 'insurance', 'financing', 'transfer', 'interest', 'depreciation', 'tax', 'rent', 'capital'], status: ['paid', 'receivable', 'confirmed', 'pending', 'cancelled'], category: operatingCategories },
    example: { id: 'sale-208', kind: 'sale', crop: 'corn', season: 2025, quantity: 3800, unit: 'bu', amount: 17480, status: 'paid', source: 'Elevator settlement 208' },
  },
  harvests: {
    title: 'Yield and harvest records',
    description: 'Enter production quantity with its unit and harvested acreage. Separate planted acreage lets the forecast account for acres left unharvested.',
    columns: ['id', 'fieldId', 'crop', 'season', 'plantedAcres', 'harvestedAcres', 'quantity', 'unit', 'harvestLossQuantity', 'previousCrop', 'previousCover', 'plannedCover', 'harvestDate', 'variety', 'moisture', 'source'],
    example: { id: 'ticket-31', fieldId: 'north-40', crop: 'corn', season: 2025, plantedAcres: 38, harvestedAcres: 37, quantity: 5920, unit: 'bu', previousCrop: 'soybeans', source: 'Harvest ticket 31' },
  },
  agronomy: {
    title: 'Yield, acreage and rotation assumptions',
    description: 'Scope a measured yield or supported adjustment by crop, field, year and scenario. A final modeled yield includes its adjustments. Identify the farm record, regional benchmark or model behind each value.',
    columns: ['id', 'kind', 'value', 'unit', 'crop', 'fieldId', 'season', 'scenario', 'previousCrop', 'previousCover', 'source'],
    choices: { kind: ['yield', 'benchmark', 'rotation', 'weather', 'soil', 'management', 'recencyWeight', 'plantedAcres', 'harvestedAcres', 'harvestEfficiency', 'harvestLoss', 'soilNOpening', 'soilNChange', 'soilNResponse'], scenario },
    example: { id: 'corn-yield-2027', kind: 'yield', value: 160, unit: 'bu', crop: 'corn', fieldId: 'north-40', season: 2027, source: 'Field-specific agronomist forecast' },
  },
  markets: {
    title: 'Prices and operating expenses',
    description: 'Set expected prices, basis, marketing costs and complete operating budgets. Enter contracts in Finance and payments with the quantity covered and confirmed status.',
    columns: ['id', 'kind', 'value', 'unit', 'crop', 'fieldId', 'season', 'scenario', 'previousCrop', 'previousCover', 'plannedCover', 'lotId', 'source'],
    choices: { kind: ['farmer-price', 'market-price', 'historical-price', 'operating-rate', 'input-rate', 'cover-rate', 'expense-coverage', 'basis', 'delivery', 'marketing'], scenario },
    example: { id: 'corn-bid-2027', kind: 'market-price', value: 4.6, unit: 'bu', crop: 'corn', season: 2027, source: 'Local elevator bid sheet' },
  },
};

const labels: Record<string, string> = {
  id: 'Record ID', fieldId: 'Field ID', lotId: 'Original lot ID', source: 'Source or evidence',
  widthM: 'Working width (m)', speedKph: 'Working speed (km/h)', hoursPerDay: 'Working hours per day',
  operatingCostPerHour: 'Operating cost per hour, excluding fuel ($)', fuelPerHour: 'Fuel units per hour', fuelPrice: 'Price per fuel unit ($)',
  price: 'Contract price per unit ($)', amount: 'Transaction amount ($)', totalPrice: 'Total purchase cost ($)', cashReceived: 'Cash received ($)',
  season: 'Growing season (year)', quantity: 'Quantity', value: 'Value', date: 'Transaction date',
  supportedCrops: 'Supported crops (comma-separated)', currentRotation: 'Current rotation (comma-separated)', proposedRotation: 'Proposed rotation (comma-separated)',
};
export const labelOf = (key: string) => labels[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (ch) => ch.toUpperCase());

export const lists = new Set(['currentRotation', 'proposedRotation', 'supportedCrops']);
export const numbers = new Set('acres unavailableAcres usableAcres plantedAcres harvestedAcres widthM speedKph hoursPerDay efficiency dailyCapacityAcres availableDays season operatingCostPerHour fuelPerHour fuelPrice quantity totalPrice actualUsage amount price cashReceived value moisture harvestLossQuantity'.split(' '));
