# PlotTwist web app (Milestones 1–2)

Crop-rotation planning for farmers, built for NASA Space Apps 2026 ("Field Shift: Adapting Farms with NASA Data"). This folder is the Next.js app; the original vanilla-JS prototype lives at the repository root.

Milestone 2 adds:

- **Rotation Explorer** (`/rotation`):
  - A short questionnaire per field (tillage, irrigation, cover-crop experience, livestock, small-grain equipment and market, known problems, harvest month), plus an optional soil test.
  - Three strategies: keep your rotation, add a cover crop, or bring in small grains. Each is scored on four bars (soil cover, crop diversity, pests and diseases, climate fit), with one marked as the best fit. Every reason cites its source.
  - Each strategy has a detail page (`/rotation/keep|cover|small-grains`) with a season-by-season preview, every reason, the field data used, ground checks and ranked cover-crop suggestions.
  - The rules are in [`docs/rotation-rubric.md`](docs/rotation-rubric.md).
- **Planner** (`/planner`): "Make this my plan" turns a strategy into an editable schedule.
  - On desktop it is a season × month grid; on phones, a list per season.
  - You can change crops and covers, and add, move or delete tasks, rename, add or remove years, and delete plans.
- **Navigation:**
  - An **Explore rotation** button on every field, and **Open plan** when a plan exists.
  - Rotation Explorer and Planner reopen the last field you worked on.
  - The logo goes to Overview.
  - The remaining placeholder tabs point to what works today.

Milestone 1 delivered:

- **App shell** with the tabs Overview, Fields, Rotation Explorer, Planner, Scenario Simulator, Finance and Imports. The app opens on Fields. Overview, Scenario Simulator and Finance are still placeholder pages.
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

Optional: copy `.env.example` to `.env.local` and set `EARTHDATA_TOKEN` (a NASA Earthdata login token) for the SMAP, IMERG and NDVI sources, then restart `npm run dev`. Farmers only ever see "Not available yet" for these when the token is missing or rejected; the reason is printed once to the server console as a `[PlotTwist]` warning.

## Test

```sh
npm test                 # 118 unit tests (Vitest): acreage, crop history, validation, file parsing, data sources, store, rotation rubric, cover crops, plans
npx playwright install chromium   # once
npm run test:e2e         # end-to-end on desktop and phone viewports; reuses a running dev server on :3000
PW_CHANNEL=chrome npm run test:e2e   # same, on your installed Google Chrome instead of Playwright's Chromium
npm run typecheck
npm run lint
```

The data-source tests run against responses recorded from the real endpoints (`tests/fixtures/`), so they need no network. The end-to-end tests mock PlotTwist's own `/api/profile/*` and `/api/cdl` routes. They walk through two flows:

- ZIP then draw, draw in place, crops, GeoJSON import, reload (`fields.spec.ts`).
- Explore rotation, the questionnaire with a soil test, three scored strategies, a strategy page with cover crops, make a plan, move a task, reload, the logo and the last-field memory (`rotation.spec.ts`).

> Don't run `npm run build` while `npm run dev` is running: both write to `.next/` and the dev server will start returning errors. Stop the dev server first (or delete `.next/` and restart it).

## How it is put together

```
app/                    routes: /fields, /imports, /rotation (+ /rotation/[strategy]), /planner, three placeholder tabs, and API routes
  api/profile/[source]  runs one data source for a field boundary (server-side)
  api/cdl               detects past crops from the Cropland Data Layer
  api/zip/[zip]         ZIP → approximate centre (bundled Census data)
components/             map (Leaflet + Geoman), fields screen, imports cards, UI pieces
lib/domain/             types, crop catalogue + CDL mapping, acreage, crop history, validation
lib/sources/            one module per data source behind a common interface
lib/server/             fetch with timeouts, disk cache (.cache/), request validation
lib/repo/               repository interfaces + localStorage adapters
lib/client/             FarmStore: state + background lookups (2 fields at a time); useActiveField, useRotation
lib/domain/rotation/    Rotation Explorer: inputs, strategies, cover crops, the scoring rubric, citations
lib/domain/plan.ts      Planner: plan from a strategy, pure edit functions
lib/import/             GeoJSON / KML / shapefile parsing and normalisation
```

### Data model: three separate layers per field

1. **Field** (`fieldshift.fields`, schema v2): the GeoJSON shape, whether it is a drawn boundary or a legacy approximate pin (`boundary`), how the farmer found it (`locatedVia`), acreage, and crops. Each season records its origin (farmer or CDL) and status (empty, detected, confirmed).
2. **FieldProfile** (`fieldshift.profiles`): the automatic profile, one result per source, tied to a geometry hash so a changed boundary invalidates it.
3. **ManagementAnswers** (`fieldshift.management`): the Rotation Explorer questionnaire answers and the optional soil test. They are validated with zod (`lib/domain/management.ts`), and unreadable keys are dropped one by one.
4. **Plans** (`fieldshift.plans`): Planner schedules, several per field, each made from a strategy. They are deleted with their field.

The last field you worked on is kept in the farm settings (`lastFieldId`).

Each layer has its own repository interface (`lib/repo/interfaces.ts`), with async methods, so a database can replace `localStorage` without changing callers. Stored data is versioned for future migrations, and unreadable data is set aside instead of being silently dropped.

### Data sources

See [`docs/data-sources.md`](docs/data-sources.md) for endpoints, labels, caching, and what worked when tested live.

## Design notes

The look is a light, cool field-and-sky palette (sky blue for actions, field green, wheat gold) in one typeface, Archivo, with semi-condensed headings. The signature element is the rotation strip on every field: one swatch per season, hatched while a detected crop is unconfirmed. On phones the map fills the screen and the panel becomes a draggable bottom sheet; all controls are at least 44 px tall.
