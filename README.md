# FieldShift — NASA Space Apps 2026

Repository for NASA Space Apps Hackathon 2026. FieldShift is a lightweight, responsive farm-dashboard visual prototype built with plain HTML, CSS, and JavaScript. It has Overview, Crop Rotation Explorer, Scenario Simulator, Fields, and Weather & soil screens, with working navigation and field-selection controls.

The Overview fetches public NASA POWER daily weather/soil-wetness estimates and an Open-Meteo seven-day forecast for approximate city-center demo points when a location profile is selected. These are coarse regional values, not field measurements. Satellite NDVI, erosion and pest risk, strategy scores, and the rest of the dashboard remain clearly labeled demo data; no AI service, farm sensor, or precise field boundary is connected. See [`docs/data-sources.md`](docs/data-sources.md) for the provider matrix, observation contract, quality handling, and privacy limitations.

The Scenario Simulator accepts a ZIP code, crop, soil texture, crop stage, acreage, starting soil-moisture estimate, and a weather scenario. Its first-digit ZIP mapping and resulting simulation values remain illustrative placeholders; it does not look up an address or predict crop outcomes.

## Run locally

Serve this folder over HTTP so the browser can request the public data APIs:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

Run the provider adapter tests with Node.js:

```sh
node --test tests/data-providers.test.js
```
