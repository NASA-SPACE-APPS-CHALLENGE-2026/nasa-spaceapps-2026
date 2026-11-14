const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildBoundaryGeoJSON,
  calculateRingAreaSquareMeters,
  calculateRingCentroid,
  readSavedLocations,
  validateCoordinate,
  viewPointToCoordinate,
  writeSavedLocations
} = require('../field-boundary.js');

const center = { latitude: 35.2271, longitude: -80.8431 };
const rectangle = [
  { x: 120, y: 60 },
  { x: 240, y: 60 },
  { x: 240, y: 160 },
  { x: 120, y: 160 }
];

test('converts sketch points into a closed WGS84 GeoJSON polygon with area and centroid', () => {
  const result = buildBoundaryGeoJSON(rectangle, center, 'North 40');
  assert.equal(result.geoJSON.type, 'Feature');
  assert.equal(result.geoJSON.geometry.type, 'Polygon');
  assert.equal(result.geoJSON.geometry.coordinates[0].length, 5);
  assert.deepEqual(
    result.geoJSON.geometry.coordinates[0][0],
    result.geoJSON.geometry.coordinates[0][4]
  );
  assert.ok(result.areaSquareMeters > 50_000 && result.areaSquareMeters < 60_000);
  assert.ok(result.geoJSON.properties.areaAcres > 4);
  assert.ok(Math.abs(result.centroid.latitude - center.latitude) < 0.00001);
  assert.ok(Math.abs(result.centroid.longitude - center.longitude) < 0.00001);
});

test('reports consistent area and centroid for a directly supplied ring', () => {
  const ring = [
    [-80.844, 35.227],
    [-80.843, 35.227],
    [-80.843, 35.228],
    [-80.844, 35.228],
    [-80.844, 35.227]
  ];
  assert.ok(calculateRingAreaSquareMeters(ring) > 9000);
  const centroid = calculateRingCentroid(ring);
  assert.ok(Math.abs(centroid.latitude - 35.2275) < 0.00001);
  assert.ok(Math.abs(centroid.longitude - -80.8435) < 0.00001);
});

test('rejects incomplete, repeated, out-of-bounds, and degenerate boundaries', () => {
  assert.throws(() => buildBoundaryGeoJSON(rectangle.slice(0, 2), center, 'North 40'), /at least three/);
  assert.throws(() => buildBoundaryGeoJSON([rectangle[0], rectangle[0], rectangle[1]], center, 'North 40'), /three different/);
  assert.throws(() => buildBoundaryGeoJSON([
    { x: 20, y: 100 }, { x: 180, y: 100 }, { x: 340, y: 100 }
  ], center, 'North 40'), /larger outline/);
  assert.throws(() => buildBoundaryGeoJSON([
    { x: -1, y: 30 }, { x: 200, y: 30 }, { x: 200, y: 180 }
  ], center, 'North 40'), /inside the drawing area/);
  assert.throws(() => buildBoundaryGeoJSON([
    { x: 40, y: 20 }, { x: 280, y: 170 }, { x: 40, y: 170 }, { x: 280, y: 20 }
  ], center, 'North 40'), /cannot cross or touch/);
  assert.throws(() => validateCoordinate(91, 0), RangeError);
  assert.throws(() => viewPointToCoordinate({ x: 360, y: 110 }, { latitude: 35, longitude: 180 }), RangeError);
});

test('maps east/north sketch movement to longitude/latitude', () => {
  const origin = viewPointToCoordinate({ x: 180, y: 110 }, center);
  const northeast = viewPointToCoordinate({ x: 240, y: 50 }, center);
  assert.deepEqual(origin, [center.longitude, center.latitude]);
  assert.ok(northeast[0] > origin[0]);
  assert.ok(northeast[1] > origin[1]);
  assert.deepEqual(validateCoordinate(90, 180), { latitude: 90, longitude: 180 });
  assert.throws(
    () => viewPointToCoordinate({ x: 180, y: 110 }, { latitude: 89.95, longitude: 0 }),
    /not supported this close to the poles/
  );
});

test('persists validated field locations in browser storage format', () => {
  let serialized = null;
  const storage = {
    getItem: () => serialized,
    setItem: (key, value) => {
      assert.equal(key, 'fieldshift.field-locations.v1');
      serialized = value;
    }
  };
  const records = {
    north: {
      label: 'Charlotte, North Carolina, United States',
      latitude: center.latitude,
      longitude: center.longitude,
      geoJSON: buildBoundaryGeoJSON(rectangle, center, 'North 40').geoJSON
    }
  };
  writeSavedLocations(storage, records);
  assert.deepEqual(readSavedLocations(storage), records);
});

test('reports corrupted and structurally invalid saved locations', () => {
  const storage = { getItem: () => '{not json' };
  assert.throws(() => readSavedLocations(storage), /could not be read/);
  assert.throws(
    () => readSavedLocations({ getItem: () => JSON.stringify({ north: { latitude: 91, longitude: 0 } }) }),
    /Latitude must be between/
  );
});
