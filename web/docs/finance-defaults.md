# Finance defaults and rules

The Finance tab and the Scenario Simulator start from the numbers below. A farmer can change any of them under **Finance → Your numbers**. A changed number is shown as "You entered" and always wins over the default. All values live in `lib/domain/finance/assumptions.ts`, and each one carries its source, date and confidence. The Transparency section of the Finance tab lists the ones used in a result.

Values were read on 2026-11-15.

## Sources

| Source | What it supplies | Confidence |
|---|---|---|
| Iowa State University, Ag Decision Maker A1-20, *Estimated Costs of Crop Production in Iowa – 2026* (FM 1712, Jan 2026) | Yields, seed, fertilizer rates and prices, herbicide, insecticide, crop insurance, machinery, drying, hauling, labor, interest | High |
| USDA WASDE, Nov 10, 2026 (2026/27 season-average farm prices) | Corn $4.60, soybeans $12.10, all wheat $6.20 per bushel | Medium (projection) |
| ISU *Cash Rental Rates for Iowa 2026 Survey* (FM 1851) | Cash rent $270/ac (state average) | High |
| Iowa NRCS FY2026 EQIP payment schedule, Cover Crop (340), single species, via hellogravel.com | $74.34/ac/yr; $89.20/ac/yr for historically underserved producers, which includes beginning farmers | Medium (third-party summary of the official schedule) |
| USDA NASS Agricultural Prices, via the Wisconsin Farm Reporter | Oats $3.88/bu (Wisconsin, May 2026). No Iowa oat price was found. | Low |
| USDA FSA Microloans | Operating microloans up to $50,000 | High |
| Iowa Department of Agriculture and Land Stewardship (IDALS), cover crop cost-share sign-up, May 13, 2025 | Iowa cost share: $30/ac first-time cover crop users, $20/ac returning users, up to 160 ac per participant | Medium (2025 rates; no confirmed 2026 statewide rate) |
| IDALS Crop Insurance Discount Program sign-up, Dec 1, 2025 | $5/ac off the crop insurance premium for fall-planted cover crops (2026 premiums), no acreage cap; acres in other IDALS or NRCS cost share don't qualify | Medium |
| The farmer | CSP contract payment and contract years, cover crop grazing or forage value. NRCS publishes no per-acre CSP cover crop rate, and the NRCS pages couldn't be read from the build machine, so nothing is filled in. | High once entered |
| NASA POWER monthly point data, 1985–2024 | Rain and the hottest daily high in each month, for the farm's largest field | Live data |
| PlotTwist estimate | Values with no published budget, listed below | Low. Check these locally. |

## How the ISU budgets map onto the engine

- **Corn after soybeans** uses the 211 bu/ac column: 159 lb N, 79 lb P₂O₅ and 63 lb K₂O at $0.53, $0.72 and $0.39 per lb. Machinery is $59.40 before harvest and $136.97 for harvest including drying. Labor is $52.02. With ISU's $274 land charge the total is **$911.98/ac**.
- **Corn after corn** uses the 193 bu/ac column. It adds 35 lb more N, a $25 insecticide, a chisel pass and more labor. Total **$960.02/ac**.
  - The 18 bu yield gap and the 35 lb N gap between these two budgets are PlotTwist's rotation effect and soybean nitrogen credit. Both come straight from ISU.
- **Herbicide-tolerant soybeans after corn** uses the 61 bu/ac column. Total **$679.11/ac**.
- **Operating interest** is 7.47% for 8 months on pre-harvest cash costs. That base includes 41% of pre-harvest machinery, which is ISU's variable share.
- `tests/unit/finance.test.ts` checks that the engine reproduces all three ISU totals.
- **Small grains (oats):**
  - From the ISU oat-companion budget: 80 bu/ac, 1 ton straw, $35.18 seed, 60 lb N, $4.10 insurance, $35.30 pre-harvest machinery and $41.31 combining and hauling.
  - PlotTwist estimates: P and K replacement, herbicide, straw value and baling, and labor.
  - Barley, rye and triticale use the oats budget.
  - Winter, spring and durum wheat use their own yield, price, seed and N, and the oats budget for everything else.

## PlotTwist estimates (low confidence)

| Value | Default |
|---|---|
| Oat straw price | $80/ton |
| Oats P₂O₅ / K₂O | 25 / 45 lb/ac |
| Small-grain herbicide | $15/ac |
| Straw baling and hauling | $30/ac |
| Small-grain labor | $40.80/ac (2 h) |
| Wheat yield / seed / N | 70 bu, $45, 90 lb |
| Cover crop seed (cereal rye) | $18/ac; legume covers +$20 |
| Cover crop seeding / ending | $16.50 / $12 per acre |
| Corn yield drag after cereal rye | 2% |
| N credit from a legume cover before corn | 40 lb N/ac |
| Second crop of a double crop | 75% of a full-season soybean yield |
| EQIP cover crop contract length | 3 years, paid for new cover crop acres only (years where the current rotation had no cover) |
| Stress-year yield loss | corn 20%, soybeans 15%, small grains 15% |
| Good-year yield gain | 6% |
| Tillage (Simulator) | reduced tillage saves 15% and no-till 30% of pre-harvest machinery |
| Irrigation | +12% yield, +$55/ac |

## Weather stress rules (40 years of NASA POWER)

These are planning rules applied to monthly data, not a crop model. Rain percentages compare each month with the field's own 1985–2024 average for that month.

| Crop | Stress year | Good year |
|---|---|---|
| Corn | Any of: July rain < 60%; July + August rain < 60%; a July day ≥ 38 °C (100 °F); June rain > 200% (flooding) | July–August rain 80–140% and no July day ≥ 35 °C |
| Soybeans | Any of: August rain < 50%; July + August rain < 60%; an August day ≥ 38 °C; June rain > 200% | August rain 80–140% and no August day ≥ 35 °C |
| Small grains | Any of: May + June rain < 50% or > 170%; a June day ≥ 35 °C | May–June rain 80–140% |

On the recorded Ames, Iowa history, 2012 is a corn stress year (a July high of 42 °C).

**Weather risk** replays every historical year's classification over the whole plan. The results are:

- Typical: the median of the 40 average yearly net returns.
- Good and bad: the 80th and 20th percentiles.
- Losing years: how many of the 40 come out below zero.
- Worst year: the lowest of the 40.

## Net return formula

Finance follows this formula. The **How net return is calculated** section of the Finance tab fills it in line by line, per acre per year, averaged over the seasons that have budgets.

```
Net return/ac = crop revenue (yield × price, plus byproducts such as cottonseed, straw, forage or grazing)
              + program payments (EQIP/CSP/state cost share, only in funded years)
              + insurance premium discounts where they exist
              − seed − fertilizer (N, P, K, lime) − chemicals
              − cover-crop costs (seed, seeding pass, termination pass)
              − machinery, fuel, labor, insurance, misc
              − land cost if rented
```

Two more costs from the Iowa State budgets are kept as their own lines, marked †: operating-loan interest and irrigation (irrigated fields only).

### Programs: one per acre

The farmer chooses one cover crop program under **Your numbers → Programs and savings**. The same cover crop acres can't get EQIP, Iowa cost share and the Iowa insurance discount at once.

| Program | Who gets it | Amount | When the money comes |
|---|---|---|---|
| EQIP (default) | PlotTwist plan only: new cover crop acres, where the current rotation has none | $74.34/ac/yr ($89.20 beginning farmer), up to 3 years | Winter after seeding |
| Iowa cost share | Cover crop acres in both columns | $30/ac in the farm's first cover crop year if it grows none today, otherwise $20/ac; up to 160 ac a year, best-paying acres first | Winter after seeding |
| Iowa insurance discount | Cover crop acres in both columns | $5/ac off the next year's premium; a discount that falls after the last plan year isn't counted | Summer of the next year |
| None | — | — | — |

**CSP** is a whole-farm contract, so it adds to any of these. The farmer enters the yearly payment and, optionally, the contract years left. It is counted with the PlotTwist plan only (a contract the farmer already has would be the same in both columns), and only in years with budgeted acres.

**Cover crop grazing or forage** is the farmer's own $/ac value. It is added as revenue in fall in each season with a cover crop, and only when entered.

## What the results mean

- **Current rotation:** the repeating pattern found in the field's crop history, carried forward.
- **PlotTwist plan:** the field's most recently changed Planner plan. Years after the plan's last year repeat the plan's own pattern. A field with no plan uses its current rotation in both columns.
- **Headline range:** the lowest and highest per-acre difference when prices or yields move ±10%.
- **Cash flow:** each season's money in and out.
  - Seed, fertilizer, chemicals, pre-harvest machinery and half the rent go out in spring.
  - Insurance and labor go out in summer.
  - Harvest costs, interest, the other half of the rent and cover crop seeding go out in fall.
  - Small-grain sales come in during summer and row-crop sales in fall.
  - EQIP pays in the winter after the cover crop is seeded.
  - **Break-even:** the first season after which the plan is never behind the current rotation again.
  - **Deepest dip:** the most the plan is ever behind.
- **Confidence per result:** the lowest confidence among the values the result used. A value the farmer entered counts as high.
