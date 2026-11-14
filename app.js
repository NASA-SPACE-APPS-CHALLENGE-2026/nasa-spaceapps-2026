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
let dataRequestId = 0;
const publicDataCache = new Map();
const publicDataCacheTtl = 15 * 60 * 1000;

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
  activeFieldKey = key;
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
  const status = providers.length && failures.length
    ? `${providers.join(' and ')} loaded for the approximate ${profile.name} city point; ${failures.join('; ')}.`
    : providers.length
      ? `${providers.join(' and ')} loaded for the approximate ${profile.name} city point${cached ? ' from this session’s cache' : ''}.`
      : `Public sources are unavailable for the approximate ${profile.name} city point: ${failures.join('; ')}. The rest of the dashboard remains sample data; try again later.`;
  document.getElementById('environment-data-status').textContent = status;
  document.getElementById('environment-data-status').dataset.state =
    providers.length && failures.length ? 'partial' : providers.length ? 'loaded' : 'error';
}

function clearPublicDataValues() {
  setPublicDataValue('public-temperature', 'public-temperature-meta', '—', 'Loading NASA POWER…');
  setPublicDataValue('public-rainfall', 'public-rainfall-meta', '—', 'Loading NASA POWER…');
  setPublicDataValue('public-wetness', 'public-wetness-meta', '—', 'Loading NASA POWER…');
  setPublicDataValue('public-forecast', 'public-forecast-meta', '—', 'Loading Open-Meteo…');
}

async function loadPublicData(profile, force = false) {
  if (!window.FieldShiftData) {
    document.getElementById('environment-data-status').textContent =
      'Public data adapter is unavailable. The rest of the dashboard remains sample data.';
    return;
  }

  const requestId = ++dataRequestId;
  activeDataRequest?.abort();
  const controller = new AbortController();
  activeDataRequest = controller;
  const refreshButton = document.getElementById('environment-data-refresh');
  refreshButton.disabled = true;
  clearPublicDataValues();
  document.getElementById('environment-data-status').textContent =
    `Loading NASA POWER and Open-Meteo for the approximate ${profile.name} city point…`;
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
    type: 'approximate_city_point'
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
  const selectedLocation = locationProfiles[document.getElementById('home-location').value];
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

runSimulation('53590', 'typical');
updateLocation('charlotte');
