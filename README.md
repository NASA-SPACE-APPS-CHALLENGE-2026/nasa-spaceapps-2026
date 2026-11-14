# FieldShift dashboard prototype

A lightweight, responsive farm-dashboard visual prototype built with plain HTML, CSS, and JavaScript. It has Overview, Crop Rotation Explorer, Scenario Simulator, Fields, and Weather & soil screens, with working navigation and field-selection controls.

The Scenario Simulator accepts a ZIP code, crop, soil texture, crop stage, acreage, starting soil-moisture estimate, and a weather scenario. It returns a plain-language condition signal, field checks to consider, and a rough gross-rain volume estimate. Its first-digit ZIP mapping and all resulting values are illustrative placeholders; it does not look up an address, use live weather, or predict crop outcomes. Nothing is connected to farm devices, satellite services, or external APIs.

## Run locally

Open `index.html` in a browser, or serve this folder from a local web server:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.
