(function attachFieldShiftStrategies(root) {
  'use strict';

  // Every number in this module is a placeholder heuristic for the demo. See
  // docs/strategy-rubric.md before treating any score as agronomic guidance.
  const SCORE_MIN = 0;
  const SCORE_MAX = 100;
  const CONFIDENCE_LEVELS = ['low', 'medium', 'high'];
  const MIN_SCORED_ASPECTS = 3;

  const ASPECTS = Object.freeze([
    Object.freeze({ id: 'yield', label: 'Yield' }),
    Object.freeze({ id: 'waterHeat', label: 'Water / heat' }),
    Object.freeze({ id: 'soilHealth', label: 'Soil health' }),
    Object.freeze({ id: 'pestControl', label: 'Insect & pest control' }),
    Object.freeze({ id: 'feasibility', label: 'Feasibility' })
  ]);

  const OBJECTIVE_WEIGHTS = Object.freeze({
    environmental: Object.freeze({ yield: 0.10, waterHeat: 0.25, soilHealth: 0.35, pestControl: 0.15, feasibility: 0.15 }),
    economics: Object.freeze({ yield: 0.35, waterHeat: 0.15, soilHealth: 0.10, pestControl: 0.10, feasibility: 0.30 }),
    pestControl: Object.freeze({ yield: 0.15, waterHeat: 0.15, soilHealth: 0.15, pestControl: 0.40, feasibility: 0.15 })
  });

  const OBJECTIVE_LABELS = Object.freeze({
    environmental: 'Environmental impact',
    economics: 'Farm economics',
    pestControl: 'Insect & pest control'
  });

  const HEAT_TOLERANT_CROPS = new Set(['sorghum']);

  const STRATEGIES = Object.freeze([
    Object.freeze({
      id: 'environmental',
      objective: 'environmental',
      title: 'Rotate + winter cover crop',
      coverCrop: true,
      changeEffort: 2,
      pestFocus: false,
      planCrop: inputs => nextRotationCrop(inputs),
      benefit: 'Keeps living roots and cover on the ground between cash crops, which can help protect soil.',
      tradeOff: 'A cover crop uses some spring water and adds a planting and termination pass.',
      constraint: 'Needs seed, a planting window after harvest, and a spring termination plan.'
    }),
    Object.freeze({
      id: 'economics',
      objective: 'economics',
      title: 'Keep the current crop, plan inputs carefully',
      coverCrop: false,
      changeEffort: 0,
      pestFocus: false,
      planCrop: inputs => inputs.lastCrop.value,
      benefit: 'Uses the equipment, markets, and know-how you already have.',
      tradeOff: 'Planting the same crop again can let some pests and diseases build up.',
      constraint: 'Input prices and local buyer contracts still decide whether it pays.'
    }),
    Object.freeze({
      id: 'pestControl',
      objective: 'pestControl',
      title: 'Break the pest cycle with a new crop family',
      coverCrop: false,
      changeEffort: 2,
      pestFocus: true,
      planCrop: inputs => inputs.lastCrop.value === 'sorghum' ? 'oats' : 'sorghum',
      benefit: 'Switching crop families can interrupt pests that depend on last season’s crop.',
      tradeOff: 'A less familiar crop can mean a learning curve and different equipment settings.',
      constraint: 'Check for a nearby buyer and seed supply before committing acres.'
    })
  ]);

  function clamp(value) {
    return Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(value)));
  }

  function lowerConfidence(level, steps = 1) {
    return CONFIDENCE_LEVELS[Math.max(0, CONFIDENCE_LEVELS.indexOf(level) - steps)];
  }

  function hasValue(input) {
    return Boolean(input) && input.value !== null && input.value !== undefined;
  }

  function normalizeCrop(name) {
    if (typeof name !== 'string' || !name.trim()) return null;
    const crop = name.trim().toLowerCase();
    return crop === 'small-grains' ? 'oats' : crop;
  }

  function nextRotationCrop(inputs) {
    const history = hasValue(inputs.rotationHistory) ? inputs.rotationHistory.value : [];
    return history.find(crop => crop !== inputs.lastCrop.value) || null;
  }

  function planStrategy(strategy, inputs) {
    const plannedCrop = hasValue(inputs.lastCrop) ? strategy.planCrop(inputs) : null;
    const lastCrop = hasValue(inputs.lastCrop) ? inputs.lastCrop.value : null;
    const historyKnown = lastCrop !== null && lastCrop !== 'other' && plannedCrop !== null && plannedCrop !== 'other';
    return {
      plannedCrop,
      // null means the rubric cannot tell whether the crop family changes.
      rotationBreak: historyKnown ? plannedCrop !== lastCrop : null,
      heatTolerant: plannedCrop !== null && HEAT_TOLERANT_CROPS.has(plannedCrop),
      familiarCrop: plannedCrop !== null && (plannedCrop === lastCrop ||
        (hasValue(inputs.rotationHistory) && inputs.rotationHistory.value.includes(plannedCrop)))
    };
  }

  function unavailable(aspect, missing) {
    return {
      aspect: aspect.id,
      label: aspect.label,
      status: 'unavailable',
      score: null,
      confidence: 'low',
      inputsUsed: [],
      assumptions: [`Not scored: ${missing.join(', ')} unavailable.`],
      reason: `Not enough evidence to score ${aspect.label.toLowerCase()}.`
    };
  }

  function waterSignal(inputs) {
    if (hasValue(inputs.soilWetness)) {
      return { value: inputs.soilWetness.value * 100, input: describeInput('Surface soil wetness index', inputs.soilWetness) };
    }
    if (hasValue(inputs.surfaceMoisture)) {
      return { value: inputs.surfaceMoisture.value, input: describeInput('Surface moisture', inputs.surfaceMoisture) };
    }
    return null;
  }

  function describeInput(name, input) {
    const value = Array.isArray(input.value) ? input.value.join(' → ') : input.value;
    return `${name}: ${value} (${input.source})`;
  }

  // Each rule starts from a baseline and applies bounded adjustments. A missing
  // optional input applies half of the unfavorable adjustment and lowers
  // confidence, so missing evidence never scores better than known-good evidence.
  const RULES = {
    yield(strategy, plan, inputs) {
      if (!hasValue(inputs.lastCrop)) return { missing: ['last-season crop'] };
      const result = { score: 60, confidence: 'high', inputsUsed: [describeInput('Last-season crop', inputs.lastCrop)], assumptions: [] };
      if (plan.familiarCrop) result.score += 15;
      if (plan.rotationBreak === false) result.score -= 5;
      if (plan.rotationBreak === null) {
        result.score -= 3;
        result.confidence = lowerConfidence(result.confidence);
        result.assumptions.push('Crop-family change is unknown; applied half of the repeat-crop adjustment.');
      }
      if (strategy.coverCrop) result.score -= 5;
      if (hasValue(inputs.heatIndex)) {
        result.inputsUsed.push(describeInput('Heat index', inputs.heatIndex));
        if (inputs.heatIndex.value >= 70 && !plan.heatTolerant) result.score -= 10;
      } else {
        if (!plan.heatTolerant) result.score -= 5;
        result.confidence = lowerConfidence(result.confidence);
        result.assumptions.push('Heat index unavailable; assumed moderate heat exposure.');
      }
      result.reason = plan.familiarCrop
        ? 'A familiar crop keeps more of the farm’s existing know-how.'
        : 'A less familiar crop adds uncertainty to this sample yield lens.';
      return result;
    },

    waterHeat(strategy, plan, inputs) {
      const water = waterSignal(inputs);
      if (!water) return { missing: ['soil moisture'] };
      const result = { score: 50, confidence: 'high', inputsUsed: [water.input], assumptions: [] };
      const irrigation = hasValue(inputs.irrigation) ? inputs.irrigation.value : null;
      if (irrigation) result.inputsUsed.push(describeInput('Irrigation', inputs.irrigation));
      else {
        result.confidence = lowerConfidence(result.confidence);
        result.assumptions.push('Irrigation unknown; assumed rain-fed.');
      }
      if (water.value < 35) result.score -= irrigation === 'irrigated' ? 0 : irrigation === 'supplemental' ? 7 : 15;
      if (hasValue(inputs.heatIndex)) {
        result.inputsUsed.push(describeInput('Heat index', inputs.heatIndex));
        if (inputs.heatIndex.value >= 70) result.score -= plan.heatTolerant ? 5 : 15;
      } else {
        result.score -= plan.heatTolerant ? 3 : 8;
        result.confidence = lowerConfidence(result.confidence);
        result.assumptions.push('Heat index unavailable; assumed moderate heat exposure.');
      }
      if (plan.heatTolerant) result.score += 10;
      if (strategy.coverCrop) result.score -= 5;
      result.reason = water.value < 35
        ? 'The water signal is on the dry side, so water demand matters more.'
        : 'The water signal is in a middle range for this sample.';
      return result;
    },

    soilHealth(strategy, plan, inputs) {
      if (!hasValue(inputs.soilTexture)) return { missing: ['soil texture'] };
      const result = { score: 45, confidence: 'high', inputsUsed: [describeInput('Soil texture', inputs.soilTexture)], assumptions: [] };
      if (strategy.coverCrop) result.score += 25;
      if (plan.rotationBreak) result.score += 10;
      if (inputs.soilTexture.value === 'sandy') result.score -= 5;
      if (hasValue(inputs.erosionRisk)) {
        result.inputsUsed.push(describeInput('Erosion index', inputs.erosionRisk));
        if (inputs.erosionRisk.value >= 60 && !strategy.coverCrop) result.score -= 10;
      } else {
        if (!strategy.coverCrop) result.score -= 5;
        result.confidence = lowerConfidence(result.confidence);
        result.assumptions.push('Erosion index unavailable; assumed moderate erosion exposure.');
      }
      result.reason = strategy.coverCrop
        ? 'Winter cover keeps roots and residue on the soil.'
        : 'Bare ground between crops gives the soil less protection.';
      return result;
    },

    pestControl(strategy, plan, inputs) {
      if (!hasValue(inputs.lastCrop)) return { missing: ['last-season crop'] };
      const result = { score: 50, confidence: 'high', inputsUsed: [describeInput('Last-season crop', inputs.lastCrop)], assumptions: [] };
      if (hasValue(inputs.rotationHistory)) result.inputsUsed.push(describeInput('Field rotation history', inputs.rotationHistory));
      if (plan.rotationBreak === true) result.score += 25;
      else if (plan.rotationBreak === false) result.score -= 10;
      else {
        result.score -= 5;
        result.confidence = lowerConfidence(result.confidence);
        result.assumptions.push('Crop-family change is unknown; applied half of the repeat-crop adjustment.');
      }
      if (strategy.pestFocus) result.score += 10;
      if (hasValue(inputs.pestPressure)) {
        result.inputsUsed.push(describeInput('Pest pressure index', inputs.pestPressure));
        if (inputs.pestPressure.value >= 70) result.score -= plan.rotationBreak ? 5 : 15;
      } else {
        result.score -= plan.rotationBreak ? 3 : 8;
        result.confidence = lowerConfidence(result.confidence);
        result.assumptions.push('Pest pressure unavailable; assumed moderate pressure.');
      }
      result.reason = plan.rotationBreak
        ? 'A different crop family can break pest and disease cycles.'
        : 'Keeping the same crop gives crop-specific pests another season of food.';
      return result;
    },

    feasibility(strategy) {
      return {
        score: 90 - strategy.changeEffort * 15,
        confidence: 'medium',
        inputsUsed: [`Practice changes required: ${strategy.changeEffort} (strategy definition)`],
        assumptions: ['Equipment, labor, seed supply, and buyer access are not known for this farm.'],
        reason: strategy.changeEffort === 0
          ? 'No new practices are needed.'
          : 'New practices add planning, equipment, or market steps.'
      };
    }
  };

  function scoreAspect(aspectId, strategy, inputs) {
    const aspect = ASPECTS.find(item => item.id === aspectId);
    if (!aspect) throw new RangeError(`Unknown aspect: ${aspectId}`);
    const raw = RULES[aspect.id](strategy, planStrategy(strategy, inputs), inputs);
    if (raw.missing) return unavailable(aspect, raw.missing);
    return {
      aspect: aspect.id,
      label: aspect.label,
      status: 'scored',
      score: clamp(raw.score),
      confidence: raw.confidence,
      inputsUsed: raw.inputsUsed,
      assumptions: raw.assumptions,
      reason: raw.reason
    };
  }

  // Unavailable aspects are excluded and the remaining weights renormalized;
  // overall confidence drops one level per unavailable aspect.
  function overallScore(aspects, weights) {
    const scored = aspects.filter(item => item.status === 'scored');
    const excluded = aspects.filter(item => item.status !== 'scored').map(item => item.aspect);
    if (scored.length < MIN_SCORED_ASPECTS) {
      return { status: 'unavailable', score: null, confidence: 'low', excluded };
    }
    const totalWeight = scored.reduce((sum, item) => sum + weights[item.aspect], 0);
    const score = scored.reduce((sum, item) => sum + item.score * weights[item.aspect], 0) / totalWeight;
    const weakest = scored.reduce(
      (level, item) => CONFIDENCE_LEVELS.indexOf(item.confidence) < CONFIDENCE_LEVELS.indexOf(level) ? item.confidence : level,
      'high'
    );
    return { status: 'scored', score: clamp(score), confidence: lowerConfidence(weakest, excluded.length), excluded };
  }

  function findStrategy(strategyId) {
    const strategy = STRATEGIES.find(item => item.id === strategyId);
    if (!strategy) throw new RangeError(`Unknown strategy: ${strategyId}`);
    return strategy;
  }

  function scoreStrategy(strategyId, inputs, objective) {
    const strategy = findStrategy(strategyId);
    const weightsKey = objective || strategy.objective;
    const weights = OBJECTIVE_WEIGHTS[weightsKey];
    if (!weights) throw new RangeError(`Unknown objective: ${weightsKey}`);
    const plan = planStrategy(strategy, inputs);
    const aspects = ASPECTS.map(aspect => scoreAspect(aspect.id, strategy, inputs));
    return {
      id: strategy.id,
      title: strategy.title,
      objective: weightsKey,
      objectiveLabel: OBJECTIVE_LABELS[weightsKey],
      plannedCrop: plan.plannedCrop,
      coverCrop: strategy.coverCrop,
      weights,
      aspects,
      overall: overallScore(aspects, weights),
      benefit: strategy.benefit,
      tradeOff: strategy.tradeOff,
      constraint: strategy.constraint
    };
  }

  function compareStrategies(inputs, objective) {
    const results = STRATEGIES.map(strategy => scoreStrategy(strategy.id, inputs, objective));
    const ranking = results
      .filter(result => result.overall.status === 'scored')
      .sort((a, b) => b.overall.score - a.overall.score)
      .map(result => result.id);
    return { results, ranking };
  }

  // Both modes read the same scoring result; mode only changes the detail shown.
  function describeStrategy(result, mode) {
    const base = {
      id: result.id,
      title: result.title,
      objectiveLabel: result.objectiveLabel,
      plannedCrop: result.plannedCrop,
      coverCrop: result.coverCrop,
      overall: result.overall,
      aspects: result.aspects.map(item => ({
        aspect: item.aspect,
        label: item.label,
        status: item.status,
        score: item.score,
        confidence: item.confidence
      }))
    };
    if (mode === 'farmer') {
      return { ...base, benefit: result.benefit, tradeOff: result.tradeOff, constraint: result.constraint };
    }
    return {
      ...base,
      weights: result.weights,
      aspects: base.aspects.map((item, index) => ({
        ...item,
        weight: result.weights[item.aspect],
        reason: result.aspects[index].reason,
        inputsUsed: result.aspects[index].inputsUsed,
        assumptions: result.aspects[index].assumptions
      }))
    };
  }

  function sourcedValue(value, source) {
    return { value: value === undefined || value === '' ? null : value, source };
  }

  // Maps dashboard state into scoring inputs, keeping the provenance of each value.
  function buildFieldInputs({ field, locationProfile, observations, questionnaire } = {}) {
    const wetness = observations?.find(item => item.variable === 'surface_soil_wetness');
    const wetnessUsable = wetness && wetness.value !== null && wetness.quality?.status !== 'unavailable';
    return {
      lastCrop: sourcedValue(normalizeCrop(questionnaire?.lastCrop), 'field questionnaire'),
      rotationHistory: sourcedValue(
        Array.isArray(field?.rotation) && field.rotation.length ? field.rotation.map(normalizeCrop) : null,
        'sample field history'
      ),
      soilTexture: sourcedValue(field?.soil ?? null, 'sample field record'),
      surfaceMoisture: sourcedValue(Number.isFinite(field?.moisture) ? field.moisture : null, 'sample field record'),
      soilWetness: sourcedValue(
        wetnessUsable ? wetness.value : null,
        wetnessUsable ? `${wetness.source.provider} ${wetness.temporal.date}, grid estimate` : 'NASA POWER'
      ),
      irrigation: sourcedValue(questionnaire?.irrigation ?? null, 'field questionnaire'),
      heatIndex: sourcedValue(locationProfile?.heat ?? null, 'demo location profile'),
      pestPressure: sourcedValue(locationProfile?.pest ?? null, 'demo location profile'),
      erosionRisk: sourcedValue(locationProfile?.erosion ?? null, 'demo location profile')
    };
  }

  const api = Object.freeze({
    ASPECTS,
    OBJECTIVE_LABELS,
    OBJECTIVE_WEIGHTS,
    STRATEGIES,
    buildFieldInputs,
    compareStrategies,
    describeStrategy,
    overallScore,
    scoreAspect,
    scoreStrategy
  });
  root.FieldShiftStrategies = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
