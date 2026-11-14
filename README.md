# FieldShift — NASA Space Apps 2026

Repository for NASA Space Apps Hackathon 2026. FieldShift is a lightweight, responsive farm-dashboard visual prototype built with plain HTML, CSS, and JavaScript. It has Overview, Crop Rotation Explorer, Scenario Simulator, Fields, and Weather & soil screens, with working navigation and field-selection controls.

The Overview opens in **Farmer** mode (plain-language risk meters and notes). The **Agronomist / Research** toggle shows the same sample values in a technical table with unit, source, date, resolution, and quality columns; metadata the fixtures don't supply reads “Not provided”. A **Verify on ground** panel shows only the confidence and coverage fields the sample profile supplies and reminds users to check the field before acting.

The Fields screen supports manual coordinates or place/postal-code search, an editable approximate polygon sketch, local browser storage, and GeoJSON export. Public data requests for a saved point or boundary centroid happen only after the user opts in; the polygon itself stays local. NASA POWER daily weather/soil-wetness estimates and an Open-Meteo seven-day forecast are coarse model outputs, not field measurements. Satellite NDVI, erosion and pest risk, strategy scores, and the rest of the dashboard remain clearly labeled demo data. See [`docs/data-sources.md`](docs/data-sources.md) for the provider matrix, observation contract, quality handling, and privacy limitations.

The Overview compares three strategies (environmental impact, farm economics, and insect/pest control) on the same five aspects: yield, water/heat, soil health, insect and pest control, and feasibility. A deterministic placeholder rubric produces these sample scores. They are not forecasts. See [`docs/strategy-rubric.md`](docs/strategy-rubric.md) for the inputs, weights, unknown-data handling, and the open questions for agronomist review.

The Scenario Simulator accepts a ZIP code, crop, soil texture, crop stage, acreage, starting soil-moisture estimate, and a weather scenario. Its first-digit ZIP mapping and resulting simulation values remain illustrative placeholders; it does not look up an address or predict crop outcomes.

## Run locally

Serve this folder over HTTP so the browser can request the public data APIs:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

Run the provider, field-boundary, and strategy-scoring tests with Node.js:

```sh
node --test tests/*.test.js
```
