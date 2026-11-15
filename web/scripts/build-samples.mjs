// Builds the sample import files in web/samples/ for the demo farm (its field names, boundaries and 2022–2026
// crop history). All numbers are made up for demonstration and documented in docs/imports.md.
//
//   node scripts/build-samples.mjs        (needs Google Chrome for the invoice PDF and PNG)
//
// Outputs: yield-2023-2025.csv, yield-map-2025.zip, quickbooks-2025.csv, stripe-payments-2025.csv,
// coop-invoice-2026.xlsx, coop-invoice-2026.pdf, coop-invoice-2026-scan.pdf, coop-invoice-2026-photo.png,
// as-applied-2025.csv, TASKDATA-2025.zip (ISOXML with binary time logs).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'samples');
mkdirSync(out, { recursive: true });
const XLSX = require('xlsx');
const JSZip = require('jszip');
const shpwrite = require('@mapbox/shp-write');
const turf = require('@turf/turf');

// ---- demo fields (same rings as lib/demo/demoFarm.ts) ----
const src = readFileSync(join(root, 'lib/demo/demoFarm.ts'), 'utf8');
const FIELDS = [...src.matchAll(/name: '([^']+)',\s*(?:\/\/[^\n]*\n\s*)?ring: (\[\[.*?\]\]),\s*crops: \[(.*?)\]/gs)].map((m) => ({
  name: m[1],
  ring: JSON.parse(m[2]),
  crops: [...m[3].matchAll(/C\('([^']+)'\)/g)].map((c) => c[1]), // 2026, 2025, 2024, 2023, 2022
}));
if (FIELDS.length !== 6) throw new Error(`expected 6 demo fields, found ${FIELDS.length}`);
const poly = (f) => turf.polygon([f.ring]);
const acres = (f) => Math.round((turf.area(poly(f)) / 4046.8564224) * 10) / 10;
const cropIn = (f, year) => f.crops[2026 - year];
const NAMES = { corn: 'Corn', soybeans: 'Soybeans', oats: 'Oats', alfalfa: 'Alfalfa' };
const csv = (rows) => rows.map((r) => r.map((v) => (typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v ?? '')).join(',')).join('\n') + '\n';
const write = (name, data) => {
  writeFileSync(join(out, name), data);
  console.log(`  ${name}`);
};

// Deterministic pseudo-random numbers, so the samples are the same every run.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

// ---- 1. yield records, 2023–2025 (bushels at standard moisture) ----
const YIELD = { corn: [206, 214, 199], soybeans: [61, 63, 58], oats: [84, 88, 80] }; // by year 2025, 2024, 2023, small field-to-field offsets added
const yieldRows = [['Field', 'Year', 'Crop', 'Harvested Acres', 'Dry Yield (bu/ac)', 'Moisture %']];
for (const year of [2023, 2024, 2025]) {
  FIELDS.forEach((f, i) => {
    const crop = cropIn(f, year);
    if (!YIELD[crop]) return; // alfalfa is cut for hay, not in a bushel yield file
    const afterCorn = crop === 'corn' && cropIn(f, year - 1) === 'corn';
    const base = YIELD[crop][2025 - year] - (afterCorn ? 17 : 0);
    yieldRows.push([f.name, year, NAMES[crop], acres(f), Math.round((base + (i - 2.5) * 1.6) * 10) / 10, crop === 'corn' ? 16.8 + (i % 3) * 0.6 : 12.4 + (i % 2) * 0.5]);
  });
}
write('yield-2023-2025.csv', csv(yieldRows));

// ---- 2. 2025 yield map (shapefile points like a JD Operations Center export) ----
const mapFeatures = [];
for (const f of FIELDS.filter((x) => cropIn(x, 2025) === 'corn')) {
  const bbox = turf.bbox(poly(f));
  const grid = turf.pointGrid(bbox, 0.035, { units: 'kilometers', mask: poly(f) });
  for (const pt of grid.features) {
    const y = 211 + (rand() - 0.5) * 50;
    mapFeatures.push({ type: 'Feature', geometry: pt.geometry, properties: { Crop: 'CORN', Yld_Vol_Dr: Math.round(y * 10) / 10, Moisture: Math.round((17 + rand() * 3) * 10) / 10, Date: '2025-10-14' } });
  }
}
const yieldMap = await shpwrite.zip({ type: 'FeatureCollection', features: mapFeatures }, { outputType: 'nodebuffer', compression: 'DEFLATE', types: { point: 'Harvest_Yield_2025' } });
write('yield-map-2025.zip', yieldMap);

// ---- 3. QuickBooks transaction list for 2025 (expenses shown as positive amounts, as QuickBooks exports them) ----
const qb = [['Date', 'Transaction Type', 'Num', 'Name', 'Memo/Description', 'Account', 'Split', 'Amount']];
const add = (date, type, name, memo, account, amount) => qb.push([date, type, String(qb.length + 1000), name, memo, account, 'Farm Checking', amount.toFixed(2)]);
add('01/15/2025', 'Deposit', 'Heartland Co-op', '9,800 bu corn @ 4.31', 'Sales of Products Raised', 9800 * 4.31);
add('02/03/2025', 'Bill', 'Prairie Valley Cooperative', 'Seed corn and soybean seed', 'Seeds and Plants', 61280);
add('03/12/2025', 'Bill', 'Prairie Valley Cooperative', 'Anhydrous, potash, DAP', 'Fertilizers and Lime', 79340);
add('03/31/2025', 'Check', 'Smith Family Trust', '2025 cash rent, first half', 'Rent or Lease - Land', 92500);
add('04/22/2025', 'Bill', 'Prairie Valley Cooperative', 'Pre-emerge herbicide', 'Chemicals', 21460);
add('05/05/2025', 'Expense', "Casey's", 'Diesel, planting', 'Gasoline, Fuel, and Oil', 6240.55);
add('05/30/2025', 'Bill', 'Farm Bureau Financial', 'Crop insurance premium', 'Insurance (other than health)', 8420);
add('06/14/2025', 'Bill', 'Prairie Valley Cooperative', 'Post-emerge herbicide', 'Chemicals', 15990);
add('06/30/2025', 'Check', 'Payroll', 'Seasonal labor June', 'Labor Hired', 9100);
add('07/18/2025', 'Bill', 'Ziegler CAT', 'Combine repairs', 'Repairs and Maintenance', 7780.4);
add('08/01/2025', 'Deposit', 'USDA FSA', 'ARC-CO payment', 'Agricultural Program Payments', 4120);
add('09/30/2025', 'Check', 'Smith Family Trust', '2025 cash rent, second half', 'Rent or Lease - Land', 92500);
add('10/10/2025', 'Transfer', 'Farm Savings', 'Transfer to savings', 'Transfer', 20000);
add('10/24/2025', 'Expense', 'Heartland Co-op', 'Drying and hauling', 'Custom Hire (Machine Work)', 11870);
add('10/30/2025', 'Expense', "Casey's", 'Diesel, harvest', 'Gasoline, Fuel, and Oil', 9810.2);
add('11/12/2025', 'Deposit', 'Heartland Co-op', '42,500 bu corn @ 4.18', 'Sales of Products Raised', 42500 * 4.18);
add('11/20/2025', 'Deposit', 'ADM Des Moines', '21,300 bu soybeans @ 10.42', 'Sales of Products Raised', 21300 * 10.42);
add('12/15/2025', 'Check', 'Ames National Bank', 'Operating loan interest', 'Interest', 14260);
add('12/20/2025', 'Deposit', 'ADM Des Moines', '6,100 bu soybeans @ 10.55', 'Sales of Products Raised', 6100 * 10.55);
write('quickbooks-2025.csv', csv(qb));

// ---- 4. Stripe payments (direct sales: straw, hay, a few farm-gate sales) ----
const stripe = [['id', 'Created (UTC)', 'Amount', 'Amount Refunded', 'Currency', 'Fee', 'Description', 'Customer Email', 'Status']];
const sp = (id, date, amt, desc, email, status = 'Paid', refunded = 0) => stripe.push([id, `${date} 15:04:11`, amt.toFixed(2), refunded.toFixed(2), 'usd', (amt * 0.029 + 0.3).toFixed(2), desc, email, status]);
sp('ch_3Q1a', '2025-07-21', 1440, '180 small bales oat straw', 'buyer1@example.com');
sp('ch_3Q1b', '2025-08-02', 2600, 'Alfalfa hay, 20 large rounds', 'buyer2@example.com');
sp('ch_3Q1c', '2025-08-09', 650, 'Alfalfa hay, 5 large rounds', 'buyer3@example.com', 'Failed');
sp('ch_3Q1d', '2025-09-15', 980, 'Sweet corn, farm stand season', 'buyer4@example.com', 'Paid', 80);
write('stripe-payments-2025.csv', csv(stripe));

// ---- 5. supplier invoice (Excel, then the same invoice as a PDF, a scanned PDF and a photo) ----
const INVOICE = [
  ['Anhydrous Ammonia 82-0-0', 28.5, 'TON', 765.0],
  ['UAN 28% Solution', 3200, 'GAL', 1.62],
  ['DAP 18-46-0', 12, 'TON', 890.0],
  ['Potash 0-0-60', 15, 'TON', 520.0],
  ['Pioneer P1185Q Seed Corn 80K', 180, 'BAG', 315.0],
  ['Asgrow AG24XF4 Soybean Seed 140K', 210, 'UNIT', 62.5],
  ['Roundup PowerMAX 3', 50, 'GAL', 33.0],
  ['Atrazine 4L', 60, 'GAL', 9.5],
];
const lines = INVOICE.map(([p, q, u, pr]) => [p, q, u, pr, Math.round(q * pr * 100) / 100]);
const subtotal = lines.reduce((s, l) => s + l[4], 0);
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([
  ['Prairie Valley Cooperative'],
  ['Invoice 48213', '', 'Invoice Date', '2026-02-11'],
  [],
  ['Product', 'Quantity', 'Unit', 'Unit Price', 'Extended'],
  ...lines,
  [],
  ['Subtotal', '', '', '', subtotal],
]);
XLSX.utils.book_append_sheet(wb, ws, 'Invoice');
write('coop-invoice-2026.xlsx', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

const money = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const invoiceHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
 body{font-family:Helvetica,Arial,sans-serif;margin:40px;color:#111;font-size:13px;width:720px}
 h1{font-size:22px;margin:0} .meta{margin:6px 0 24px;color:#333}
 table{border-collapse:collapse;width:100%} th,td{padding:7px 6px;border-bottom:1px solid #ccc;text-align:left}
 th{background:#eee} td.n,th.n{text-align:right} .tot td{font-weight:bold;border:none}
</style></head><body>
<h1>Prairie Valley Cooperative</h1>
<div class="meta">1200 Elevator Rd, Nevada, IA 50201<br>Invoice 48213 &nbsp;&nbsp; Invoice Date: 02/11/2026</div>
<table><thead><tr><th>Product</th><th class="n">Quantity</th><th>Unit</th><th class="n">Unit Price</th><th class="n">Extended</th></tr></thead><tbody>
${lines.map((l) => `<tr><td>${l[0]}</td><td class="n">${l[1].toLocaleString('en-US')}</td><td>${l[2]}</td><td class="n">$${money(l[3])}</td><td class="n">$${money(l[4])}</td></tr>`).join('\n')}
</tbody></table>
<table><tr class="tot"><td>Subtotal</td><td class="n">$${money(subtotal)}</td></tr></table>
</body></html>`;

const { chromium } = require('@playwright/test');
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 820, height: 900 }, deviceScaleFactor: 2 });
await page.setContent(invoiceHtml);
write('coop-invoice-2026.pdf', await page.pdf({ format: 'Letter', printBackground: true }));
const png = await page.screenshot({ fullPage: true });
write('coop-invoice-2026-photo.png', png);
// A scan: the same invoice as an image only, with no text layer.
await page.setContent(`<!doctype html><html><body style="margin:0"><img src="data:image/png;base64,${png.toString('base64')}" style="width:100%"></body></html>`);
write('coop-invoice-2026-scan.pdf', await page.pdf({ format: 'Letter', printBackground: true }));
await browser.close();

// ---- 6. as-applied, planting and tillage summary (JD Operations Center "Field Operations" style) ----
const ops = [['Client', 'Farm', 'Field', 'Operation', 'Start Date', 'Crop', 'Product', 'Avg Rate', 'Rate Unit', 'Area (ac)']];
for (const f of FIELDS) {
  const c25 = cropIn(f, 2025);
  const a = acres(f);
  if (c25 === 'corn') {
    ops.push(['Demo Farms', 'Home', f.name, 'Tillage', '2024-11-02', '', 'Chisel Plow', '', '', a]);
    ops.push(['Demo Farms', 'Home', f.name, 'Application', '2025-04-08', 'Corn', 'Anhydrous Ammonia 82-0-0', 185, 'lb/ac', a]);
    ops.push(['Demo Farms', 'Home', f.name, 'Seeding', '2025-04-29', 'Corn', 'Pioneer P1185Q', 34.0, 'ksds/ac', a]);
    ops.push(['Demo Farms', 'Home', f.name, 'Application', '2025-06-10', 'Corn', 'UAN 28% Solution', 9, 'gal/ac', a]);
    ops.push(['Demo Farms', 'Home', f.name, 'Harvest', '2025-10-14', 'Corn', '', 211, 'bu/ac', a]);
  } else if (c25 === 'soybeans') {
    ops.push(['Demo Farms', 'Home', f.name, 'Seeding', '2025-05-09', 'Soybeans', 'Asgrow AG24XF4', 142000, 'seeds/ac', a]);
    ops.push(['Demo Farms', 'Home', f.name, 'Harvest', '2025-10-02', 'Soybeans', '', 62, 'bu/ac', a]);
  }
}
write('as-applied-2025.csv', csv(ops));

// ---- 7. ISOXML task data with binary time logs: anhydrous application, corn planting, corn harvest ----
const hex = (n, len) => n.toString(16).toUpperCase().padStart(len, '0');
const MG_PER_LB_AC = 1e6 / (4046.8564224 * 2.20462262); // mg/m² for 1 lb/ac
const PER_M2_PER_AC = 1 / 4046.8564224;
const cornFields = FIELDS.filter((x) => cropIn(x, 2025) === 'corn');
const pfd = cornFields
  .map((f, i) => `<PFD A="PFD${i + 1}" C="${f.name}" D="${Math.round(turf.area(poly(f)))}" E="CTR1" F="FRM1" G="CTP1"><PLN A="1" C="${f.name}"><LSG A="1">${f.ring.map(([x, y]) => `<PNT A="2" C="${y.toFixed(9)}" D="${x.toFixed(9)}"/>`).join('')}</LSG></PLN></PFD>`)
  .join('\n');
const tasks = [];
const files = {};
let tlgN = 0;
const days1980 = (d) => Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(1980, 0, 1)) / 86400000);
/** One TLG: header XML + binary records (time, position, then the logged DLVs). */
function timeLog(dateIso, f, ddis) {
  const name = `TLG${String(++tlgN).padStart(5, "0")}`;
  const dlv = ddis.map((d) => `<DLV A="${hex(d.ddi, 4)}" B="" C="DET1"/>`).join('');
  files[`TASKDATA/${name}.XML`] = `<?xml version="1.0" encoding="UTF-8"?>\n<TIM A="" D="4"><PTN A="" B="" D=""/>${dlv}</TIM>\n`;
  const grid = turf.pointGrid(turf.bbox(poly(f)), 0.05, { units: 'kilometers', mask: poly(f) }).features;
  const recSize = 4 + 2 + 4 + 4 + 1 + 1 + ddis.length * 5;
  const buf = Buffer.alloc(grid.length * recSize);
  const day = days1980(new Date(`${dateIso}T00:00:00Z`));
  let o = 0;
  grid.forEach((pt, k) => {
    const [lon, lat] = pt.geometry.coordinates;
    buf.writeUInt32LE(36000000 + k * 1000, o); o += 4; // ms since midnight (10:00 + k s)
    buf.writeUInt16LE(day, o); o += 2;
    buf.writeInt32LE(Math.round(lat * 1e7), o); o += 4;
    buf.writeInt32LE(Math.round(lon * 1e7), o); o += 4;
    buf.writeUInt8(1, o); o += 1; // GNSS fix
    buf.writeUInt8(ddis.length, o); o += 1;
    ddis.forEach((d, i) => {
      buf.writeUInt8(i, o); o += 1;
      buf.writeInt32LE(Math.round(d.value(k)), o); o += 4;
    });
  });
  files[`TASKDATA/${name}.BIN`] = buf;
  return name;
}
let tsk = 0;
for (const [i, f] of cornFields.entries()) {
  const pf = `PFD${i + 1}`;
  const nh3 = timeLog('2025-04-08', f, [{ ddi: 7, value: () => 185 * MG_PER_LB_AC * (0.97 + rand() * 0.06) }]);
  tasks.push(`<TSK A="TSK${++tsk}" B="Anhydrous ${f.name} 2025" C="CTR1" D="FRM1" E="${pf}" G="4"><PAN A="PDT1"/><TLG A="${nh3}" C="1"/></TSK>`);
  const plant = timeLog('2025-04-29', f, [{ ddi: 12, value: () => (34000 * PER_M2_PER_AC * (0.98 + rand() * 0.04)) / 0.001 }]);
  tasks.push(`<TSK A="TSK${++tsk}" B="Planting ${f.name} 2025" C="CTR1" D="FRM1" E="${pf}" G="4"><PAN A="PDT2"/><TLG A="${plant}" C="1"/></TSK>`);
  const harvest = timeLog('2025-10-14', f, [
    { ddi: 84, value: () => (205 + rand() * 14) * 56 * MG_PER_LB_AC },
    { ddi: 99, value: () => (17 + rand() * 3) * 10000 },
  ]);
  tasks.push(`<TSK A="TSK${++tsk}" B="Harvest ${f.name} 2025" C="CTR1" D="FRM1" E="${pf}" G="4"><TLG A="${harvest}" C="1"/></TSK>`);
}
files['TASKDATA/TASKDATA.XML'] = `<?xml version="1.0" encoding="UTF-8"?>
<ISO11783_TaskData VersionMajor="4" VersionMinor="2" ManagementSoftwareManufacturer="PlotTwist samples" ManagementSoftwareVersion="1" DataTransferOrigin="1">
<CTR A="CTR1" B="Demo Farms"/>
<FRM A="FRM1" B="Home" I="CTR1"/>
<CTP A="CTP1" B="Corn"/>
<PDT A="PDT1" B="Anhydrous Ammonia 82-0-0"/>
<PDT A="PDT2" B="Pioneer P1185Q Seed Corn"/>
<DVC A="DVC1" B="Demo implement" D="A00086000B200000" F="FF000000003132" G="FF000000006F6E"><DET A="DET1" B="1" C="1" D="Implement" E="0" F="0"/></DVC>
${pfd}
${tasks.join('\n')}
</ISO11783_TaskData>
`;
const tz = new JSZip();
for (const [n, d] of Object.entries(files)) tz.file(n, d);
write('TASKDATA-2025.zip', await tz.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('Done.');
