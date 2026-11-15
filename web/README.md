# FieldShift web app (Milestone 1)

Crop-rotation planning for farmers, built for NASA Space Apps 2026 ("Field Shift: Adapting Farms with NASA Data"). This folder is the Next.js app; the original vanilla-JS prototype lives at the repository root.

Milestone 1 delivers:

- **App shell** with the tabs Overview, Fields, Rotation Explorer, Planner, Scenario Simulator, Finance and Imports. The app opens on Fields. Tabs other than Fields and Imports are routed "coming soon" pages.
- **Fields**: every field is traced on USGS satellite imagery (click the corners, Undo corner, Finish shape or click the first corner; live acreage while drawing). A ZIP code, a dropped pin or coordinates only move the map to the right place and start drawing; nothing is auto-generated. Rename, edit the boundary, redraw, delete. Fields saved by the first version as a pin with a 40-acre square are migrated to "Boundary not drawn" and shown as a pin until the farmer draws them. The farmer enters only the shape, this season's crop (2026) and earlier seasons (3 by default, up to 5). Earlier seasons are prefilled from the USDA Cropland Data Layer and marked "Check this info" until confirmed.
- **Automatic field profile**: weather and climate (NASA POWER), soil (USDA SSURGO), elevation and slope (USGS 3DEP), plus SMAP, IMERG and NDVI stubs that need an Earthdata token. Each source shows its own status, provider, fetch date, and an honesty label (Measured, Estimated, or Check this info) on every value.
- **Imports**: five upload cards. **Land boundaries** works: GeoJSON, KML, or a zipped shapefile, parsed in the browser, previewed on a map, and you pick which shapes become fields. The other four cards (machine data, supplier records, finance CSV, yield records) accept files and say plainly that they were received but not processed.

It runs with **zero API keys**.

## Run it

Requires Node.js 20 or newer.

```sh
cd web
npm install
npm run dev
```

Open http://localhost:3000. To try an import, use `samples/sample-farm.geojson` (fields near Ames, Iowa).

Optional: copy `.env.example` to `.env.local` and set `EARTHDATA_TOKEN` (a NASA Earthdata login token) for the SMAP, IMERG and NDVI sources, then restart `npm run dev`. Farmers only ever see "Not available yet" for these when the token is missing or rejected; the reason is printed once to the server console as a `[FieldShift]` warning.

## Test

```sh
npm test                 # 72 unit tests (Vitest): acreage, crop history, validation, file parsing, data sources, store
npx playwright install chromium   # once
npm run test:e2e         # end-to-end on desktop and phone viewports; reuses a running dev server on :3000
npm run typecheck
npm run lint
```

The data-source tests run against responses recorded from the real endpoints (`tests/fixtures/`), so they need no network. The end-to-end tests mock FieldShift's own `/api/profile/*` and `/api/cdl` routes and walk through: ZIP then draw, draw in place, crops, GeoJSON import, reload.

> Don't run `npm run build` while `npm run dev` is running: both write to `.next/` and the dev server will start returning errors. Stop the dev server first (or delete `.next/` and restart it).

## How it is put together

```
app/                    routes: /fields, /imports, five "coming soon" tabs, and API routes
  api/profile/[source]  runs one data source for a field boundary (server-side)
  api/cdl               detects past crops from the Cropland Data Layer
  api/zip/[zip]         ZIP → approximate centre (bundled Census data)
components/             map (Leaflet + Geoman), fields screen, imports cards, UI pieces
lib/domain/             types, crop catalogue + CDL mapping, acreage, crop history, validation
lib/sources/            one module per data source behind a common interface
lib/server/             fetch with timeouts, disk cache (.cache/), request validation
lib/repo/               repository interfaces + localStorage adapters
lib/client/             FarmStore: state + background lookups (2 fields at a time)
lib/import/             GeoJSON / KML / shapefile parsing and normalisation
```

### Data model: three separate layers per field

1. **Field** (`fieldshift.fields`, schema v2): the GeoJSON shape, whether it is a drawn boundary or a legacy approximate pin (`boundary`), how the farmer found it (`locatedVia`), acreage, and crops. Each season records its origin (farmer or CDL) and status (empty, detected, confirmed).
2. **FieldProfile** (`fieldshift.profiles`): the automatic profile, one result per source, tied to a geometry hash so a changed boundary invalidates it.
3. **ManagementAnswers** (`fieldshift.management`): reserved for the questionnaire in a later milestone.

Each layer has its own repository interface (`lib/repo/interfaces.ts`), with async methods, so a database can replace `localStorage` without changing callers. Stored data is versioned for future migrations, and unreadable data is set aside instead of being silently dropped.

### Data sources

See [`docs/data-sources.md`](docs/data-sources.md) for endpoints, labels, caching, and what worked when tested live.

## Design notes

The look is a light, cool field-and-sky palette (sky blue for actions, field green, wheat gold) in one typeface, Archivo, with semi-condensed headings. The signature element is the rotation strip on every field: one swatch per season, hatched while a detected crop is unconfirmed. On phones the map fills the screen and the panel becomes a draggable bottom sheet; all controls are at least 44 px tall.
