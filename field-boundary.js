(function attachFieldShiftFields(root) {
  'use strict';

  const STORAGE_KEY = 'fieldshift.field-locations.v1';
  const VIEW_WIDTH = 360;
  const VIEW_HEIGHT = 220;
  const DRAWING_SPAN_METERS = 600;
  const METERS_PER_DEGREE_LATITUDE = 111320;
  const MAX_VERTICES = 100;
  const MIN_AREA_SQUARE_METERS = 25;

  function validateCoordinate(latitude, longitude) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new TypeError('Enter numeric latitude and longitude coordinates.');
    }
    if (latitude < -90 || latitude > 90) throw new RangeError('Latitude must be between -90 and 90 degrees.');
    if (longitude < -180 || longitude > 180) throw new RangeError('Longitude must be between -180 and 180 degrees.');
    return { latitude, longitude };
  }

  function viewPointToCoordinate(point, center) {
    validateCoordinate(center.latitude, center.longitude);
    if (Math.abs(center.latitude) > 89.9) {
      throw new RangeError('Field sketching is not supported this close to the poles.');
    }
    const metersPerDegreeLongitude =
      METERS_PER_DEGREE_LATITUDE * Math.cos(center.latitude * Math.PI / 180);
    const eastMeters = (point.x - VIEW_WIDTH / 2) / VIEW_WIDTH * DRAWING_SPAN_METERS;
    const northMeters = (VIEW_HEIGHT / 2 - point.y) / VIEW_HEIGHT * DRAWING_SPAN_METERS;
    const coordinate = [
      center.longitude + eastMeters / metersPerDegreeLongitude,
      center.latitude + northMeters / METERS_PER_DEGREE_LATITUDE
    ];
    validateCoordinate(coordinate[1], coordinate[0]);
    return coordinate;
  }

  function projectRing(ring) {
    if (!Array.isArray(ring) || ring.length < 4) {
      throw new TypeError('A closed polygon with at least three vertices is required.');
    }
    const latitudes = ring.slice(0, -1).map(point => point[1]);
    const longitudes = ring.slice(0, -1).map(point => point[0]);
    const originLatitude = latitudes.reduce((sum, value) => sum + value, 0) / latitudes.length;
    const originLongitude = longitudes.reduce((sum, value) => sum + value, 0) / longitudes.length;
    const metersPerDegreeLongitude =
      METERS_PER_DEGREE_LATITUDE * Math.cos(originLatitude * Math.PI / 180);
    return ring.map(([longitude, latitude]) => [
      (longitude - originLongitude) * metersPerDegreeLongitude,
      (latitude - originLatitude) * METERS_PER_DEGREE_LATITUDE
    ]);
  }

  function calculateRingAreaSquareMeters(ring) {
    const projected = projectRing(ring);
    let twiceArea = 0;
    for (let index = 0; index < projected.length - 1; index += 1) {
      const [x1, y1] = projected[index];
      const [x2, y2] = projected[index + 1];
      twiceArea += x1 * y2 - x2 * y1;
    }
    return Math.abs(twiceArea) / 2;
  }

  function segmentsIntersect(a, b, c, d) {
    const cross = (origin, first, second) =>
      (first[0] - origin[0]) * (second[1] - origin[1]) -
      (first[1] - origin[1]) * (second[0] - origin[0]);
    const onSegment = (start, end, point) =>
      point[0] >= Math.min(start[0], end[0]) - 1e-8 &&
      point[0] <= Math.max(start[0], end[0]) + 1e-8 &&
      point[1] >= Math.min(start[1], end[1]) - 1e-8 &&
      point[1] <= Math.max(start[1], end[1]) + 1e-8;
    const abc = cross(a, b, c);
    const abd = cross(a, b, d);
    const cda = cross(c, d, a);
    const cdb = cross(c, d, b);
    if (((abc > 1e-8 && abd < -1e-8) || (abc < -1e-8 && abd > 1e-8)) &&
        ((cda > 1e-8 && cdb < -1e-8) || (cda < -1e-8 && cdb > 1e-8))) {
      return true;
    }
    return (Math.abs(abc) <= 1e-8 && onSegment(a, b, c)) ||
      (Math.abs(abd) <= 1e-8 && onSegment(a, b, d)) ||
      (Math.abs(cda) <= 1e-8 && onSegment(c, d, a)) ||
      (Math.abs(cdb) <= 1e-8 && onSegment(c, d, b));
  }

  function hasSelfIntersection(ring) {
    const projected = projectRing(ring);
    const segmentCount = projected.length - 1;
    for (let first = 0; first < segmentCount; first += 1) {
      for (let second = first + 1; second < segmentCount; second += 1) {
        if (second === first + 1 || (first === 0 && second === segmentCount - 1)) continue;
        if (segmentsIntersect(
          projected[first],
          projected[first + 1],
          projected[second],
          projected[second + 1]
        )) return true;
      }
    }
    return false;
  }

  function calculateRingCentroid(ring) {
    const projected = projectRing(ring);
    let twiceArea = 0;
    let xTotal = 0;
    let yTotal = 0;
    for (let index = 0; index < projected.length - 1; index += 1) {
      const [x1, y1] = projected[index];
      const [x2, y2] = projected[index + 1];
      const cross = x1 * y2 - x2 * y1;
      twiceArea += cross;
      xTotal += (x1 + x2) * cross;
      yTotal += (y1 + y2) * cross;
    }
    if (Math.abs(twiceArea) < 1e-8) throw new RangeError('The boundary has no measurable area.');

    const longitudes = ring.slice(0, -1).map(point => point[0]);
    const latitudes = ring.slice(0, -1).map(point => point[1]);
    const originLatitude = latitudes.reduce((sum, value) => sum + value, 0) / latitudes.length;
    const originLongitude = longitudes.reduce((sum, value) => sum + value, 0) / longitudes.length;
    const centroidX = xTotal / (3 * twiceArea);
    const centroidY = yTotal / (3 * twiceArea);
    return validateCoordinate(
      originLatitude + centroidY / METERS_PER_DEGREE_LATITUDE,
      originLongitude + centroidX / (METERS_PER_DEGREE_LATITUDE * Math.cos(originLatitude * Math.PI / 180))
    );
  }

  function buildBoundaryGeoJSON(points, center, fieldName) {
    validateCoordinate(center.latitude, center.longitude);
    if (!Array.isArray(points) || points.length < 3) {
      throw new TypeError('Add at least three boundary points before saving an outline.');
    }
    if (points.length > MAX_VERTICES) {
      throw new RangeError(`A boundary can contain at most ${MAX_VERTICES} points.`);
    }
    const unique = new Set(points.map(point => {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
          point.x < 0 || point.x > VIEW_WIDTH || point.y < 0 || point.y > VIEW_HEIGHT) {
        throw new RangeError('Boundary points must stay inside the drawing area.');
      }
      return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    }));
    if (unique.size < 3) throw new RangeError('Choose at least three different boundary points.');
    const coordinates = points.map(point => {
      return viewPointToCoordinate(point, center);
    });
    coordinates.push(coordinates[0]);
    if (hasSelfIntersection(coordinates)) {
      throw new RangeError('Boundary lines cannot cross or touch themselves. Rearrange the points to make one outline.');
    }
    const areaSquareMeters = calculateRingAreaSquareMeters(coordinates);
    if (areaSquareMeters < MIN_AREA_SQUARE_METERS) {
      throw new RangeError('Draw a larger outline so its area can be estimated reliably.');
    }

    const polygon = {
      type: 'Feature',
      properties: {
        name: fieldName,
        areaSquareMeters,
        areaHectares: areaSquareMeters / 10000,
        areaAcres: areaSquareMeters / 4046.8564224,
        outlineSource: 'user_sketch_approximate'
      },
      geometry: {
        type: 'Polygon',
        coordinates: [coordinates]
      }
    };
    return { geoJSON: polygon, areaSquareMeters, centroid: calculateRingCentroid(coordinates) };
  }

  function readSavedLocations(storage) {
    const serialized = storage.getItem(STORAGE_KEY);
    if (!serialized) return {};
    let records;
    try {
      records = JSON.parse(serialized);
    } catch (error) {
      throw new SyntaxError('Saved field locations could not be read. Clear the damaged local data and try again.', { cause: error });
    }
    if (!records || typeof records !== 'object' || Array.isArray(records)) {
      throw new TypeError('Saved field locations have an invalid format.');
    }
    for (const [key, record] of Object.entries(records)) {
      if (!record || typeof record !== 'object' ||
          !Number.isFinite(record.latitude) || !Number.isFinite(record.longitude)) {
        throw new TypeError(`Saved location for ${key} is invalid.`);
      }
      validateCoordinate(record.latitude, record.longitude);
      if (record.geoJSON &&
          (record.geoJSON.type !== 'Feature' || record.geoJSON.geometry?.type !== 'Polygon')) {
        throw new TypeError(`Saved boundary for ${key} is invalid.`);
      }
    }
    return records;
  }

  function writeSavedLocations(storage, records) {
    storage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  const api = Object.freeze({
    buildBoundaryGeoJSON,
    calculateRingAreaSquareMeters,
    calculateRingCentroid,
    readSavedLocations,
    validateCoordinate,
    viewPointToCoordinate,
    writeSavedLocations
  });
  root.FieldShiftFields = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
