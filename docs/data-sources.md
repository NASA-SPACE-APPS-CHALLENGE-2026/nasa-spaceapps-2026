# FieldShift data sources and observation contract

This prototype currently combines public weather/climate APIs with explicitly labeled demo data. Preset coordinates are approximate city points; farmers may also save user-entered points or a sketch centroid after explicit provider consent. All are coarse point queries, not field measurements or farm recommendations.

## Selected sources

| Provider/product | Variables used | Units and time basis | Spatial scale and quality limits | Access, attribution, and limits |
| --- | --- | --- | --- | --- |
| NASA POWER Daily Point API, Agroclimatology (`AG`) | `T2M_MAX` daily maximum 2 m air temperature; `PRECTOTCORR` corrected daily precipitation; `GWETTOP` modeled surface soil wetness; `GWETROOT` modeled root-zone soil wetness | Temperature: °C; precipitation: mm/day; wetness parameters: unitless model indices; daily UTC records | Global, source-native gridded products. Resolution/source can vary by parameter and date; POWER's API does not return a field-scale resolution or per-record uncertainty/QA in this response. Treat the point as a coarse regional estimate, not a field observation. Fill values are reported in `header.fill_value` (observed as `-999`). | No API key; the tested endpoint allows browser CORS (`Access-Control-Allow-Origin: *`). Cite NASA POWER and preserve the response's `header.sources`, parameter names, units, and date. Daily series extend from 1981 to near-real-time, with variable update lag. [Daily API docs](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) |
| Open-Meteo Forecast API | `temperature_2m_max`; `precipitation_sum` | °C and mm; daily forecast for the next seven days in the provider-selected local timezone | Automatically selected model varies by region; published model resolutions range about 1–55 km. The endpoint response used here does not identify the selected model. It is a forecast, not an observation or field-scale estimate. | No key for the free non-commercial API; browser CORS is enabled. Free use is limited to non-commercial purposes, subject to rate limits and CC BY 4.0 attribution. Reassess terms or subscribe before commercial use. [API docs](https://open-meteo.com/en/docs) · [terms](https://open-meteo.com/en/terms) |
| Open-Meteo Geocoding API | Place names and postal-code lookup to candidate coordinates | WGS84 latitude/longitude; place metadata from the provider | Search matches are candidates, not parcel boundaries or proof of a user's address. The farmer must choose a result or enter coordinates manually. | A place/postal query is sent to Open-Meteo when Search is submitted. The browser request omits credentials. Free non-commercial service and CC BY 4.0 attribution terms apply. [Geocoding API docs](https://open-meteo.com/en/docs/geocoding-api) · [terms](https://open-meteo.com/en/terms) |

### Requested signals not currently connected

- **Satellite vegetation / NDVI:** NASA POWER does not return NDVI. NASA LP DAAC's MODIS `MOD13Q1.061` product is a candidate (250 m, 16-day composite), but retrieving/aggregating it to a user polygon requires an authenticated Earthdata/AppEEARS workflow and pixel-quality/cloud masking. No credentials or field polygon are configured here, so the UI says it is unavailable rather than reusing the prototype's sample NDVI as a live value. [MOD13Q1 product page](https://lpdaac.usgs.gov/products/mod13q1v061/)
- **Erosion and insect/pest risk:** neither selected API directly measures these risks. Existing risk meters remain demo-only; do not derive live risk scores without reviewed agronomic methods and data.

## Normalized observation shape

`data-providers.js` returns observations with this contract:

```json
{
  "variable": "daily_max_air_temperature",
  "value": 22.2,
  "unit": "C",
  "source": {
    "provider": "NASA POWER",
    "product": "Daily Point API · Agroclimatology (AG)",
    "parameter": "T2M_MAX",
    "modelSources": ["GEOSIT", "POWER"],
    "url": "https://power.larc.nasa.gov/docs/services/api/temporal/daily/"
  },
  "temporal": {
    "kind": "daily_estimate",
    "date": "2026-11-10",
    "requestedStart": "2026-10-12",
    "requestedEnd": "2026-11-10",
    "timeStandard": "UTC"
  },
  "location": {
    "type": "approximate_city_point",
    "latitude": 35.2271,
    "longitude": -80.8431
  },
  "spatialResolution": {
    "description": "NASA POWER source-native gridded resolution; varies by parameter and source, and is not field scale."
  },
  "quality": {
    "status": "available",
    "ageDays": 1,
    "fillValue": -999,
    "flags": ["Gridded/model-derived estimate; not a field sensor reading."]
  },
  "retrievedAt": "2026-11-11T12:00:00.000Z"
}
```

Open-Meteo rows use `kind: "daily_forecast"`, retain their per-day date/timezone and units, and are explicitly marked `quality.status: "forecast"`. Missing/fill values have `value: null` and an `unavailable` status. NASA POWER values older than ten days are marked stale. Provider/network errors are surfaced to the UI; they are not converted into sample readings.

## Request and privacy behavior

- Selecting one of the four demo locations requests a 30-day NASA POWER history and a seven-day Open-Meteo forecast. A refresh button allows an explicit retry. Prior requests are aborted when the location changes, and successful results are cached in memory for 15 minutes to reduce repeated calls.
- The field editor accepts manual coordinates or place/postal-code matches and lets the farmer draw/edit a local polygon. Saved field records and sketch vertices are kept in browser `localStorage`; a GeoJSON export is user-triggered.
- The place/postal search query is sent to Open-Meteo Geocoding only when the user submits a search. A chosen location or saved boundary is not sent to NASA POWER/Open-Meteo unless the user checks the explicit provider-sharing consent and saves. When consent is given, only the point or calculated boundary centroid is requested; the drawn polygon itself is not transmitted.
- The two weather/climate endpoints need no secret and currently permit browser CORS, so a server-side credential proxy is not justified for this prototype. Requests omit credentials. Any future authenticated Earthdata or paid provider must be integrated server-side; never add a token to browser JavaScript.
- NASA POWER and Open-Meteo remain gridded model/weather estimates, not field observations. A boundary centroid request does not aggregate pixels over the polygon and does not make the coarse data field-scale.
- This repository has no production backend, persistent cache, authentication, or scheduled ingestion. Network failure leaves the rest of the dashboard labeled sample data and makes the public-data panel show the error/unavailable state.
