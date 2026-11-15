// MapLibre GL v6 runs its tile work in a module web worker that the bundler cannot locate on its own.
// Copy the installed worker into public/ so /plot can point MapLibre at it (setWorkerUrl). Runs before dev and build.
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(root, 'node_modules', 'maplibre-gl', 'dist', 'maplibre-gl-worker.mjs');
const dir = path.join(root, 'public', 'vendor');
mkdirSync(dir, { recursive: true });
copyFileSync(from, path.join(dir, 'maplibre-gl-worker.mjs'));
console.log('Copied maplibre-gl-worker.mjs to public/vendor/');
