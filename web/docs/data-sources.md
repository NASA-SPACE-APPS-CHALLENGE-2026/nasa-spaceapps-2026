# PlotTwist data sources (Milestone 1)

PlotTwist asks the farmer only for a field's shape and its crop history. Everything else in the **field profile** is fetched automatically, server-side, from public services that need no API key. Each source is a separate module in `lib/sources/` behind one interface (`ProfileSource.run`), runs in its own API request (`POST /api/profile/<source>`), and turns every failure into an `unavailable` result with a plain-language message. One source going down never affects the others.

## Provider matrix

| Source (module) | Provider and endpoint | What PlotTwist shows | Honesty label | Cache | Live test (2026-11-14) |
|---|---|---|---|---|---|
| Weather & climate (`power.ts`) | NASA POWER daily point API `power.larc.nasa.gov/api/temporal/daily/point` (T2M_MAX, T2M_MIN, PRECTOTCORR, community AG) and climatology point API (T2M, PRECTOTCORR, 1991–2020) | Rain over the latest 30 complete days vs the 1991–2020 normal for the same dates; average daily high and low; temperature vs normal; growing degree days (°F, base 50, 86 cap) | **Estimated**: MERRA-2/GPM-based model grid (~0.5° × 0.625°), not a gauge on the field | Daily: 6 h. Climatology: 30 days | Works, ~1 s. Latest day is a `-999` fill value (POWER lags a few days); it is dropped. Climatology `T2M_MAX` returns the *extreme* maximum, not the mean daily high, so normals use `T2M`. |
| Soil (`ssurgo.ts`) | USDA NRCS Soil Data Access `sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest` (SQL with SDA spatial macros) | Main soil map unit and its share of the field; surface texture; area-weighted surface organic matter; drainage class; hydrologic soil group | **Estimated**: survey map units with representative values, not a soil test of this field | 30 days | Works, 0.2–1.7 s. Empty result is `{}`; errors are HTTP 400 with an XML `ServiceException` body. |
| Elevation & slope (`elevation.ts`) | USGS Elevation Point Query Service `epqs.nationalmap.gov/v1/json` (3DEP) | Average elevation and height difference over up to 9 points inside the field; average slope from a least-squares plane | Elevation **Measured** (3DEP DEM, mostly lidar, 1 m where available). Slope **Estimated** (derived from a few points) | 1 year per point | Works but flaky: 0.2–17 s per point, instant HTTP 500s and 29 s HTTP 504 timeouts even for sequential calls. Requests run 3 at a time; fast 5xx errors are retried twice; the card says how many points could not be read. |
| Crop history (`cdl.ts`, via `POST /api/cdl`) | USDA NASS Cropland Data Layer via CropScape `nassgeodata.gmu.edu/axis2/services/CDLService` | Prefills prior seasons (2008–2025) with the dominant CDL class and its share | **Check this info** until the farmer confirms it | 30 days | `GetCDLValue` (point, EPSG:5070 x/y) works, 3–7 s. `GetCDLStat` and `GetCDLFile` (area queries) **timed out after 90–110 s**. PlotTwist tries the area clip first (20 s timeout, then a 10-minute circuit breaker) and falls back to sampling up to 5 points inside the field. A year is prefilled only when one class covers at least half the samples; otherwise it stays empty and the card says the maps show a mix. |
| Soil moisture (`earthdataStubs.ts`) | NASA SMAP (Earthdata) | Nothing yet | — | — | Stub. Without `EARTHDATA_TOKEN`: "Needs an Earthdata token". With one: the token is checked against NASA CMR (bad token = HTTP 401 "Token does not exist"), then "coming in a later milestone". |
| Satellite rainfall (`earthdataStubs.ts`) | NASA GPM IMERG (Earthdata) | Nothing yet | — | — | Stub, same as SMAP. |
| Crop greenness, NDVI (`earthdataStubs.ts`) | Landsat / MODIS (Earthdata) | Nothing yet | — | — | Stub, same as SMAP. |
| ZIP code lookup (`lib/server/zip.ts`) | US Census Bureau 2024 Gazetteer ZCTA internal points (bundled in `data/zcta.json`, public domain) | Centres the map on the ZIP area. A ZIP is only an area, so the farmer then pins or draws the field. | — | Bundled | Works offline. PO-box-only ZIPs have no ZCTA and get a clear "not found" message. Rebuild with `node scripts/build-zcta.mjs <gazetteer .txt>`. |
| Address search (`lib/server/geocode.ts`, `POST /api/geocode`) | US Census Bureau one-line address geocoder `geocoding.geo.census.gov/geocoder/locations/onelineaddress` (benchmark Public_AR_Current) | Moves the map to an address (Add a field, and the map search box). Up to 5 matches as a pick list. | — | 30 days | Works, ~1 s. No match is `addressMatches: []`; addresses over 100 characters get HTTP 400. Sent only after the farmer presses Find (no type-ahead), only when public data lookups are on, and in a POST body so it never appears in URLs. |
| Satellite imagery | USGS The National Map `basemap.nationalmap.gov/.../USGSImageryOnly/MapServer/tile` | Map background | — | Browser | Works. If the first tiles fail, the map switches to OpenStreetMap tiles and says so. |

## Honesty labels

Every profile value and every auto-detected crop carries exactly one label, assigned by what the source really is:

- **Measured**: a direct observation of this place (USGS 3DEP elevation).
- **Estimated**: modelled, derived, or an average over a larger area (NASA POWER, SSURGO map units, slope).
- **Check this info**: not verified; the farmer should confirm it (CDL-detected crops). Once confirmed or edited, the row shows "You confirmed" / "You entered this" instead.

## Privacy

Field boundaries are stored only in the browser (`localStorage`). To build a profile, the server sends the field's location (a point inside the field, sample points, or the boundary for the soil query) to NASA, USDA and USGS. A setting on the Fields screen ("Look up public data for my fields") turns all external lookups off.

## Caching

Responses are cached server-side in `web/.cache/` (JSON files keyed by request), with per-source time-to-live. Failed requests are never cached. In the browser, each source's result is stored with its fetch date; weather refreshes after a day, NDVI after a week, and soil and elevation never go stale. A changed boundary refetches everything. Each source has a Refresh / Try again button.

## Tests

`tests/unit/sources.test.ts` runs every module against responses recorded from the live endpoints on 2026-11-14 (`tests/fixtures/`), plus failure cases: HTTP errors, malformed bodies, empty results, partial point failures, the CDL fallback and circuit breaker, and Earthdata tokens that are missing, valid or rejected.
