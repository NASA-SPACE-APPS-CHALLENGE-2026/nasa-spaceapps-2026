const fieldData = {
  north: { name: 'North 40', acres: 40, moisture: 32, soil: 'loam', crop: 'corn', rain: '0.8', rainDays: [0.1, 0, 0.2, 0.4, 0.1, 0, 0], ndvi: '0.71', rotation: ['Corn', 'Soybeans', 'Oats'] },
  creek: { name: 'Creekside', acres: 28, moisture: 41, soil: 'clay', crop: 'soybeans', rain: '1.1', rainDays: [0.2, 0.1, 0.2, 0.4, 0.2, 0, 0], ndvi: '0.76', rotation: ['Soybeans', 'Oats', 'Corn'] },
  west: { name: 'West Meadow', acres: 64, moisture: 27, soil: 'sandy', crop: 'small-grains', rain: '0.6', rainDays: [0, 0, 0.1, 0.3, 0.1, 0.1, 0], ndvi: '0.64', rotation: ['Oats', 'Corn', 'Soybeans'] }
};

const locationProfiles = {
  charlotte: { name: 'Charlotte, NC', latitude: 35.2271, longitude: -80.8431, moisture: 65, erosion: 42, heat: 62, pest: 84, coverage: 88 },
  nigeria: { name: 'Kano, Nigeria', latitude: 12.0022, longitude: 8.5919, moisture: 34, erosion: 63, heat: 82, pest: 58, coverage: 76 },
  india: { name: 'Pune, India', latitude: 18.5204, longitude: 73.8567, moisture: 51, erosion: 54, heat: 73, pest: 67, coverage: 81 },
  netherlands: { name: 'Wageningen, Netherlands', latitude: 51.9851, longitude: 5.8987, moisture: 74, erosion: 33, heat: 36, pest: 48, coverage: 92 }
};

const regionalProfiles = {
  0: { name: 'New England', rain: 1, high: 65 },
  1: { name: 'Northeast', rain: 0.9, high: 67 },
  2: { name: 'Mid-Atlantic', rain: 1, high: 70 },
  3: { name: 'Southeast', rain: 1.3, high: 79 },
  4: { name: 'Great Lakes', rain: 0.9, high: 69 },
  5: { name: 'Upper Midwest', rain: 0.8, high: 72 },
  6: { name: 'Central Plains', rain: 0.75, high: 77 },
  7: { name: 'South Central', rain: 0.65, high: 82 },
  8: { name: 'Mountain West', rain: 0.45, high: 72 },
  9: { name: 'Pacific West', rain: 0.55, high: 73 }
};

const situations = {
  typical: {
    name: 'Typical week',
    days: 7,
    rainFactor: 1,
    moistureChange: 0,
    temperatureChange: 0,
    vegetationChange: 0,
    title: 'A typical week',
    copy: 'This is a simple starting point for thinking about your field—not a prediction of what will happen.'
  },
  dry: {
    name: 'Two-week dry spell',
    days: 14,
    rainFactor: 0.1,
    moistureChange: -12,
    temperatureChange: 5,
    vegetationChange: -0.04,
    title: 'A dry spell could call for a closer look.',
    copy: 'In this example, less rain and warmer days lower the surface-moisture clue. A field check can help you decide whether young crops need attention.'
  },
  rain: {
    name: 'Heavy rain',
    days: 2,
    rainFactor: 2.4,
    moistureChange: 12,
    temperatureChange: -2,
    vegetationChange: -0.01,
    title: 'Heavy rain may leave some areas too wet.',
    copy: 'This example adds a short burst of rain. Low spots may stay wet longer, so checking field conditions before driving or working the soil can help prevent compaction.'
  },
  heat: {
    name: 'One-week heat wave',
    days: 7,
    rainFactor: 0.35,
    moistureChange: -9,
    temperatureChange: 12,
    vegetationChange: -0.06,
    title: 'Hot days can increase crop water demand.',
    copy: 'This example combines higher temperatures with less rain. Keep an eye on crop stress and use local guidance before changing irrigation or field plans.'
  }
};

const views = ['overview', 'rotation', 'simulator', 'fields', 'weather'];
const navButtons = document.querySelectorAll('[data-screen]');
const sections = document.querySelectorAll('.view');
let activeFieldKey = 'north';
let activeDataRequest;
let activePublicDataProfile = null;
let dataRequestId = 0;
const publicDataCache = new Map();
const publicDataCacheTtl = 15 * 60 * 1000;
let savedFieldLocations = {};
let fieldLocationStorageError = null;
let activeLocationDraft = null;
let boundaryPoints = [];
let boundaryFinished = false;
let boundaryCursor = { x: 180, y: 110 };
let boundaryCursorActive = false;
let draggedBoundaryPoint = null;
let geocodeController = null;

function showScreen(name) {
  if (!views.includes(name)) return;
  sections.forEach(section => {
    const active = section.id === `screen-${name}`;
    section.hidden = !active;
    section.classList.toggle('active', active);
  });
  navButtons.forEach(button => {
    const active = button.dataset.screen === name;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.getElementById('breadcrumb-current').textContent =
    { overview: 'Overview', rotation: 'Rotation explorer', simulator: 'Scenario simulator', fields: 'Fields', weather: 'Weather & soil' }[name];
  document.getElementById('sidebar').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selectField(key) {
  const field = fieldData[key];
  if (!field) return;
  geocodeController?.abort();
  geocodeController = null;
  document.getElementById('place-search-button').disabled = false;
  activeFieldKey = key;
  document.getElementById('boundary-field-select').value = key;
  const [current, next, third] = field.rotation;
  const rotationPlans = [
    [current, next, third],
    [current, `Rye + ${next.toLowerCase()}`, third],
    [current, `${third} + clover`, next]
  ];
  document.getElementById('field-select').value = key;
  document.getElementById('selected-field-name').textContent = field.name;
  document.getElementById('simulation-field').textContent = field.name;
  document.getElementById('simulator-acres').value = field.acres;
  document.getElementById('simulator-moisture').value = field.moisture;
  document.getElementById('simulator-soil').value = field.soil;
  document.getElementById('simulator-crop').value = field.crop;
  document.getElementById('selected-field-acres').textContent = `· ${field.acres} acres`;
  document.getElementById('map-field-name').textContent = field.name.toUpperCase();
  document.getElementById('rotation-field-name').innerHTML = `${field.name} <span>· ${field.acres} acres</span>`;
  document.getElementById('rotation-current-crop').textContent = `${current} · 2026`;
  document.getElementById('weather-field-name').textContent = field.name.toUpperCase();
  document.getElementById('weather-moisture').textContent = `${field.moisture}%`;
  document.getElementById('weather-rain').textContent = `${field.rain} in`;
  document.getElementById('weather-ndvi').textContent = field.ndvi;
  document.getElementById('moisture-caption').textContent =
    field.moisture < 35 ? 'A little dry near the surface' : 'Moisture looks balanced';
  document.getElementById('weather-soil-heading').textContent =
    field.moisture < 35 ? 'A little dry up top' : 'Moisture looks balanced';
  document.getElementById('weather-moisture-note').textContent =
    field.moisture < 35
      ? 'Sample surface moisture is below the balanced range, but recent rainfall and a field walk will tell you more.'
      : 'Sample surface moisture is in a balanced range. A field walk can help confirm what the sample reading suggests.';
  document.querySelector('[data-metric="moisture"]').textContent = field.moisture;
  document.querySelector('[data-metric="rain"]').textContent = field.rain;
  document.querySelector('[data-metric="ndvi"]').textContent = field.ndvi;
  const rainDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const rainBars = document.querySelectorAll('.rain-bars span');
  const maxRain = Math.max(...field.rainDays, 0.1);
  rainBars.forEach((bar, index) => {
    const amount = field.rainDays[index];
    bar.style.setProperty('--bar', `${Math.max(6, amount / maxRain * 100)}%`);
    bar.title = `${rainDays[index]} ${amount} in`;
  });
  document.querySelector('.rain-bars').setAttribute(
    'aria-label',
    `Weekly rainfall sample: ${rainDays.map((day, index) => `${day} ${field.rainDays[index]}`).join(', ')} inches`
  );
  document.querySelectorAll('.rotation-strip .crop-step').forEach((step, index) => {
    step.querySelector('.crop-name').textContent = field.rotation[index];
    step.querySelector('.crop-symbol').textContent = field.rotation[index][0];
  });
  document.querySelectorAll('.scenario-card').forEach((card, index) => {
    const plan = rotationPlans[index];
    card.querySelector('.scenario-desc').textContent = plan.join(' → ');
    card.querySelectorAll('.scenario-years b').forEach((crop, year) => {
      crop.textContent = plan[year];
    });
  });
  document.querySelectorAll('[data-select-field]').forEach(button => {
    const fieldForButton = fieldData[button.dataset.selectField];
    button.querySelector('.field-list-copy small').textContent =
      `${fieldForButton.acres} acres · ${fieldForButton.rotation[0]}`;
  });
  renderFieldLocationEditor();
  refreshSavedFieldData(key);
}

function updateLocation(key) {
  const profile = locationProfiles[key];
  if (!profile) return;
  document.getElementById('home-location').value = key;
  document.getElementById('farm-location').textContent = `${profile.name} · demo`;
  document.getElementById('risk-location-name').textContent = profile.name;
  document.getElementById('sample-coverage').textContent = `${profile.coverage}%`;
  document.querySelectorAll('.location-preset').forEach(button => {
    const active = button.dataset.location === key;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const riskSignals = [
    { key: 'moisture', id: 'moisture', format: value => `${value}%`, status: value => value < 35 ? 'Dry' : value <= 75 ? 'Optimal' : 'Wet' },
    { key: 'erosion', id: 'erosion', format: value => `${value} / 100`, status: value => value < 35 ? 'Low' : value < 65 ? 'Moderate' : 'High' },
    { key: 'heat', id: 'heat', format: value => `${value} / 100`, status: value => value < 35 ? 'Low' : value < 55 ? 'Moderate' : value < 75 ? 'Elevated' : 'High' },
    { key: 'pest', id: 'pest', format: value => `${value} / 100`, status: value => value < 35 ? 'Low' : value < 60 ? 'Moderate' : value < 75 ? 'Elevated' : 'High' }
  ];
  riskSignals.forEach(signal => {
    const value = profile[signal.key];
    document.getElementById(`risk-${signal.id}-value`).textContent = signal.format(value);
    document.getElementById(`risk-${signal.id}-status`).textContent = signal.status(value);
    const meter = document.getElementById(`risk-${signal.id}-meter`);
    meter.setAttribute('aria-valuenow', value);
    meter.firstElementChild.style.setProperty('--score', `${value}%`);
  });
  updateCopilotInsight();
  loadPublicData(profile);
}

function setPublicDataValue(valueId, metaId, value, metadata) {
  document.getElementById(valueId).textContent = value;
  document.getElementById(metaId).textContent = metadata;
}

function formatPublicObservation(observation, decimals = 1) {
  if (!observation || observation.value === null) return 'Unavailable';
  const displayUnit = observation.unit === 'C' ? '°C' : observation.unit === '1' ? '' : observation.unit;
  return `${observation.value.toFixed(decimals)}${displayUnit ? ` ${displayUnit}` : ''}`;
}

function formatObservationMetadata(observation) {
  if (!observation || observation.value === null) return 'No valid value in the requested period';
  const sourceNames = observation.source.modelSources.length
    ? ` · ${observation.source.modelSources.join(', ')}`
    : '';
  const freshness = observation.quality.status === 'stale' ? ' · delayed' : '';
  return `${observation.source.provider} · ${observation.temporal.date}${sourceNames}${freshness} · grid estimate`;
}

function formatSourceFailure(provider, error) {
  const detail = error?.message
    ?.replace(new RegExp(`^${provider} `), '')
    .replace(/[.!?]+$/, '');
  return `${provider} unavailable${detail ? `: ${detail}` : ''}`;
}

function renderPublicDataResult(profile, results, cached = false, errors = {}) {
  const nasaResult = results.nasa;
  const forecastResult = results.forecast;
  const nasaObservations = nasaResult?.observations ?? [];
  const temperature = nasaObservations.find(item => item.variable === 'daily_max_air_temperature');
  const rainfall = nasaObservations.find(item => item.variable === 'corrected_daily_precipitation');
  const wetness = nasaObservations.find(item => item.variable === 'surface_soil_wetness');
  const forecastRows = forecastResult?.forecasts ?? [];
  const forecastHighs = forecastRows
    .filter(item => item.variable === 'daily_max_temperature_forecast' && item.value !== null)
    .map(item => item.value);
  const forecastRainfall = forecastRows
    .filter(item => item.variable === 'daily_precipitation_forecast' && item.value !== null)
    .map(item => item.value);

  setPublicDataValue(
    'public-temperature',
    'public-temperature-meta',
    formatPublicObservation(temperature),
    nasaResult ? formatObservationMetadata(temperature) : errors.nasa?.message || 'NASA POWER unavailable'
  );
  setPublicDataValue(
    'public-rainfall',
    'public-rainfall-meta',
    formatPublicObservation(rainfall),
    nasaResult ? formatObservationMetadata(rainfall) : errors.nasa?.message || 'NASA POWER unavailable'
  );
  setPublicDataValue(
    'public-wetness',
    'public-wetness-meta',
    formatPublicObservation(wetness, 2),
    !nasaResult
      ? errors.nasa?.message || 'NASA POWER unavailable'
      : wetness?.value === null || !wetness
        ? formatObservationMetadata(wetness)
      : `${formatObservationMetadata(wetness)} · unitless index, not a sensor percentage`
  );

  const forecastValue = forecastHighs.length
    ? `${Math.min(...forecastHighs).toFixed(0)}–${Math.max(...forecastHighs).toFixed(0)} °C`
    : 'Unavailable';
  const rainfallTotal = forecastRainfall.length
    ? `${forecastRainfall.reduce((sum, value) => sum + value, 0).toFixed(1)} mm rain`
    : 'rainfall unavailable';
  const forecastDate = forecastRows.find(item => item.temporal.date)?.temporal.date;
  setPublicDataValue(
    'public-forecast',
    'public-forecast-meta',
    forecastValue,
    forecastHighs.length
      ? `Open-Meteo · ${forecastRows.length ? '7-day forecast' : ''} · ${rainfallTotal}${forecastDate ? ` · from ${forecastDate}` : ''}${cached ? ' · cached' : ''}`
      : errors.forecast?.message || 'Open-Meteo forecast unavailable'
  );

  const providers = [
    nasaResult ? 'NASA POWER daily data' : null,
    forecastResult ? 'Open-Meteo forecast' : null
  ].filter(Boolean);
  const failures = [
    !nasaResult ? formatSourceFailure('NASA POWER', errors.nasa) : null,
    !forecastResult ? formatSourceFailure('Open-Meteo', errors.forecast) : null
  ].filter(Boolean);
  const locationDescription = describePublicLocation(profile);
  const status = providers.length && failures.length
    ? `${providers.join(' and ')} loaded for ${locationDescription}; ${failures.join('; ')}.`
    : providers.length
      ? `${providers.join(' and ')} loaded for ${locationDescription}${cached ? ' from this session’s cache' : ''}.`
      : `Public sources are unavailable for ${locationDescription}: ${failures.join('; ')}. The rest of the dashboard remains sample data; try again later.`;
  document.getElementById('environment-data-status').textContent = status;
  document.getElementById('environment-data-status').dataset.state =
    providers.length && failures.length ? 'partial' : providers.length ? 'loaded' : 'error';
}

function describePublicLocation(profile) {
  if (profile.type === 'field_boundary_centroid') {
    return `the approximate centroid of ${profile.fieldName || profile.name}`;
  }
  if (profile.type === 'user_location_point' || profile.type === 'geocoded_place_point') {
    return `the saved point for ${profile.fieldName || profile.name}`;
  }
  return `the approximate ${profile.name} demo city point`;
}

function clearPublicDataValues(message = 'Not loaded') {
  setPublicDataValue('public-temperature', 'public-temperature-meta', '—', message);
  setPublicDataValue('public-rainfall', 'public-rainfall-meta', '—', message);
  setPublicDataValue('public-wetness', 'public-wetness-meta', '—', message);
  setPublicDataValue('public-forecast', 'public-forecast-meta', '—', message);
}

function stopPublicDataRequest(message) {
  activeDataRequest?.abort();
  activeDataRequest = null;
  activePublicDataProfile = null;
  dataRequestId += 1;
  document.getElementById('environment-data-refresh').disabled = false;
  clearPublicDataValues(message);
}

async function loadPublicData(profile, force = false) {
  if (!window.FieldShiftData) {
    document.getElementById('environment-data-status').textContent =
      'Public data adapter is unavailable. The rest of the dashboard remains sample data.';
    return;
  }

  activePublicDataProfile = profile;
  const requestId = ++dataRequestId;
  activeDataRequest?.abort();
  const controller = new AbortController();
  activeDataRequest = controller;
  const refreshButton = document.getElementById('environment-data-refresh');
  refreshButton.disabled = true;
  clearPublicDataValues('Loading public source…');
  document.getElementById('environment-data-status').textContent =
    `Loading NASA POWER and Open-Meteo for ${describePublicLocation(profile)}…`;
  document.getElementById('environment-data-status').dataset.state = 'loading';

  const cacheKey = `${profile.latitude.toFixed(3)},${profile.longitude.toFixed(3)}`;
  const cached = publicDataCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.fetchedAt < publicDataCacheTtl) {
    if (requestId === dataRequestId) {
      renderPublicDataResult(profile, cached.results, true, cached.errors);
      refreshButton.disabled = false;
      activeDataRequest = null;
    }
    return;
  }

  const location = {
    latitude: profile.latitude,
    longitude: profile.longitude,
    type: profile.type || 'approximate_city_point'
  };
  const [nasaResponse, forecastResponse] = await Promise.allSettled([
    window.FieldShiftData.fetchNasaPowerDaily({ location, signal: controller.signal }),
    window.FieldShiftData.fetchOpenMeteoForecast({ location, signal: controller.signal })
  ]);
  if (requestId !== dataRequestId) return;

  const results = {
    nasa: nasaResponse.status === 'fulfilled' ? nasaResponse.value : null,
    forecast: forecastResponse.status === 'fulfilled' ? forecastResponse.value : null
  };
  const errors = {
    nasa: nasaResponse.status === 'rejected' ? nasaResponse.reason : null,
    forecast: forecastResponse.status === 'rejected' ? forecastResponse.reason : null
  };
  if (results.nasa && results.forecast) {
    publicDataCache.set(cacheKey, { fetchedAt: Date.now(), results, errors });
    while (publicDataCache.size > 8) publicDataCache.delete(publicDataCache.keys().next().value);
  }
  renderPublicDataResult(profile, results, false, errors);
  refreshButton.disabled = false;
  activeDataRequest = null;
}

function setFieldLocationStatus(message, state = '') {
  const status = document.getElementById('field-location-status');
  status.textContent = message;
  status.dataset.state = state;
}

function setBoundaryStatus(message, state = '') {
  const status = document.getElementById('boundary-area-status');
  status.textContent = message;
  status.dataset.state = state;
}

function activeFieldName() {
  return fieldData[activeFieldKey].name;
}

function setDraftLocation(latitude, longitude, details) {
  window.FieldShiftFields.validateCoordinate(latitude, longitude);
  const moved = activeLocationDraft &&
    (Math.abs(activeLocationDraft.latitude - latitude) > 1e-7 ||
      Math.abs(activeLocationDraft.longitude - longitude) > 1e-7);
  if (moved && boundaryPoints.length &&
      !window.confirm('Changing the location moves the sketch reference point. Clear the current outline and redraw it?')) {
    return false;
  }
  if (moved) {
    boundaryPoints = [];
    boundaryFinished = false;
  }
  activeLocationDraft = {
    latitude,
    longitude,
    label: details.label,
    source: details.source,
    locationType: details.locationType
  };
  document.getElementById('field-latitude').value = latitude.toFixed(6);
  document.getElementById('field-longitude').value = longitude.toFixed(6);
  document.getElementById('boundary-editor').setAttribute('aria-disabled', 'false');
  setFieldLocationStatus(
    `${details.label} · ${latitude.toFixed(5)}, ${longitude.toFixed(5)}. ${details.source}.`,
    'success'
  );
  renderBoundaryEditor();
  return true;
}

function renderBoundaryEditor() {
  const svg = document.getElementById('boundary-editor');
  const polygon = document.getElementById('boundary-polygon');
  const draftLine = document.getElementById('boundary-draft-line');
  const handles = document.getElementById('boundary-handles');
  const keyboardCursor = document.getElementById('boundary-keyboard-cursor');
  const pointsText = boundaryPoints.map(point => `${point.x},${point.y}`).join(' ');
  const canShowPolygon = boundaryFinished && boundaryPoints.length >= 3;
  polygon.hidden = !canShowPolygon;
  polygon.setAttribute('points', canShowPolygon ? pointsText : '');
  draftLine.hidden = boundaryPoints.length === 0 || canShowPolygon;
  draftLine.setAttribute('points', pointsText);
  keyboardCursor.setAttribute('cx', boundaryCursor.x);
  keyboardCursor.setAttribute('cy', boundaryCursor.y);
  keyboardCursor.hidden = !boundaryCursorActive || !activeLocationDraft || boundaryFinished;
  handles.replaceChildren();

  boundaryPoints.forEach((point, index) => {
    const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    handle.classList.add('boundary-handle');
    handle.setAttribute('cx', point.x);
    handle.setAttribute('cy', point.y);
    handle.setAttribute('r', '8');
    handle.setAttribute('tabindex', '0');
    handle.setAttribute('role', 'button');
    handle.setAttribute(
      'aria-label',
      `Boundary point ${index + 1}; use arrow keys to move, delete to remove`
    );
    handle.dataset.index = String(index);
    handles.append(handle);
  });

  const finishButton = document.getElementById('finish-boundary');
  finishButton.disabled = !activeLocationDraft || boundaryPoints.length < 3 || boundaryFinished;
  document.getElementById('undo-boundary-point').disabled = boundaryPoints.length === 0 || boundaryFinished;
  document.getElementById('clear-boundary').disabled = boundaryPoints.length === 0;
  document.getElementById('save-field-location').disabled = fieldLocationStorageError !== null;

  const saved = savedFieldLocations[activeFieldKey];
  document.getElementById('delete-field-location').disabled = !saved || fieldLocationStorageError !== null;
  document.getElementById('download-field-geojson').disabled = !saved?.geoJSON;

  if (!activeLocationDraft) {
    svg.setAttribute('aria-disabled', 'true');
    if (!boundaryPoints.length) setBoundaryStatus('Add a location before sketching a boundary.');
    return;
  }
  svg.setAttribute('aria-disabled', 'false');

  if (!boundaryPoints.length) {
    setBoundaryStatus('No outline yet. Click inside the grid to add boundary points.');
  } else if (boundaryPoints.length < 3) {
    setBoundaryStatus(`${boundaryPoints.length} point${boundaryPoints.length === 1 ? '' : 's'} added. Add at least 3 to close an outline.`);
  } else {
    try {
      const { geoJSON, areaSquareMeters } = window.FieldShiftFields.buildBoundaryGeoJSON(
        boundaryPoints,
        activeLocationDraft,
        activeFieldName()
      );
      const areaAcres = geoJSON.properties.areaAcres;
      const areaHectares = geoJSON.properties.areaHectares;
      setBoundaryStatus(
        `${boundaryFinished ? 'Outline ready' : 'Approximate area'}: ${areaAcres.toFixed(2)} acres · ${areaHectares.toFixed(2)} ha (${Math.round(areaSquareMeters)} m²).`
      );
    } catch (error) {
      setBoundaryStatus(error.message, 'error');
    }
  }
}

function renderFieldLocationEditor() {
  const saved = savedFieldLocations[activeFieldKey];
  boundaryPoints = saved?.points?.map(point => ({ x: point.x, y: point.y })) ?? [];
  boundaryFinished = Boolean(saved?.geoJSON);
  boundaryCursor = { x: 180, y: 110 };
  boundaryCursorActive = false;
  activeLocationDraft = saved
    ? {
      latitude: saved.anchorLatitude ?? saved.latitude,
      longitude: saved.anchorLongitude ?? saved.longitude,
      label: saved.label,
      source: saved.locationSource,
      locationType: saved.locationType
    }
    : null;
  document.getElementById('field-latitude').value =
    activeLocationDraft ? activeLocationDraft.latitude.toFixed(6) : '';
  document.getElementById('field-longitude').value =
    activeLocationDraft ? activeLocationDraft.longitude.toFixed(6) : '';
  document.getElementById('provider-location-consent').checked = Boolean(saved?.allowProviderQueries);
  document.getElementById('boundary-editor').setAttribute('aria-disabled', String(!activeLocationDraft));
  document.getElementById('geocode-results').replaceChildren();
  document.getElementById('geocode-results').hidden = true;
  if (fieldLocationStorageError) {
    setFieldLocationStatus(fieldLocationStorageError.message, 'error');
  } else if (saved) {
    setFieldLocationStatus(
      `${saved.label} · ${saved.latitude.toFixed(5)}, ${saved.longitude.toFixed(5)}${saved.geoJSON ? ' · boundary saved locally' : ' · point saved locally'}.`,
      'success'
    );
  } else {
    setFieldLocationStatus('No saved location for this field. Search for a place or enter coordinates.');
  }
  renderBoundaryEditor();
}

function updateBoundaryPoint(index, point) {
  if (!boundaryPoints[index]) return;
  boundaryPoints[index] = {
    x: Math.max(2, Math.min(358, point.x)),
    y: Math.max(2, Math.min(218, point.y))
  };
  renderBoundaryEditor();
}

function svgPointFromPointer(event) {
  const svg = document.getElementById('boundary-editor');
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

function handleBoundaryKeydown(event) {
  const handle = event.target.closest('.boundary-handle');
  if (!handle) {
    if (event.target.id !== 'boundary-editor' || !activeLocationDraft || boundaryFinished) return;
    const step = event.shiftKey ? 10 : 2;
    const moves = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0]
    };
    if (moves[event.key]) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      boundaryCursor = {
        x: Math.max(2, Math.min(358, boundaryCursor.x + dx)),
        y: Math.max(2, Math.min(218, boundaryCursor.y + dy))
      };
      boundaryCursorActive = true;
      renderBoundaryEditor();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (boundaryPoints.length >= 100) {
        setBoundaryStatus('This sketch has reached the 100-point limit.', 'error');
        return;
      }
      if (boundaryPoints.some(point =>
        Math.abs(point.x - boundaryCursor.x) < 0.5 &&
        Math.abs(point.y - boundaryCursor.y) < 0.5
      )) {
        setBoundaryStatus('Move the keyboard marker to a new spot before adding another point.', 'error');
        return;
      }
      boundaryPoints.push({ ...boundaryCursor });
      boundaryCursorActive = true;
      renderBoundaryEditor();
    }
    return;
  }
  const index = Number(handle.dataset.index);
  const point = boundaryPoints[index];
  if (!point) return;
  const step = event.shiftKey ? 10 : 2;
  const moves = {
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0]
  };
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    boundaryPoints.splice(index, 1);
    boundaryFinished = false;
    renderBoundaryEditor();
    return;
  }
  if (!moves[event.key]) return;
  event.preventDefault();
  const [dx, dy] = moves[event.key];
  updateBoundaryPoint(index, { x: point.x + dx, y: point.y + dy });
  document.querySelector(`#boundary-handles [data-index="${index}"]`)?.focus();
}

function resolveGeocodeResults(results) {
  const resultContainer = document.getElementById('geocode-results');
  resultContainer.replaceChildren();
  resultContainer.hidden = results.length === 0;
  results.forEach(result => {
    const button = document.createElement('button');
    button.className = 'geocode-result';
    button.type = 'button';
    const title = document.createElement('strong');
    title.textContent = result.name;
    const details = document.createElement('small');
    details.textContent = [result.admin1, result.country].filter(Boolean).join(', ');
    button.append(title, details);
    button.addEventListener('click', () => {
      const label = [result.name, result.admin1, result.country].filter(Boolean).join(', ');
      try {
        const applied = setDraftLocation(result.latitude, result.longitude, {
          label,
          source: 'Open-Meteo Geocoding',
          locationType: 'geocoded_place_point'
        });
        if (applied) {
          resultContainer.hidden = true;
          setFieldLocationStatus(
            `${label} selected · ${result.latitude.toFixed(5)}, ${result.longitude.toFixed(5)}. Save to store it on this device.`
          );
        }
      } catch (error) {
        setFieldLocationStatus(error.message, 'error');
      }
    });
    resultContainer.append(button);
  });
}

async function searchPlaces(event) {
  event.preventDefault();
  const place = document.getElementById('place-search').value.trim();
  const country = document.getElementById('place-country').value.trim();
  const query = [place, country].filter(Boolean).join(', ');
  const button = document.getElementById('place-search-button');
  geocodeController?.abort();
  const requestFieldKey = activeFieldKey;
  const controller = new AbortController();
  geocodeController = controller;
  button.disabled = true;
  setFieldLocationStatus('Searching Open-Meteo Geocoding. The place query is sent to Open-Meteo.');
  try {
    const results = await window.FieldShiftData.geocodeLocation({
      query,
      count: 5,
      signal: controller.signal
    });
    if (controller.signal.aborted || activeFieldKey !== requestFieldKey) return;
    resolveGeocodeResults(results);
    setFieldLocationStatus(
      results.length
        ? `Choose the matching place below. ${results.length} result${results.length === 1 ? '' : 's'} found.`
        : 'No matching places found. Try adding a country or enter exact coordinates.'
    );
  } catch (error) {
    if (error.name !== 'AbortError') setFieldLocationStatus(error.message, 'error');
  } finally {
    if (geocodeController === controller) {
      button.disabled = false;
      geocodeController = null;
    }
  }
}

function applyManualCoordinates() {
  const latitudeText = document.getElementById('field-latitude').value.trim();
  const longitudeText = document.getElementById('field-longitude').value.trim();
  if (!latitudeText || !longitudeText) {
    setFieldLocationStatus('Enter both latitude and longitude.', 'error');
    return;
  }
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  try {
    setDraftLocation(latitude, longitude, {
      label: 'Manually entered coordinates',
      source: 'User entry',
      locationType: 'user_location_point'
    });
  } catch (error) {
    setFieldLocationStatus(error.message, 'error');
  }
}

function saveFieldLocation() {
  if (fieldLocationStorageError) {
    setFieldLocationStatus(fieldLocationStorageError.message, 'error');
    return;
  }
  if (!activeLocationDraft) {
    setFieldLocationStatus('Search for a place or enter valid coordinates before saving.', 'error');
    return;
  }
  if (boundaryPoints.length && !boundaryFinished) {
    setFieldLocationStatus('Finish the boundary outline or clear it before saving.', 'error');
    return;
  }

  let boundary = null;
  if (boundaryFinished) {
    try {
      boundary = window.FieldShiftFields.buildBoundaryGeoJSON(
        boundaryPoints,
        activeLocationDraft,
        activeFieldName()
      );
    } catch (error) {
      setBoundaryStatus(error.message, 'error');
      return;
    }
  }

  const locationForData = boundary?.centroid ?? {
    latitude: activeLocationDraft.latitude,
    longitude: activeLocationDraft.longitude
  };
  const record = {
    label: activeLocationDraft.label,
    locationSource: activeLocationDraft.source,
    locationType: activeLocationDraft.locationType,
    anchorLatitude: activeLocationDraft.latitude,
    anchorLongitude: activeLocationDraft.longitude,
    latitude: locationForData.latitude,
    longitude: locationForData.longitude,
    points: boundaryPoints.map(point => ({ x: point.x, y: point.y })),
    geoJSON: boundary?.geoJSON ?? null,
    areaSquareMeters: boundary?.areaSquareMeters ?? null,
    allowProviderQueries: document.getElementById('provider-location-consent').checked,
    updatedAt: new Date().toISOString()
  };
  const nextLocations = { ...savedFieldLocations, [activeFieldKey]: record };
  try {
    window.FieldShiftFields.writeSavedLocations(window.localStorage, nextLocations);
  } catch (error) {
    setFieldLocationStatus(`Could not save this field on the device: ${error.message}`, 'error');
    return;
  }
  savedFieldLocations = nextLocations;
  const savedGeometry = boundary ? 'Boundary and location saved on this device.' : 'Location saved on this device; no boundary was drawn.';
  if (record.allowProviderQueries) {
    const profile = {
      name: record.label,
      fieldName: activeFieldName(),
      latitude: record.latitude,
      longitude: record.longitude,
      type: boundary ? 'field_boundary_centroid' : record.locationType
    };
    setFieldLocationStatus(`${savedGeometry} Fetching public point data at ${boundary ? 'the boundary centroid' : 'the saved point'}.`, 'success');
    document.getElementById('farm-location').textContent = `${activeFieldName()} · saved location`;
    loadPublicData(profile, true);
    showScreen('overview');
  } else {
    stopPublicDataRequest('No field location data sent.');
    const status = document.getElementById('environment-data-status');
    status.textContent = `${savedGeometry} No coordinates were sent to data providers; enable consent to fetch public data.`;
    status.dataset.state = 'idle';
    setFieldLocationStatus(`${savedGeometry} No coordinates were sent to data providers.`, 'success');
  }
  renderFieldLocationEditor();
}

function refreshSavedFieldData(fieldKey, force = false) {
  const record = savedFieldLocations[fieldKey];
  if (!record?.allowProviderQueries) {
    stopPublicDataRequest('No saved field location has been shared.');
    const status = document.getElementById('environment-data-status');
    status.textContent = 'No saved field coordinates have been shared. Public data for this field is not loaded; other dashboard readings remain sample data.';
    status.dataset.state = 'idle';
    return;
  }
  loadPublicData({
    name: record.label,
    fieldName: fieldData[fieldKey].name,
    latitude: record.latitude,
    longitude: record.longitude,
    type: record.geoJSON ? 'field_boundary_centroid' : record.locationType
  }, force);
}

function deleteFieldLocation() {
  if (!savedFieldLocations[activeFieldKey]) return;
  if (!window.confirm(`Remove the saved location and boundary for ${activeFieldName()} from this device?`)) return;
  const nextLocations = { ...savedFieldLocations };
  delete nextLocations[activeFieldKey];
  try {
    window.FieldShiftFields.writeSavedLocations(window.localStorage, nextLocations);
  } catch (error) {
    setFieldLocationStatus(`Could not remove the saved field: ${error.message}`, 'error');
    return;
  }
  savedFieldLocations = nextLocations;
  renderFieldLocationEditor();
  updateLocation(document.getElementById('home-location').value);
}

function downloadFieldGeoJSON() {
  const record = savedFieldLocations[activeFieldKey];
  if (!record?.geoJSON) return;
  const blob = new Blob([`${JSON.stringify(record.geoJSON, null, 2)}\n`], {
    type: 'application/geo+json'
  });
  const url = URL.createObjectURL(blob);
  const download = document.createElement('a');
  download.href = url;
  download.download = `${activeFieldKey}-boundary.geojson`;
  download.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function initializeFieldLocationEditor() {
  const svg = document.getElementById('boundary-editor');
  try {
    savedFieldLocations = window.FieldShiftFields.readSavedLocations(window.localStorage);
  } catch (error) {
    fieldLocationStorageError = error;
  }
  document.getElementById('boundary-field-select').addEventListener('change', event => selectField(event.target.value));
  document.getElementById('place-search-form').addEventListener('submit', searchPlaces);
  document.getElementById('apply-field-coordinates').addEventListener('click', applyManualCoordinates);
  document.getElementById('save-field-location').addEventListener('click', saveFieldLocation);
  document.getElementById('delete-field-location').addEventListener('click', deleteFieldLocation);
  document.getElementById('download-field-geojson').addEventListener('click', downloadFieldGeoJSON);
  document.getElementById('finish-boundary').addEventListener('click', () => {
    if (boundaryPoints.length < 3) {
      setBoundaryStatus('Add at least three points before finishing the outline.', 'error');
      return;
    }
    if (!activeLocationDraft) {
      setBoundaryStatus('Set a field location before finishing the outline.', 'error');
      return;
    }
    try {
      window.FieldShiftFields.buildBoundaryGeoJSON(boundaryPoints, activeLocationDraft, activeFieldName());
      boundaryFinished = true;
      renderBoundaryEditor();
    } catch (error) {
      setBoundaryStatus(error.message, 'error');
    }
  });
  document.getElementById('undo-boundary-point').addEventListener('click', () => {
    boundaryPoints.pop();
    renderBoundaryEditor();
  });
  document.getElementById('clear-boundary').addEventListener('click', () => {
    boundaryPoints = [];
    boundaryFinished = false;
    renderBoundaryEditor();
  });
  svg.addEventListener('click', event => {
    if (!activeLocationDraft || boundaryFinished || event.target.closest('.boundary-handle')) return;
    if (event.target.id !== 'boundary-editor' && event.target.id !== 'boundary-grid-bg') return;
    if (boundaryPoints.length >= 100) {
      setBoundaryStatus('This sketch has reached the 100-point limit.', 'error');
      return;
    }
    const point = svgPointFromPointer(event);
    boundaryPoints.push({
      x: Math.max(2, Math.min(358, point.x)),
      y: Math.max(2, Math.min(218, point.y))
    });
    renderBoundaryEditor();
  });
  svg.addEventListener('pointerdown', event => {
    const handle = event.target.closest('.boundary-handle');
    if (!handle || !boundaryFinished) return;
    event.preventDefault();
    draggedBoundaryPoint = Number(handle.dataset.index);
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', event => {
    if (draggedBoundaryPoint === null) return;
    updateBoundaryPoint(draggedBoundaryPoint, svgPointFromPointer(event));
  });
  svg.addEventListener('pointerup', () => {
    if (draggedBoundaryPoint === null) return;
    draggedBoundaryPoint = null;
    boundaryFinished = boundaryPoints.length >= 3;
    renderBoundaryEditor();
  });
  svg.addEventListener('pointercancel', () => {
    draggedBoundaryPoint = null;
  });
  svg.addEventListener('keydown', handleBoundaryKeydown);
  svg.addEventListener('pointerdown', () => {
    boundaryCursorActive = false;
  });

  renderFieldLocationEditor();
}

function updateCopilotInsight() {
  const locationName = locationProfiles[document.getElementById('home-location').value].name;
  const lastCrop = document.getElementById('last-crop').value;
  const irrigation = document.getElementById('irrigation-type').value;
  const priority = document.getElementById('farm-priority').value;
  const cropLabels = { corn: 'corn', soybeans: 'soybeans', sorghum: 'sorghum', other: 'another crop' };
  const irrigationLabels = {
    rainfed: 'rain-fed',
    supplemental: 'partly irrigated',
    irrigated: 'irrigated'
  };
  const priorityNotes = {
    soil: 'A cover crop may be worth comparing for added ground cover.',
    water: 'Compare options for water demand and check field moisture locally.',
    cost: 'Compare seed, termination, and input costs with a local advisor.'
  };
  const historyNote = lastCrop === 'corn'
    ? 'Repeating corn may increase some pest and input pressures in certain systems.'
    : 'Changing crop families may add diversity; local disease and residue history still matter.';
  const waterNote = irrigation === 'rainfed'
    ? 'Rainfall timing is an important planning factor for a rain-fed field.'
    : 'Irrigation can add flexibility, but water availability and cost still matter.';
  const mode = document.querySelector('.mode-button.active').dataset.mode;
  const plainNote = `${historyNote} ${waterNote} ${priorityNotes[priority]}`;
  const technicalNote = `Sample inputs: ${cropLabels[lastCrop]} last season · ${irrigationLabels[irrigation]} · priority ${priority}. These general signals need local field and crop-history checks.`;
  document.getElementById('copilot-insight-copy').textContent =
    `${locationName} demo profile: ${mode === 'farmer' ? plainNote : technicalNote}`;
}

function runSimulation(zip, situationKey) {
  const region = regionalProfiles[zip[0]];
  const situation = situations[situationKey];
  const acres = Number(document.getElementById('simulator-acres').value);
  const startingMoisture = Number(document.getElementById('simulator-moisture').value);
  const soil = document.getElementById('simulator-soil').value;
  const crop = document.getElementById('simulator-crop').value;
  const stage = document.getElementById('simulator-stage').value;
  const soilEffects = {
    sandy: { typical: 0, dry: -4, rain: 1, heat: -4 },
    loam: { typical: 0, dry: 0, rain: 0, heat: 0 },
    clay: { typical: 0, dry: 2, rain: 8, heat: 1 }
  };
  const field = fieldData[activeFieldKey];
  const fieldRainOffset = Number(field.rain) - Number(fieldData.north.rain);
  const rain = Math.max(0, region.rain * situation.rainFactor + fieldRainOffset);
  const moisture = Math.min(100, Math.max(0, startingMoisture + situation.moistureChange + soilEffects[soil][situationKey]));
  const temperature = region.high + situation.temperatureChange;
  const vegetation = Math.min(0.9, Math.max(0.2, Number(field.ndvi) + situation.vegetationChange));
  const sensitiveStage =
    (['corn', 'soybeans'].includes(crop) && stage === 'reproductive') ||
    (crop === 'small-grains' && ['reproductive', 'fill'].includes(stage));
  const waterloggingSignal = situationKey === 'rain' && (soil === 'clay' || moisture >= 65);
  const heatSignal = situationKey === 'heat' && (temperature >= region.high + 10 || sensitiveStage);
  const drySignal = moisture < 22 || (moisture < 29 && sensitiveStage);
  const stress = drySignal || heatSignal || moisture >= 75
    ? { level: 'Elevated', note: 'more attention in this example' }
    : waterloggingSignal || moisture < 35 || moisture >= 60
      ? { level: 'Moderate', note: 'some attention in this example' }
      : { level: 'Low', note: 'no strong signal in this example' };
  const cropLabels = { corn: 'Corn', soybeans: 'Soybeans', 'small-grains': 'Small grains' };
  const soilLabels = { sandy: 'Sandy', loam: 'Loam', clay: 'Clay' };
  const stageLabels = {
    early: 'recently planted',
    vegetative: 'vegetative growth',
    reproductive: 'flowering / reproductive',
    fill: 'grain / pod fill',
    harvest: 'near harvest'
  };
  const gallons = rain * acres * 27154;
  const rainVolume = gallons >= 1000000
    ? `~${(gallons / 1000000).toFixed(1)}M gal`
    : gallons >= 1000
      ? `~${Math.round(gallons / 1000)}k gal`
      : `~${Math.round(gallons / 100) * 100} gal`;
  const recommendations = situationKey === 'dry'
    ? [
      'Check moisture below the surface before changing irrigation plans.',
      `${cropLabels[crop]} at ${stageLabels[stage]}: look for persistent stress across more than one part of the field.`,
      soil === 'sandy' ? 'Sandy soil may dry faster; compare several spots in the field.' : 'Recheck moisture after any rain and follow local crop guidance.'
    ]
    : situationKey === 'rain'
      ? [
        'Check low areas for standing water and avoid traffic on saturated ground.',
        soil === 'clay' ? 'Clay soil can stay wet longer; wait until the field is fit before equipment enters.' : 'Walk the field after water drains to check for runoff or ponding.',
        `Note whether ${cropLabels[crop]} at ${stageLabels[stage]} shows any uneven growth.`
      ]
      : situationKey === 'heat'
        ? [
          'Check crops during cooler hours for wilting or leaf rolling.',
          'Compare more than one field area before changing irrigation or field plans.',
          `Use local guidance for ${cropLabels[crop]} at ${stageLabels[stage]} if stress persists.`
        ]
        : [
          'Compare this starting estimate with a field walk and a recent soil check.',
          `Keep notes on ${cropLabels[crop]} at ${stageLabels[stage]} to spot changes over time.`
        ];

  document.getElementById('simulation-zip').textContent = zip;
  document.getElementById('simulation-region').textContent = region.name;
  document.getElementById('simulation-input-summary').textContent =
    `${cropLabels[crop]} · ${soilLabels[soil]} soil · ${stageLabels[stage]} · ${acres} acres · Starting moisture ${startingMoisture}%`;
  document.getElementById('simulation-rain').textContent = `${rain.toFixed(1)} in`;
  document.getElementById('simulation-rain-note').textContent = `over ${situation.days} days · sample`;
  document.getElementById('simulation-volume').textContent = rainVolume;
  document.getElementById('simulation-moisture-note').textContent = `from your entered ${startingMoisture}% baseline`;
  document.getElementById('simulation-moisture').textContent = `${moisture}%`;
  document.getElementById('simulation-temperature').textContent = `${temperature}°F`;
  document.getElementById('simulation-temperature-note').textContent = 'illustrative daytime high';
  document.getElementById('simulation-vegetation').textContent = vegetation.toFixed(2);
  document.getElementById('simulation-stress').textContent = stress.level;
  document.getElementById('simulation-stress-note').textContent = stress.note;
  document.getElementById('simulation-impact-title').textContent = situation.title;
  document.getElementById('simulation-impact-copy').textContent =
    `${situation.copy} For ${cropLabels[crop]} at ${stageLabels[stage]} stage in ${soilLabels[soil].toLowerCase()} soil, the overall signal is ${stress.level.toLowerCase()}.`;
  const recommendationList = document.getElementById('simulation-recommendations');
  recommendationList.replaceChildren(...recommendations.map(text => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
}

navButtons.forEach(button => button.addEventListener('click', () => showScreen(button.dataset.screen)));
document.getElementById('field-select').addEventListener('change', event => selectField(event.target.value));
document.getElementById('home-location').addEventListener('change', event => updateLocation(event.target.value));
document.getElementById('environment-data-refresh').addEventListener('click', () => {
  const selectedLocation = activePublicDataProfile ||
    locationProfiles[document.getElementById('home-location').value];
  if (selectedLocation) loadPublicData(selectedLocation, true);
});
document.querySelectorAll('.location-preset').forEach(button => {
  button.addEventListener('click', () => updateLocation(button.dataset.location));
});
document.querySelectorAll('.mode-button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.mode-button').forEach(modeButton => {
      const active = modeButton === button;
      modeButton.classList.toggle('active', active);
      modeButton.setAttribute('aria-pressed', String(active));
    });
    document.getElementById('mode-hint').textContent = button.dataset.mode === 'farmer'
      ? 'Plain-language view · illustrative profile, not a sensor reading'
      : 'Technical view · 0–100 sample indices, not measured telemetry';
    updateCopilotInsight();
  });
});
const questionnaireDialog = document.getElementById('questionnaire-dialog');
document.getElementById('questionnaire-open').addEventListener('click', () => questionnaireDialog.showModal());
document.getElementById('questionnaire-close').addEventListener('click', () => questionnaireDialog.close());
document.getElementById('questionnaire-cancel').addEventListener('click', () => questionnaireDialog.close());
document.getElementById('questionnaire-form').addEventListener('submit', event => {
  event.preventDefault();
  updateCopilotInsight();
  questionnaireDialog.close();
});
document.querySelectorAll('[data-select-field]').forEach(button => {
  button.addEventListener('click', () => {
    selectField(button.dataset.selectField);
    showScreen('overview');
  });
});
const simulatorZip = document.getElementById('simulator-zip');
simulatorZip.addEventListener('input', () => simulatorZip.setCustomValidity(''));
document.getElementById('simulator-form').addEventListener('submit', event => {
  event.preventDefault();
  const zip = simulatorZip.value.trim();
  if (!/^\d{5}$/.test(zip)) {
    simulatorZip.setCustomValidity('Enter a five-digit U.S. ZIP code.');
    simulatorZip.reportValidity();
    return;
  }
  runSimulation(zip, document.getElementById('simulator-situation').value);
});
document.getElementById('task-done').addEventListener('click', event => {
  const button = event.currentTarget;
  const done = button.classList.toggle('done');
  button.setAttribute('aria-pressed', String(done));
  button.lastChild.textContent = done ? ' Marked done' : ' Mark as done';
});

initializeFieldLocationEditor();
runSimulation('53590', 'typical');
if (savedFieldLocations[activeFieldKey]?.allowProviderQueries) {
  document.getElementById('farm-location').textContent = `${fieldData[activeFieldKey].name} · saved location`;
  refreshSavedFieldData(activeFieldKey);
} else {
  updateLocation('charlotte');
}
