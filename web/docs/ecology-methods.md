# Integrated ecological comparison

The Simulator compares an editable continuation of field crop history with the field’s most recently updated saved Planner plan. It shares crop IDs, field IDs, Finance scenario assumptions and the existing 3/5-year horizon. The default is five years, beginning after the field’s current crop year; the advanced pre-plant setting starts this season. Years beyond a saved plan repeat its crop pattern and are explicitly labeled as estimates. Empty saved years remain unknown. No unsaved recommendation is silently substituted for a saved plan.

## Five indicators

| Indicator | Method and units | Limitations |
|---|---|---|
| Erosion | Qualitative practice comparison: conventional tillage plus vegetation gaps flags exposure; reduced/no-till plus retained residue indicates more protective practices; otherwise mixed/unknown. Shows observed slope when available. | This is an explained screening rule, not a calibrated low/medium/high risk model. No tonnage or soil-specific T is generated. R, K, slope length, calibrated management/practice factors and a soil-specific T are unavailable. Monthly rainfall totals cannot substitute for rainfall erosivity. |
| Organic matter | Qualitative direction: cover crops + retained residue + less disturbance favor accumulation; conventional tillage + removed residue indicates depletion pressure; otherwise uncertain. | No annual percentage, carbon stock, or SOM-to-SOC conversion. Baseline lab/survey SOM is context only. Repeat soil sampling is necessary to establish an actual trend. |
| Nitrogen | Per-year sum of crop-specific fertilizer inputs; harvested grain removal = expected yield × crop N coefficient; partial balance = fertilizer − removal, in lb N/ac. Annual averages divide by the full comparison horizon. | Excludes fixation, mineralization, deposition, manure, whole-plant uptake and losses. A negative legume balance does not imply a fertilizer deficit. Unknown inputs propagate to unavailable totals. Cover biomass N and harvested straw N are unmodeled. |
| Living cover | Merge planned crop and cover intervals at month resolution. Use Planner planting/harvest/cover tasks where identifiable, otherwise the existing regional calendars. Sum actual month lengths, including leap years. | Entire boundary months count; dates and days are approximate, not observed emergence or canopy cover. A gap is not necessarily bare soil. Retained residue is an assumption, not measured surface coverage. Unknown crops or contradictory dates stay unknown. |
| Diversity | Distinct cash-crop catalog types, known families including covers, consecutive transitions sharing a crop, and cover-crop years. | Catalog types are not always unique biological species. Fallow is excluded; double crops count both types. No arbitrary biodiversity score or guarantee of pest suppression. |

The erosion and organic-matter rules operationalize the direction of [NRCS soil-health guidance](https://www.nrcs.usda.gov/conservation-basics/soil/soil-health/soil-health-on-cropland); their specific categorical combinations are application screening rules, not NRCS model outputs. Quantitative erosion requires a suitable implementation and inputs for [RUSLE2](https://www.nrcs.usda.gov/resources/tech-tools/water-erosion-rusle2). T is a tolerance benchmark, not a universal legal limit.

### Nitrogen coefficients and defaults

Grain removal coefficients come from [University of Delaware, Nitrogen Removal by Delaware Crops, Table 1](https://www.udel.edu/academics/colleges/canr/cooperative-extension/fact-sheets/nitrogen-removal-delaware-crops/), read November 15, 2026. They reflect Delaware/Maryland harvest samples collected in 2003–2007 and are reference estimates, not measurements on the selected field.

| Crop/product | lb N per yield unit | Unit basis |
|---|---:|---|
| Corn grain | 0.69 | 56-lb bushel, 15.5% moisture |
| Soybean grain | 3.44 | 60-lb bushel, 13% moisture |
| Winter wheat grain | 1.05 | 60-lb bushel, 13% moisture |
| Barley grain | 0.76 | 48-lb bushel, 14% moisture |

[University of Arkansas Extension FSA2176, Table 1](https://www.uaex.uada.edu/publications/pdf/FSA-2176.pdf) supplies rice (0.57 lb N per 45-lb bushel) and grain sorghum (0.66 lb N/bu). Rice inputs use cwt/ac, so the implemented coefficient is `0.57 × 100 / 45 = 1.266666… lb N/cwt`. For example, 90 cwt/ac removes 114 lb N/ac; 150 lb applied gives a partial balance of 36 lb N/ac. No rice or sorghum yield or fertilizer rate is inferred. These coefficients are planning references, not field measurements or fertilizer recommendations.

The nitrogen panel labels every crop year, distinguishes real zero rates from missing values, and links missing inputs to their controls. Annual averages require every year; partial-year results never become a full-horizon average. Entry and Finance rate provenance is available in calculation details. Missing balances suppress generic leaching screening; rice instead requires water-management review.

No coefficient is silently copied to oats, cotton, spring wheat or unsupported products. Their fertilizer inputs may still be entered and compared. Missing coefficients or yields make removal/balance unavailable. Reference fertilizer rates reuse main’s documented budget assumptions for corn, soybeans, oats and wheat. Explicit crop rates are total applied N: legume credits are not subtracted again. The existing corn-after-legume-cover credit applies only to the reference rate. See [finance-defaults.md](finance-defaults.md).

Qualitative leaching screening flags wet conditions combined with a positive partial balance as elevated concern; wet conditions, sandy texture, or a positive balance separately prompt review. This is an application screening rule informed by [MU Extension’s explanation of leaching](https://extension.missouri.edu/publications/wq262), not an estimate of nitrate loss. Unknown drainage/timing, soil mineral N and legume fixation prevent a complete risk estimate. Irrigation only adds a management caution; no irrigation volume is invented.

### Planner timing

Cash-crop task labels identify the crop; a single unambiguous task may be used for a single-crop season. Fall-sown crops can start in the preceding calendar year. Cover periods carry forward into the following year and stop at the next termination task. Where tasks are absent, regional crop calendars and explicit approximate winter-kill/April termination assumptions apply. Dormancy and establishment success are not simulated. Perennials assume an established stand. Arbitrarily renamed or ambiguous tasks may need review; assumptions are disclosed beneath the timeline.

## Shared state and finance

Mapped acreage is always the default and is never overwritten by Simulator changes. A temporary override requires an explicit checkbox. Legacy acreage remains stored but inactive. Per-acre ecological metrics do not change with field size; field financial totals do.

Simulator assumptions are stored per field in `finance.simulator`; Finance’s explicit field-scenario panel reads the same values. Whole-farm Finance stays a separately labeled baseline. Both its headline (including Overview) and detailed projections are withheld when any crop budget or crop choice is missing; rent-only seasons are not presented as complete returns. Expected yields are baseline assumptions for ecological grain-removal accounting. The financial engine additionally retains its existing crop-history, weather, irrigation and cover-yield adjustments; these are labeled illustrative planning assumptions, not ecological forecasts. Entered crop-specific yields override budget baseline yields before financial weather/irrigation adjustments.

Both branches used `fieldshift.finance` differently. The compatibility reader retains every original AP profile and imports only compatible bushel yields/prices and tenure values. Old detailed cost structures and named scenario presets remain in their original browser storage; they are not silently converted to a different model. The Finance page explains this limitation. Main’s stored farm object takes precedence once present.

## Deliberately unavailable

No precise erosion tonnage/T, organic matter trajectory, nitrate leaching load, phosphorus runoff, greenhouse gas inventory, crop water requirement, or yield forecast is claimed. No new NASA/USDA pipeline was added. Existing field-profile providers, source units, observation windows and resolution remain unchanged. The supplied 2026 Space Apps challenge URL returned HTTP 502 during research; the primary agronomic sources above were accessible.
