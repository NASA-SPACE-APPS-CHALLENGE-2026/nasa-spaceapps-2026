// Copies the browser assets PlotTwist serves itself, so reading PDFs and scans never calls a CDN:
//   public/pdfjs/pdf.worker.min.mjs           pdf.js worker
//   public/ocr/worker.min.js                  tesseract.js worker
//   public/ocr/tesseract-core-*.wasm.js       OCR engine builds (the worker picks one for the browser)
//   public/ocr/eng.traineddata.gz             English model
// Runs before dev, build and the e2e tests (see package.json). The copies are git-ignored.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const copies = [
  ['pdfjs-dist/build/pdf.worker.min.mjs', 'public/pdfjs/pdf.worker.min.mjs'],
  ['tesseract.js/dist/worker.min.js', 'public/ocr/worker.min.js'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'public/ocr/eng.traineddata.gz'],
  ...readdirSync(join(nm, 'tesseract.js-core'))
    .filter((f) => f.endsWith('.wasm.js'))
    .map((f) => [`tesseract.js-core/${f}`, `public/ocr/${f}`]),
];
let n = 0;
for (const [from, to] of copies) {
  const src = join(nm, from);
  const dest = join(root, to);
  if (!existsSync(src)) {
    console.error(`[copy-assets] missing ${from}; run npm install`);
    process.exit(1);
  }
  if (existsSync(dest) && statSync(dest).size === statSync(src).size) continue;
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  n++;
}
console.log(`[copy-assets] ${n ? `copied ${n} file(s)` : 'up to date'}`);
