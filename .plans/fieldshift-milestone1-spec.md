# FieldShift Milestone 1: Spec & Build Plan

> First execution step: copy this spec to
> `C:\Users\tkopp\OneDrive\Desktop\NASA-SpaceApps\nasa-spaceapps-2026\.plans\fieldshift-milestone1-spec.md`
> (the interview skill's save location). Plan mode only allowed writing here.

## Context
FieldShift (NASA Space Apps 2026, "Field Shift: Adapting Farms with NASA Data") already has a vanilla-JS prototype at the repo root (team PRs #11/#12). Milestone 1 is a new Next.js app that builds the real foundation: an app shell, a fully working **Fields** screen with real public-data field profiles, and an **Imports** tab where only Land boundaries works. Later milestones add the questionnaire, recommendations, planner, simulator and finance. The data model must keep three per-field layers separate: (1) shape + crop history, (2) the auto-fetched profile, (3) farmer management answers (later).

## Interview decisions (locked)
| Topic | Decision |
|---|---|
| Location | New subfolder `web/` in this repo. The prototype at the root stays untouched. |
| Git | Feature branch `milestone1/nextjs-fields`, logical commits, **no PR** |
| Deploy | Local dev only. Server-side disk cache is fine. |
| Field persistence | localStorage behind a repository interface (DB-swappable) |
| ZIP lookup | Bundled Census ZCTA centroid JSON (public domain), served by our API |
| Season | Current crop = **2026**. Prior seasons default 2025/2024/2023 (max 5). CDL 2025 is the latest available. |
| CDL method | Polygon zonal stats → dominant class + % share. Fallback: centroid point value. Fallback: manual entry, explained plainly. |
| Non-crop CDL | Show it flagged ("Grass/Pasture: Check this info") with a hint that the boundary may be off |
| Pin field | **Square**, 40 ac default (≈402 m side). Typed acreage resizes it. |
| POWER | Last 30 days (rain, mean Tmax/Tmin, GDD base 10 °C) + 1991–2020 normals for the same window. Raw daily series cached. |
| Elevation/slope | USGS EPQS 3×3 grid in the field → mean elevation (Measured) + plane-fit slope % (Estimated) |
| SSURGO | SDA polygon intersection → dominant map unit texture/drainage/HSG + area-weighted surface OM, with "% of field" |
| Refresh | Refetch on boundary change, per-source manual Refresh, and auto-refetch when stale (weather > 1 day; soil/elevation never stale) |
| Import flow | Bulk-create the picked shapes, background CDL + profile (throttled, 2 fields at a time), "Crops not confirmed" badge |
| Import attrs | Auto-pick name column (changeable dropdown in preview). Split MultiPolygons (option to keep as one). Ignore crop columns. Points → 40-ac square pins. Lines → "skipped: not a boundary". |
| Validation | Warn outside CONUS (CDL/SSURGO won't apply). Warn on overlap. Reject self-intersecting. Warn < 0.5 ac or > 5,000 ac. |
| Mobile | Full-screen map + draggable bottom sheet (peek/half/full). Desktop: side panel. |
| Imagery | Custom inline SVG motifs (wheat stalks, crop rows, contours). Sky blue + field green + wheat gold. |
| Crop list | Curated ~40 US crops + Fallow, Cover crop, Grass/Pasture, Other (free text). Double crops kept as one entry ("Winter wheat → Soybeans (double crop)"). Unmapped CDL classes keep their raw CDL name. |
| Earthdata stubs | No token: "Needs Earthdata token". With a token: validate it live, then "Token OK, integration coming in a later milestone". Never fake values. |
| Privacy | Auto-fetch on save, with a disclosure line on the profile card and a farm-level toggle to turn external lookups off |
| Labels | SSURGO = Estimated. EPQS elevation = Measured, slope = Estimated. POWER = Estimated. CDL = Check this info until the farmer confirms, then shown as "You entered/confirmed" (no label). Stubs: no values, no label. |
| Confirm UX | Per-row ✓ (editing a row confirms it) + a "These look right" confirm-all |
| Units | Acres only (store m², display 1 decimal) |
| Reuse | Port the prototype's POWER validity ranges and -999 fill handling, `fieldshift.svg` and the manifest, and the `docs/data-sources.md` provider-matrix style. No other prototype code. (The interview answer also ticked "clean slate"; read here as "no other reuse".) |
| Tests | Vitest (unit, mocked HTTP) + one Playwright smoke e2e (mocked sources) |

## Stack
Next.js 15 (App Router) + TypeScript (strict) + Tailwind v4. Map: `leaflet` + `@geoman-io/leaflet-geoman-free` (client-only via `dynamic(..., {ssr:false})`). Geometry: `@turf/turf`. Parsing: `@tmcw/togeojson`, `shpjs`. CDL raster: `geotiff` + `proj4` (EPSG:5070). Validation: `zod`. Tests: `vitest`, `@playwright/test`. npm.

## File layout (`web/`)
```
app/
  layout.tsx, page.tsx (redirect → /fields)
  (shell)/overview|rotation|planner|simulator|finance/page.tsx  → <ComingSoon/>
  (shell)/fields/page.tsx, (shell)/imports/page.tsx
  api/zip/[zip]/route.ts
  api/cdl/route.ts                 POST {geometry, years[]} → per-year detection
  api/profile/[source]/route.ts    POST {geometry} → SourceResult (one source per call)
components/  shell/ (TopNav, MobileTabBar), map/ (FieldMap, DrawControls, PinControl),
             fields/ (FieldList, FieldEditor, CropPicker, SeasonHistory, ProfileCard, SourceRow, HonestyBadge),
             imports/ (ImportCard, DropZone, BoundaryPreview), ui/, art/ (SVG motifs)
lib/
  domain/       types.ts, crops.ts (catalog + CDL code map), cropHistory.ts, acreage.ts, validation.ts
  repo/         FieldRepository.ts, ProfileRepository.ts, ManagementRepository.ts (interfaces)
                local/ (localStorage adapters, schemaVersion + migrations)
  sources/      types.ts (ProfileSource interface), registry.ts,
                power.ts, ssurgo.ts, elevation.ts, cdl.ts, earthdataStubs.ts (smap, imerg, ndvi)
  server/       cache.ts (disk cache in web/.cache, TTL per source), http.ts (timeout, UA, retry 1)
  import/       parseGeoJSON.ts, parseKML.ts, parseShapefile.ts, normalize.ts (split/points/name column)
  client/       profileOrchestrator.ts (parallel per-source fetch, staleness, throttle queue)
data/zcta.json (generated)   scripts/build-zcta.ts
tests/unit/** , tests/e2e/fields.spec.ts , tests/fixtures/** (recorded live responses)
docs/data-sources.md   .env.example (EARTHDATA_TOKEN=)   README.md
```

## Data model (three layers, all keyed by `fieldId`, stored separately)
```ts
// Layer 1: shape + crops (FieldRepository)
Field { id; name; createdAt; updatedAt; schemaVersion;
  feature: GeoJSON.Feature<Polygon|MultiPolygon>; areaM2; geometryHash;
  definedBy: 'polygon'|'pin'|'coordinates'|'zip-pin'|'import';
  pin?: { center:[lon,lat]; acres:number };
  importMeta?: { fileName; sourceFeatureIndex };
  crops: { current: SeasonCrop; history: SeasonCrop[] } }   // history sorted desc by year, 3–5 entries
SeasonCrop { year; crop: CropRef|null;
  origin: 'farmer'|'cdl'; status: 'confirmed'|'detected'|'empty';
  detection?: { cdlCode; cdlName; sharePct; method:'zonal'|'centroid'; fetchedAt } }
CropRef = { kind:'catalog'; id } | { kind:'double'; first; second } | { kind:'other'; text } | { kind:'cdl-raw'; code; name }

// Layer 2: auto profile (ProfileRepository), invalidated when geometryHash changes
FieldProfile { fieldId; geometryHash; sources: Record<SourceId, SourceResult> }
SourceResult { sourceId; sourceName; status:'loading'|'ok'|'unavailable'|'needs_token'|'not_built';
  fetchedAt?; message?; docsUrl; values: ProfileValue[] }
ProfileValue { key; label; value:number|string; unit?; honesty:'Measured'|'Estimated'|'Check this info'; note? }

// Layer 3: management answers (ManagementRepository), interface + empty adapter only in M1
ManagementAnswers { fieldId; schemaVersion; answers: Record<string, unknown>; updatedAt }
```
`ProfileSource` interface: `{ id; name; docsUrl; staleAfterMs|null; requiresEnv?: 'EARTHDATA_TOKEN'; fetch(ctx:{feature, centroid, bbox}, deps:{http, cache, now}): Promise<SourceResult> }`. The route wraps each call in try/catch and a timeout, so a failure becomes `unavailable` with a plain message and never throws past the module.

## Build steps
0. Branch, scaffold `web/`, copy the spec to `.plans/`.
1. **Live endpoint probe (before writing parsers).** Hit each endpoint for real and save the responses as fixtures: POWER daily + climatology point; SDA `post.rest` with WKT intersection query; EPQS `v1/json`; CropScape `GetCDLFile` (bbox in 5070 → GeoTIFF URL) and `GetCDLValue`; National Map imagery tile; Earthdata token check. Record which work; parsers follow the real shapes.
2. Domain + repos + unit tests (acreage, square pin sizing, crop history ordering/limits/confirm, validation).
3. Source modules + disk cache + API routes, tested against the recorded fixtures (mocked HTTP), including failure and malformed cases.
4. Shell + Fields UI (map with USGS imagery and OSM fallback on tile error, polygon/pin/coords/ZIP, list, editor, crop picker, season history, profile card, honesty badges, bottom sheet).
5. Imports tab (5 cards; Land boundaries: drop/pick → parse → preview map with checkboxes → bulk create). Stub cards: "Received, not yet processed" with file name and size, no analysis claims. Finance card lists Stripe/QuickBooks CSV exports, with no API connection and no key fields.
6. `docs/data-sources.md`, README, `.env.example`.
7. Playwright smoke + manual Chrome verification.

## Verification (must pass before reporting)
- `npm run test` (Vitest) and `npx playwright test` green; `npm run build` + `tsc --noEmit` clean.
- In Chrome against `npm run dev`: add a field by polygon; add one by ZIP + pin; enter current + prior crops and confirm CDL rows; watch the profile card show loading → ok/unavailable per source with labels and fetch dates; import a GeoJSON with 2+ features and see them become fields; reload and confirm everything persists. Also check the mobile width (bottom sheet).
- Final report: a table of each data source (POWER, SDA, EPQS, CDL zonal/centroid, ZCTA, imagery tiles, Earthdata) with *actually worked / failed / why*, from the live probe and browser run.
