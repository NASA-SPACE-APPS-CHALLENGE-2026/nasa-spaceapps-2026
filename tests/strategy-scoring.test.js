const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ASPECTS,
  OBJECTIVE_WEIGHTS,
  STRATEGIES,
  buildFieldInputs,
  compareStrategies,
  describeStrategy,
  overallScore,
  scoreAspect,
  scoreStrategy
} = require('../strategy-scoring.js');

const northField = { name: 'North 40', moisture: 32, soil: 'loam', rotation: ['Corn', 'Soybeans', 'Oats'] };
const charlotte = { heat: 62, pest: 84, erosion: 42 };
const questionnaire = { lastCrop: 'corn', irrigation: 'rainfed' };

function fixtureInputs(overrides = {}) {
  return {
    ...buildFieldInputs({ field: northField, locationProfile: charlotte, observations: [], questionnaire }),
    ...overrides
  };
}

const missing = { value: null, source: 'test' };
const strategy = id => STRATEGIES.find(item => item.id === id);

test('every strategy renders the same five aspects in the same order and scale', () => {
  const { results } = compareStrategies(fixtureInputs());
  const expected = ['yield', 'waterHeat', 'soilHealth', 'pestControl', 'feasibility'];
  assert.deepEqual(ASPECTS.map(item => item.id), expected);
  assert.equal(results.length, 3);
  for (const result of results) {
    assert.deepEqual(result.aspects.map(item => item.aspect), expected);
    for (const aspect of result.aspects) {
      assert.ok(aspect.score >= 0 && aspect.score <= 100, `${result.id}.${aspect.aspect} out of range`);
    }
  }
});

test('objective weights cover every aspect and sum to one', () => {
  for (const [objective, weights] of Object.entries(OBJECTIVE_WEIGHTS)) {
    assert.deepEqual(Object.keys(weights).sort(), ASPECTS.map(item => item.id).sort(), objective);
    const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `${objective} weights sum to ${total}`);
  }
});

test('scores clamp to the 0-100 scale at extreme inputs', () => {
  const harsh = fixtureInputs({
    surfaceMoisture: { value: 0, source: 'test' },
    heatIndex: { value: 100, source: 'test' },
    pestPressure: { value: 100, source: 'test' },
    erosionRisk: { value: 100, source: 'test' },
    soilTexture: { value: 'sandy', source: 'test' }
  });
  const mild = fixtureInputs({
    surfaceMoisture: { value: 100, source: 'test' },
    heatIndex: { value: 0, source: 'test' },
    pestPressure: { value: 0, source: 'test' },
    erosionRisk: { value: 0, source: 'test' },
    irrigation: { value: 'irrigated', source: 'test' }
  });
  for (const inputs of [harsh, mild]) {
    for (const result of compareStrategies(inputs).results) {
      for (const aspect of result.aspects) {
        assert.ok(Number.isInteger(aspect.score) && aspect.score >= 0 && aspect.score <= 100);
      }
    }
  }
  const harshPest = scoreAspect('pestControl', strategy('economics'), harsh).score;
  const mildPest = scoreAspect('pestControl', strategy('economics'), mild).score;
  assert.ok(harshPest < mildPest);
});

test('threshold boundaries apply at exactly 70 heat and 35 moisture', () => {
  const at = value => scoreAspect('waterHeat', strategy('economics'), fixtureInputs({ heatIndex: { value, source: 'test' } })).score;
  assert.equal(at(69) - at(70), 15);
  const wet = value => scoreAspect('waterHeat', strategy('economics'), fixtureInputs({ surfaceMoisture: { value, source: 'test' } })).score;
  assert.equal(wet(35) - wet(34), 15);
});

test('a missing required input produces an explicit unavailable aspect', () => {
  const inputs = fixtureInputs({ surfaceMoisture: missing, soilWetness: missing });
  const aspect = scoreAspect('waterHeat', strategy('environmental'), inputs);
  assert.equal(aspect.status, 'unavailable');
  assert.equal(aspect.score, null);
  assert.equal(aspect.confidence, 'low');
  assert.match(aspect.assumptions[0], /soil moisture unavailable/);

  const result = scoreStrategy('environmental', inputs);
  assert.deepEqual(result.overall.excluded, ['waterHeat']);
  const complete = scoreStrategy('environmental', fixtureInputs());
  assert.ok(
    ['low', 'medium', 'high'].indexOf(result.overall.confidence) <
      ['low', 'medium', 'high'].indexOf(complete.overall.confidence)
  );
});

test('a missing optional input lowers confidence and never scores better than favorable evidence', () => {
  for (const [key, aspectId] of [['heatIndex', 'waterHeat'], ['pestPressure', 'pestControl'], ['erosionRisk', 'soilHealth']]) {
    for (const item of STRATEGIES) {
      const unknown = scoreAspect(aspectId, item, fixtureInputs({ [key]: missing }));
      const favorable = scoreAspect(aspectId, item, fixtureInputs({ [key]: { value: 0, source: 'test' } }));
      assert.equal(unknown.status, 'scored');
      assert.ok(unknown.score <= favorable.score, `${item.id}.${aspectId} with missing ${key}`);
      assert.notEqual(unknown.confidence, 'high');
      assert.ok(unknown.assumptions.length > 0);
    }
  }
});

test('overall score excludes unavailable aspects, renormalizes weights, and needs three scored aspects', () => {
  const aspects = [
    { aspect: 'yield', status: 'scored', score: 80, confidence: 'high' },
    { aspect: 'waterHeat', status: 'unavailable', score: null, confidence: 'low' },
    { aspect: 'soilHealth', status: 'scored', score: 40, confidence: 'high' },
    { aspect: 'pestControl', status: 'scored', score: 60, confidence: 'medium' },
    { aspect: 'feasibility', status: 'unavailable', score: null, confidence: 'low' }
  ];
  const weights = OBJECTIVE_WEIGHTS.environmental;
  const result = overallScore(aspects, weights);
  const expected = (80 * 0.10 + 40 * 0.35 + 60 * 0.15) / (0.10 + 0.35 + 0.15);
  assert.equal(result.score, Math.round(expected));
  assert.equal(result.confidence, 'low');
  assert.deepEqual(result.excluded, ['waterHeat', 'feasibility']);

  aspects[0].status = 'unavailable';
  assert.deepEqual(overallScore(aspects, weights), {
    status: 'unavailable', score: null, confidence: 'low', excluded: ['yield', 'waterHeat', 'feasibility']
  });
});

test('on the same field, each objective ranks its own strategy first', () => {
  const inputs = fixtureInputs();
  const rankings = Object.keys(OBJECTIVE_WEIGHTS).map(objective => compareStrategies(inputs, objective).ranking[0]);
  assert.deepEqual(rankings, ['environmental', 'economics', 'pestControl']);

  const aspectScores = compareStrategies(inputs, 'economics').results.map(result => result.aspects.map(item => item.score));
  const sameAspects = compareStrategies(inputs, 'environmental').results.map(result => result.aspects.map(item => item.score));
  assert.deepEqual(aspectScores, sameAspects, 'weights change the overall, not the aspect scores');
});

test('field history changes the plan: repeating last season’s crop is flagged for pests', () => {
  const afterCorn = scoreStrategy('economics', fixtureInputs());
  const afterSoy = scoreStrategy('economics', fixtureInputs({ lastCrop: { value: 'soybeans', source: 'test' } }));
  assert.equal(afterCorn.plannedCrop, 'corn');
  assert.equal(afterSoy.plannedCrop, 'soybeans');
  const environmental = scoreStrategy('environmental', fixtureInputs());
  assert.equal(environmental.plannedCrop, 'soybeans');
  const pest = name => scoreStrategy(name, fixtureInputs()).aspects.find(item => item.aspect === 'pestControl').score;
  assert.ok(pest('pestControl') > pest('economics'));
});

test('farmer and technical descriptions share identical scores', () => {
  for (const result of compareStrategies(fixtureInputs({ heatIndex: missing })).results) {
    const farmer = describeStrategy(result, 'farmer');
    const technical = describeStrategy(result, 'technical');
    assert.deepEqual(farmer.overall, technical.overall);
    assert.deepEqual(
      farmer.aspects.map(({ aspect, status, score, confidence }) => ({ aspect, status, score, confidence })),
      technical.aspects.map(({ aspect, status, score, confidence }) => ({ aspect, status, score, confidence }))
    );
    assert.ok(farmer.benefit && farmer.tradeOff && farmer.constraint);
    assert.equal(farmer.weights, undefined);
    assert.ok(technical.weights && technical.aspects.every(item => Array.isArray(item.assumptions)));
  }
});

test('uses a NASA POWER wetness observation when available and ignores null values', () => {
  const observation = {
    variable: 'surface_soil_wetness',
    value: 0.2,
    source: { provider: 'NASA POWER' },
    temporal: { date: '2026-11-10' },
    quality: { status: 'available' }
  };
  const inputs = buildFieldInputs({ field: northField, locationProfile: charlotte, observations: [observation], questionnaire });
  assert.equal(inputs.soilWetness.value, 0.2);
  assert.match(inputs.soilWetness.source, /NASA POWER 2026-11-10/);
  const aspect = scoreAspect('waterHeat', strategy('economics'), inputs);
  assert.ok(aspect.inputsUsed[0].startsWith('Surface soil wetness index'));

  const empty = buildFieldInputs({
    field: northField,
    locationProfile: charlotte,
    observations: [{ ...observation, value: null, quality: { status: 'unavailable' } }],
    questionnaire
  });
  assert.equal(empty.soilWetness.value, null);
});
