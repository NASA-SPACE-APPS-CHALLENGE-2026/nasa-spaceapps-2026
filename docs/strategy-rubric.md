# FieldShift strategy scoring rubric

> **Sample/demo scores — not a forecast.** Every threshold and adjustment below is a placeholder heuristic written for the prototype. The scores do not estimate yield, profit, savings, or pest outcomes, and they have not been reviewed by agronomists. Keep the "Sample/demo score" label on every card until they have been.

The rubric lives in [`strategy-scoring.js`](../strategy-scoring.js). It is pure and deterministic: no DOM, network, randomness, or clock. Tests are in [`tests/strategy-scoring.test.js`](../tests/strategy-scoring.test.js).

## Strategies

Each strategy is a practice bundle tied to one objective. The crop it plans depends on the field history.

| Strategy | Objective | Planned crop | Cover crop | Practice changes |
| --- | --- | --- | --- | --- |
| Rotate + winter cover crop | Environmental impact | First crop in the field's rotation that differs from last season | Yes | 2 |
| Keep the current crop, plan inputs carefully | Farm economics | Same as last season | No | 0 |
| Break the pest cycle with a new crop family | Insect & pest control | Sorghum (oats if last season was sorghum) | No | 2 |

## Five aspects (same order and 0–100 scale on every card; higher is more favorable)

| Aspect | Required input | Optional inputs | Baseline and adjustments (placeholder) |
| --- | --- | --- | --- |
| Yield | Last-season crop | Heat index | 60; +15 familiar crop; −5 same crop again; −5 cover crop; −10 heat ≥ 70 unless the crop is heat tolerant |
| Water / heat | Soil moisture (NASA POWER surface wetness × 100 when available, otherwise the sample field moisture) | Irrigation, heat index | 50; water < 35: −15 rain-fed, −7 supplemental, 0 irrigated; heat ≥ 70: −15 (−5 heat tolerant); +10 heat-tolerant crop; −5 cover crop |
| Soil health | Soil texture | Erosion index | 45; +25 cover crop; +10 crop-family change; −5 sandy; −10 erosion ≥ 60 without cover |
| Insect & pest control | Last-season crop | Field rotation history, pest pressure index | 50; +25 crop-family change, −10 same crop; +10 pest-focused plan; pest ≥ 70: −15 same crop (−5 with change) |
| Feasibility | — | — | 90 − 15 × practice changes; always medium confidence, because equipment, labor, seed supply, and buyer access are unknown |

Scores are rounded and clamped to 0–100.

## Objective weights

Each set of weights sums to 1. A strategy's weighted sample score uses its own objective's weights. Changing the objective changes the weighting, not only the card name. The tests confirm that on the same field each objective ranks its own strategy first.

| Objective | Yield | Water / heat | Soil health | Insect & pest | Feasibility |
| --- | --- | --- | --- | --- | --- |
| Environmental impact | 0.10 | 0.25 | 0.35 | 0.15 | 0.15 |
| Farm economics | 0.35 | 0.15 | 0.10 | 0.10 | 0.30 |
| Insect & pest control | 0.15 | 0.15 | 0.15 | 0.40 | 0.15 |

## Missing or unknown inputs

- **Required input missing:** the aspect is `unavailable`, its score is `null`, its confidence is low, and the card shows "N/A".
- **Optional input missing:** the aspect is still scored, but it takes **half of the unfavorable adjustment** (an assumption of moderate risk), its confidence drops one level, and the assumption is listed. A missing value never scores better than a known favorable value.
- **Last crop is "Another crop":** the rubric cannot tell whether the crop family changes. It applies half of the repeat-crop adjustment and lowers confidence.
- **Weighted score:** unavailable aspects are excluded and the remaining weights are renormalized. Overall confidence is the lowest aspect confidence, lowered one level per excluded aspect. With fewer than three scored aspects, the weighted score is unavailable.
- NASA POWER wetness values that are `null` or marked unavailable are ignored, and the score falls back to the sample field moisture.

## Farmer and technical modes

Both modes render the output of `scoreStrategy()` through `describeStrategy()`. Farmer mode shows the scores plus the benefit, trade-off, and practical constraint. Judge / Tech mode shows the same scores plus the weights, reasons, inputs (with their sources), assumptions, and confidence.

## Open questions for domain review

1. Are the baselines and adjustment sizes reasonable? All of them are invented.
2. The 35 water threshold is applied to the NASA POWER `GWETTOP` index × 100 and to the sample moisture percentage. These are different quantities.
3. The heat, pest, and erosion indices come from the demo location profiles, not observations. Which reviewed data sources could replace them?
4. Should "heat tolerant" cover crops other than sorghum? Should crop families be grouped, for example corn with sorghum as grasses?
5. Is a fixed −5 for cover-crop water use and yield drag appropriate across climates?
6. Feasibility uses one "practice changes" count. It should include equipment, labor, seed availability, and local markets.
7. Are the objective weights the right starting point?
