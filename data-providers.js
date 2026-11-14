(function attachFieldShiftData(root) {
  'use strict';

  const NASA_POWER_ENDPOINT = 'https://power.larc.nasa.gov/api/temporal/daily/point';
  const OPEN_METEO_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
  const OPEN_METEO_GEOCODING_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
  const NASA_POWER_DOCS = 'https://power.larc.nasa.gov/docs/services/api/temporal/daily/';
  const OPEN_METEO_DOCS = 'https://open-meteo.com/en/docs';
  const NASA_PARAMETERS = [
    {
      parameter: 'T2M_MAX',
      variable: 'daily_max_air_temperature',
      valid: value => value >= -90 && value <= 65
    },
    {
      parameter: 'PRECTOTCORR',
      variable: 'corrected_daily_precipitation',
      valid: value => value >= 0 && value <= 1000
    },
    {
      parameter: 'GWETTOP',
      variable: 'surface_soil_wetness',
      valid: value => value >= 0 && value <= 1
    },
    {
      parameter: 'GWETROOT',
      variable: 'root_zone_soil_wetness',
      valid: value => value >= 0 && value <= 1
    }
  ];
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  function toFiniteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function validateLocation(location) {
    if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
      throw new TypeError('A numeric latitude and longitude are required.');
    }
    if (location.latitude < -90 || location.latitude > 90) {
      throw new RangeError('Latitude must be between -90 and 90 degrees.');
    }
    if (location.longitude < -180 || location.longitude > 180) {
      throw new RangeError('Longitude must be between -180 and 180 degrees.');
    }
  }

  function locationType(location) {
    return typeof location.type === 'string' ? location.type : 'point';
  }

  function formatDate(date) {
    return date.toISOString().slice(0, 10).replaceAll('-', '');
  }

  function getPowerDateWindow(now = new Date(), days = 30) {
    if (!(now instanceof Date) || Number.isNaN(now.getTime()) || !Number.isInteger(days) || days < 2) {
      throw new TypeError('A valid date and a lookback window of at least two days are required.');
    }
    const end = new Date(now);
    end.setUTCHours(0, 0, 0, 0);
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days + 1);
    return { start: formatDate(start), end: formatDate(end) };
  }

  function buildNasaPowerUrl({ location, start, end }) {
    validateLocation(location);
    const query = new URLSearchParams({
      parameters: NASA_PARAMETERS.map(item => item.parameter).join(','),
      community: 'AG',
      longitude: String(location.longitude),
      latitude: String(location.latitude),
      start,
      end,
      format: 'JSON',
      'time-standard': 'UTC'
    });
    return `${NASA_POWER_ENDPOINT}?${query}`;
  }

  function buildOpenMeteoUrl({ location }) {
    validateLocation(location);
    const query = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      daily: 'temperature_2m_max,precipitation_sum',
      forecast_days: '7',
      timezone: 'auto'
    });
    return `${OPEN_METEO_ENDPOINT}?${query}`;
  }

  function buildGeocodingUrl({ query, count = 5 }) {
    const trimmedQuery = typeof query === 'string' ? query.trim() : '';
    if (trimmedQuery.length < 2) throw new TypeError('Enter at least two characters to search for a place.');
    if (!Number.isInteger(count) || count < 1 || count > 10) {
      throw new RangeError('Geocoding result count must be between 1 and 10.');
    }
    const params = new URLSearchParams({
      name: trimmedQuery,
      count: String(count),
      language: 'en',
      format: 'json'
    });
    return `${OPEN_METEO_GEOCODING_ENDPOINT}?${params}`;
  }

  async function requestJson(url, { provider, fetchImpl, signal, timeoutMs = 12000 } = {}) {
    const request = fetchImpl || root.fetch;
    if (typeof request !== 'function') throw new Error('Fetch is unavailable in this browser.');

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(signal.reason);
    if (signal?.aborted) controller.abort(signal.reason);
    else signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let response;
      try {
        response = await request(url, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: controller.signal
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        if (controller.signal.aborted) throw new Error(`${provider} request timed out after ${timeoutMs / 1000} seconds.`);
        throw new Error(`${provider} request failed: ${error.message}`, { cause: error });
      }

      if (!response.ok) {
        const detail = response.status === 429
          ? 'rate limit reached; wait before retrying'
          : `HTTP ${response.status}`;
        throw new Error(`${provider} request failed (${detail}).`);
      }
      try {
        return await response.json();
      } catch (error) {
        throw new Error(`${provider} returned invalid JSON.`, { cause: error });
      }
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  function normalizeNasaPowerPayload(payload, { location, retrievedAt = new Date(), now = new Date(), window } = {}) {
    const fillValue = toFiniteNumber(payload?.header?.fill_value);
    if (!payload?.properties?.parameter || !payload.parameters || !payload.header ||
        !Object.keys(payload.properties.parameter).length ||
        !Array.isArray(payload.header.sources) ||
        fillValue === null) {
      throw new TypeError('NASA POWER response is missing parameter, unit, or source metadata.');
    }

    const sourceModels = Array.isArray(payload.header.sources)
      ? payload.header.sources.filter(value => typeof value === 'string')
      : [];
    const sources = NASA_PARAMETERS.map(definition => {
      const dailyValues = payload.properties.parameter[definition.parameter];
      const units = payload.parameters[definition.parameter]?.units;
      if (typeof units !== 'string' || !units.trim()) {
        throw new TypeError(`NASA POWER response is missing units for ${definition.parameter}.`);
      }
      const entries = dailyValues && typeof dailyValues === 'object'
        ? Object.entries(dailyValues).sort(([left], [right]) => right.localeCompare(left))
        : [];
      const latest = entries.find(([, value]) => {
        const numericValue = toFiniteNumber(value);
        return numericValue !== null &&
          numericValue !== fillValue &&
          definition.valid(numericValue);
      });
      const observedDate = latest?.[0]
        ? `${latest[0].slice(0, 4)}-${latest[0].slice(4, 6)}-${latest[0].slice(6, 8)}`
        : null;
      const ageDays = observedDate
        ? Math.max(0, Math.floor((Date.parse(now.toISOString().slice(0, 10)) - Date.parse(observedDate)) / MS_PER_DAY))
        : null;
      const stale = ageDays !== null && ageDays > 10;
      const qualityFlags = [
        'Gridded/model-derived estimate; not a field sensor reading.',
        'The API response does not include per-observation uncertainty or pixel-level quality flags.'
      ];
      if (!latest) qualityFlags.push('No valid value was returned in the requested period.');
      if (stale) qualityFlags.push('Latest available value is more than 10 days old.');

      return {
        variable: definition.variable,
        value: latest ? toFiniteNumber(latest[1]) : null,
        unit: units,
        source: {
          provider: 'NASA POWER',
          product: 'Daily Point API · Agroclimatology (AG)',
          parameter: definition.parameter,
          modelSources: sourceModels,
          url: NASA_POWER_DOCS
        },
        temporal: {
          kind: 'daily_estimate',
          date: observedDate,
          requestedStart: window?.start,
          requestedEnd: window?.end,
          timeStandard: payload.header.time_standard || 'provider-reported'
        },
        location: {
          type: locationType(location),
          latitude: location.latitude,
          longitude: location.longitude
        },
        spatialResolution: {
          description: 'NASA POWER source-native gridded resolution; varies by parameter and source, and is not field scale.'
        },
        quality: {
          status: !latest ? 'unavailable' : stale ? 'stale' : 'available',
          ageDays,
          fillValue: Number.isFinite(fillValue) ? fillValue : null,
          flags: qualityFlags
        },
        retrievedAt: retrievedAt.toISOString()
      };
    });

    return {
      provider: 'NASA POWER',
      product: 'Daily Point API · Agroclimatology (AG)',
      sourceModels,
      requestLocation: {
        latitude: location.latitude,
        longitude: location.longitude,
        kind: locationType(location)
      },
      spatialResolution: 'Source-native global grid; varies by parameter/source and is not field scale.',
      retrievedAt: retrievedAt.toISOString(),
      observations: sources
    };
  }

  function normalizeOpenMeteoPayload(payload, { location, retrievedAt = new Date() } = {}) {
    const daily = payload?.daily;
    const units = payload?.daily_units;
    if (!Array.isArray(daily?.time) || !units || !Array.isArray(daily.temperature_2m_max) ||
        !Array.isArray(daily.precipitation_sum) ||
        daily.time.length !== daily.temperature_2m_max.length ||
        daily.time.length !== daily.precipitation_sum.length ||
        daily.time.some(date => typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) ||
        typeof units.temperature_2m_max !== 'string' ||
        typeof units.precipitation_sum !== 'string') {
      throw new TypeError('Open-Meteo response is missing aligned daily forecast values or units.');
    }

    const definitions = [
      { variable: 'daily_max_temperature_forecast', parameter: 'temperature_2m_max' },
      { variable: 'daily_precipitation_forecast', parameter: 'precipitation_sum' }
    ];
    const forecasts = definitions.flatMap(definition => daily.time.map((date, index) => {
      const rawValue = daily[definition.parameter][index];
      const numericValue = toFiniteNumber(rawValue);
      const value = numericValue !== null &&
        (definition.parameter !== 'precipitation_sum' || numericValue >= 0)
        ? numericValue
        : null;
      return {
        variable: definition.variable,
        value,
        unit: units[definition.parameter] || 'unit unavailable',
        source: {
          provider: 'Open-Meteo',
          product: 'Forecast API · automatically selected model',
          parameter: definition.parameter,
          modelSources: [],
          url: OPEN_METEO_DOCS
        },
        temporal: {
          kind: 'daily_forecast',
          date,
          timezone: payload.timezone || 'provider local time'
        },
        location: {
          type: locationType(location),
          latitude: payload.latitude ?? location.latitude,
          longitude: payload.longitude ?? location.longitude
        },
        spatialResolution: {
          description: 'Automatically selected forecast model; model resolution varies by region (about 1–55 km) and is not field scale.'
        },
        quality: {
          status: value === null ? 'unavailable' : 'forecast',
          flags: ['Forecast, not an observation.', 'The response does not identify the selected model.']
        },
        retrievedAt: retrievedAt.toISOString()
      };
    }));

    return {
      provider: 'Open-Meteo',
      product: 'Forecast API · automatically selected model',
      requestLocation: {
        latitude: location.latitude,
        longitude: location.longitude,
        kind: locationType(location)
      },
      spatialResolution: 'Automatically selected model; resolution varies by region (about 1–55 km).',
      retrievedAt: retrievedAt.toISOString(),
      timezone: payload.timezone || null,
      forecasts
    };
  }

  function normalizeGeocodingPayload(payload) {
    if (payload?.results === undefined) return [];
    if (!Array.isArray(payload.results)) {
      throw new TypeError('Open-Meteo geocoding response has an invalid results list.');
    }
    return payload.results
      .filter(result =>
        typeof result?.name === 'string' &&
        Number.isFinite(result.latitude) &&
        Number.isFinite(result.longitude) &&
        result.latitude >= -90 && result.latitude <= 90 &&
        result.longitude >= -180 && result.longitude <= 180
      )
      .map(result => ({
        name: result.name,
        admin1: typeof result.admin1 === 'string' ? result.admin1 : null,
        country: typeof result.country === 'string' ? result.country : null,
        countryCode: typeof result.country_code === 'string' ? result.country_code : null,
        latitude: result.latitude,
        longitude: result.longitude,
        timezone: typeof result.timezone === 'string' ? result.timezone : null,
        population: Number.isFinite(result.population) ? result.population : null
      }));
  }

  async function fetchNasaPowerDaily({ location, fetchImpl, signal, now = new Date(), retrievedAt = new Date() } = {}) {
    validateLocation(location);
    const window = getPowerDateWindow(now);
    const url = buildNasaPowerUrl({ location, ...window });
    const payload = await requestJson(url, { provider: 'NASA POWER', fetchImpl, signal });
    return normalizeNasaPowerPayload(payload, { location, retrievedAt, now, window });
  }

  async function fetchOpenMeteoForecast({ location, fetchImpl, signal, retrievedAt = new Date() } = {}) {
    validateLocation(location);
    const url = buildOpenMeteoUrl({ location });
    const payload = await requestJson(url, { provider: 'Open-Meteo', fetchImpl, signal });
    return normalizeOpenMeteoPayload(payload, { location, retrievedAt });
  }

  async function geocodeLocation({ query, count = 5, fetchImpl, signal } = {}) {
    const url = buildGeocodingUrl({ query, count });
    const payload = await requestJson(url, {
      provider: 'Open-Meteo Geocoding',
      fetchImpl,
      signal
    });
    return normalizeGeocodingPayload(payload);
  }

  const api = Object.freeze({
    buildNasaPowerUrl,
    buildOpenMeteoUrl,
    buildGeocodingUrl,
    fetchNasaPowerDaily,
    fetchOpenMeteoForecast,
    geocodeLocation,
    getPowerDateWindow,
    normalizeGeocodingPayload,
    normalizeNasaPowerPayload,
    normalizeOpenMeteoPayload
  });
  root.FieldShiftData = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
