const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildNasaPowerUrl,
  buildOpenMeteoUrl,
  fetchNasaPowerDaily,
  getPowerDateWindow,
  normalizeNasaPowerPayload,
  normalizeOpenMeteoPayload
} = require('../data-providers.js');

const location = { latitude: 35.2271, longitude: -80.8431 };
const fixedNow = new Date('2026-11-11T12:00:00.000Z');

test('builds a bounded NASA POWER request for the approved daily parameters', () => {
  const window = getPowerDateWindow(fixedNow, 3);
  const url = new URL(buildNasaPowerUrl({ location, ...window }));
  assert.equal(url.searchParams.get('community'), 'AG');
  assert.equal(url.searchParams.get('parameters'), 'T2M_MAX,PRECTOTCORR,GWETTOP,GWETROOT');
  assert.equal(url.searchParams.get('latitude'), String(location.latitude));
  assert.equal(url.searchParams.get('longitude'), String(location.longitude));
  assert.equal(url.searchParams.get('start'), '20261108');
  assert.equal(url.searchParams.get('end'), '20261110');
  assert.equal(url.searchParams.get('time-standard'), 'UTC');
});

test('rejects invalid coordinates before making provider requests', () => {
  assert.throws(() => buildOpenMeteoUrl({ location: { latitude: 91, longitude: 0 } }), RangeError);
  assert.throws(() => buildNasaPowerUrl({ location: { latitude: 0, longitude: Number.NaN }, start: '20260101', end: '20260102' }), TypeError);
});

test('normalizes NASA observations, source metadata, missing fill values, and stale status', () => {
  const payload = {
    header: { fill_value: -999, sources: ['GEOSIT', 'POWER'], time_standard: 'UTC' },
    parameters: {
      T2M_MAX: { units: 'C' },
      PRECTOTCORR: { units: 'mm/day' },
      GWETTOP: { units: '1' },
      GWETROOT: { units: '1' }
    },
    properties: {
      parameter: {
        T2M_MAX: { 20261109: 21.4, 20261110: null },
        PRECTOTCORR: { 20261109: 1.1, 20261110: -999 },
        GWETTOP: { 20261109: 0.53 },
        GWETROOT: {}
      }
    }
  };
  const result = normalizeNasaPowerPayload(payload, {
    location,
    now: fixedNow,
    retrievedAt: fixedNow,
    window: { start: '20261012', end: '20261110' }
  });

  assert.equal(result.sourceModels.join(','), 'GEOSIT,POWER');
  assert.equal(result.observations[0].value, 21.4);
  assert.equal(result.observations[0].unit, 'C');
  assert.equal(result.observations[0].temporal.date, '2026-11-09');
  assert.equal(result.observations[0].quality.status, 'available');
  assert.equal(result.observations[1].value, 1.1);
  assert.equal(result.observations[1].temporal.date, '2026-11-09');
  assert.equal(result.observations[1].quality.status, 'available');
  assert.equal(result.observations[2].value, 0.53);
  assert.equal(result.observations[3].value, null);
  assert.equal(result.observations[3].quality.status, 'unavailable');
});

test('marks the latest valid NASA POWER value as stale when it exceeds ten days', () => {
  const payload = {
    header: { fill_value: -999, sources: ['MERRA2'] },
    parameters: { T2M_MAX: { units: 'C' }, PRECTOTCORR: { units: 'mm/day' }, GWETTOP: { units: '1' }, GWETROOT: { units: '1' } },
    properties: { parameter: {
      T2M_MAX: { 20261020: 20 },
      PRECTOTCORR: {},
      GWETTOP: {},
      GWETROOT: {}
    } }
  };
  const result = normalizeNasaPowerPayload(payload, { location, now: fixedNow, retrievedAt: fixedNow });
  assert.equal(result.observations[0].quality.status, 'stale');
  assert.ok(result.observations[0].quality.flags.some(flag => flag.includes('more than 10 days old')));
});

test('normalizes Open-Meteo forecasts and preserves forecast semantics and units', () => {
  const payload = {
    latitude: 35.2,
    longitude: -80.8,
    timezone: 'America/New_York',
    daily_units: { temperature_2m_max: '°C', precipitation_sum: 'mm' },
    daily: {
      time: ['2026-11-14', '2026-11-15'],
      temperature_2m_max: [11, null],
      precipitation_sum: [-1, 2.4]
    }
  };
  const result = normalizeOpenMeteoPayload(payload, { location, retrievedAt: fixedNow });
  assert.equal(result.forecasts.length, 4);
  assert.equal(result.forecasts[0].value, 11);
  assert.equal(result.forecasts[0].unit, '°C');
  assert.equal(result.forecasts[0].quality.status, 'forecast');
  assert.equal(result.forecasts[0].temporal.kind, 'daily_forecast');
  assert.equal(result.forecasts[1].value, null);
  assert.equal(result.forecasts[1].quality.status, 'unavailable');
  assert.equal(result.forecasts[2].value, null);
  assert.equal(result.forecasts[2].quality.status, 'unavailable');
  assert.equal(result.forecasts[3].value, 2.4);
  assert.equal(result.timezone, 'America/New_York');
});

test('surfaces provider HTTP failures instead of returning success-shaped data', async () => {
  await assert.rejects(
    fetchNasaPowerDaily({
      location,
      now: fixedNow,
      fetchImpl: async () => ({ ok: false, status: 429 })
    }),
    /NASA POWER request failed \(rate limit reached/
  );
});

test('rejects malformed provider payloads', () => {
  assert.throws(
    () => normalizeNasaPowerPayload({ properties: { parameter: {} }, parameters: {}, header: {} }, { location }),
    /missing parameter, unit, or source metadata/
  );
  assert.throws(
    () => normalizeOpenMeteoPayload({ daily: { time: [], temperature_2m_max: [] } }, { location }),
    /missing aligned daily forecast values or units/
  );
});

test('rejects NASA values with missing unit provenance', () => {
  const payload = {
    header: { fill_value: -999, sources: ['POWER'] },
    parameters: { T2M_MAX: { units: 'C' } },
    properties: { parameter: { T2M_MAX: { 20261110: 20 } } }
  };
  assert.throws(
    () => normalizeNasaPowerPayload(payload, { location }),
    /missing units for/
  );
});
