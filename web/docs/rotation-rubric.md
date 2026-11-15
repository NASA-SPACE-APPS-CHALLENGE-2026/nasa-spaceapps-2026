# Rotation Explorer rubric

> **Placeholder rubric, not a forecast.** Every baseline, threshold and adjustment below was written for the hackathon and has not been reviewed by agronomists. The scores do not predict yield, profit or pest outcomes. Each card says "Estimated with a placeholder rubric, not a yield or profit forecast" until a review has happened.

The code is pure and deterministic (no clock, network or randomness), so the same inputs always give the same scores:

| File | What it does |
| --- | --- |
| `lib/domain/management.ts` | Questionnaire answers (Layer 3) and their zod schema |
| `lib/domain/rotation/inputs.ts` | Gathers each input with its provider and honesty label |
| `lib/domain/rotation/agronomy.ts` | Crop families, seasons, pest hosts and the usual-month calendar |
| `lib/domain/rotation/strategies.ts` | Builds the three strategies from the field's crop history |
| `lib/domain/rotation/coverCrops.ts` | Cover-crop rule table and ranking |
| `lib/domain/rotation/score.ts` | The four bars, the weights and the best fit |
| `lib/domain/rotation/citations.ts` | Published sources |

Tests are in `tests/unit/rotation.test.ts` and `tests/unit/plan.test.ts`.

## Inputs

| Input | From | Label | Required by |
| --- | --- | --- | --- |
| Crop history (this season + 1–5 earlier) | Fields tab: the farmer, or USDA CDL until confirmed | You entered / Check this info | All strategies (this season's crop); diversity and pests (at least one earlier season) |
| Monthly temperature and rain normals, 1991–2020 | NASA POWER climatology (in the POWER result as `climate`) | Estimated | Climate fit |
| Rain in the last 30 days, and normal rain for those dates | NASA POWER daily | Estimated | Optional (cover-crop climate fit) |
| Satellite rain in the last 30 days | GPM IMERG (key `imergRain30`) | Estimated | Optional (cover-crop climate fit) |
| Surface soil moisture | SMAP (key `smapLatest`) | Estimated | Optional (cover-crop climate fit) |
| Average slope | USGS 3DEP | Estimated | Optional (soil-cover weight) |
| Organic matter | Soil test if entered, else SSURGO | You entered / Estimated | Shown with the inputs |
| Tillage, irrigation, cover-crop experience, livestock, small-grain equipment and market, known problems, harvest month | Questionnaire | You entered | Optional |

Only profiles that match the field's current boundary (`geometryHash`) are used. "Not sure" and an unanswered question are treated the same way.

## Strategies

The farmer's own pattern is the shortest repeating cycle (1–3 seasons) that matches the most recent run of known seasons. For example, corn, soybeans, corn, soybeans gives the cycle "corn, soybeans". Each strategy plans the next three seasons (2027–2029 when the current season is 2026).

| Strategy | Seasons | Practice changes (tie-break only) |
| --- | --- | --- |
| Keep your rotation | The cycle, continued | 0 |
| Add a cover crop | The same cash crops, with the top-ranked cover crop seeded at each harvest and ended the month before the next planting. Gaps followed by a fall-sown or perennial crop get no cover. Covers start after the 2027 harvest, because the fall 2026 seeding window has passed. | 1 |
| Bring in small grains | A small grain is inserted the season after the first legume, or after the first repeated crop. Red clover is underseeded with spring oats, or frost-seeded in March into winter wheat. The grain is winter wheat only when it is not the first planned season, the coldest-month normal is at least 15 °F and the previous crop is off by October; otherwise it is spring oats. If the cycle already has a small grain, the strategy adds red clover after it. | 2 (1 if a small grain is already grown) |

**Calendar** (`agronomy.ts`): usual planting and harvest months for about 40–44° N, simplified from USDA NASS *Usual Planting and Harvesting Dates*. Below 36° N, spring planting and harvest move a month earlier. The farmer's harvest-month answer replaces the usual harvest month for this season's crop. Perennial hay, pasture and alfalfa count as living cover all year.

## The four bars (0–100, higher is better)

Scores are clamped to 0–100 and rounded. Missing inputs follow the team rule from `docs/strategy-rubric.md`:

- A **missing optional input** applies half of the unfavourable adjustment, lowers confidence by one level, and is listed under "missing". Missing data never scores better than a known favourable value. This is tested.
- A **missing required input** leaves the bar unscored (`null`). The page shows "Not enough info" and what is needed, never 0.

### Soil cover
How much of the year living plants cover and hold the soil.

- **Base:** 100 × (living months + ½ × residue months) ÷ 36, over the three planned years.
  - Living months run from the month after planting to harvest, and for a cover from the month after seeding to the month it is ended.
  - A winter-killed cover (oats, radish) counts as living until December and as residue after that.
- **Tillage:** no-till +5; reduced 0; conventional −10; unknown −5 (lower confidence).
- **Harvest month unknown:** the usual month is used, with lower confidence.
- **Sources:** NRCS CPS 340 (cover crop), NRCS CPS 329 (no-till), USDA NASS usual dates.

### Crop diversity
How many crop families and growing seasons the rotation uses.

- **Required:** at least two known seasons.
- **Scoring:**
  - start at 20;
  - +20 per plant family beyond the first, up to +60 (cover species count);
  - +10 for three or more different cash crops;
  - +10 if warm-season and cool-season (or perennial) cash crops are both present;
  - +10 if a cover crop is included.
- **Confidence:** medium when any season is still an unconfirmed CDL detection.
- **Sources:** NRCS CPS 328, Davis et al. 2012 (Marsden Farm).

### Pests & diseases
How well the rotation breaks pest and disease cycles.

- **Required:** at least two known seasons.
- **Scoring:**
  - start at 50;
  - longest run of the same crop that touches a planned season: 1 year +20; 2 years 0; 3 or more −20.
- **Per problem the farmer flagged:**
  - **Corn rootworm** (hosts: corn, sweet corn, popcorn): a host after a host −15; otherwise +10, with a note about the rotation-resistant variant. Source: Gray et al. 2009.
  - **Soybean cyst nematode** (hosts: soybeans, dry beans): a host after a host −15; at least 2 non-host seasons between hosts, or no host planned, +10; 1 non-host season +5. Source: The SCN Coalition.
  - **White mold** (hosts: soybeans, dry beans, sunflower, safflower, canola, mustard, camelina, peas, lentils, chickpeas, potatoes, tomatoes): the same rules as SCN. Source: Peltier et al. 2012.
  - **Herbicide-resistant weeds:** a cool-season or perennial cash crop +10; otherwise a winter-cereal cover +5. Source: Davis et al. 2012.
  - **Problems unknown:** −5, with lower confidence. "None of these" makes no adjustment.
- **Note only:** a living grass cover ended right before corn can carry insects ("green bridge"). Source: SARE.

### Climate fit
How well the crops and covers fit this field's weather. **Required:** NASA POWER monthly normals. Confidence starts at medium, because the normals are for a roughly 50 km grid cell.

- **Keep:** start at 70 (the crops are already grown there).
  - If corn is planned and normal May–August rain is under 12 in: rain-fed −10; supplemental irrigation −3; irrigation unknown −5.
- **Cover crop:** start at 60.
  - **Fall warmth:** fall GDD (base 40 °F) from the first planned harvest, counted as half the harvest month and then each month whose normal mean is at least 40 °F, compared with the scheduled species' need. At least 1.5× the need +20; at least 1× +10; below the need −20.
  - **Spring rain:** if normal April–May rain is under 5 in: rain-fed −10; irrigation unknown −5.
  - **Recent dryness:**
    - It counts as dry when any of these holds: POWER 30-day rain is under 50 % of normal, IMERG is under 50 % of POWER's normal, or SMAP is below 0.15 m³/m³.
    - Dry −5.
    - Unknown (no recent data) −2.5, with lower confidence.
- **Small grains:** start at 65.
  - June mean of 77 °F or higher −10 (heat at grain fill; Farooq et al. 2011).
  - August and September means of 60 °F or higher +10 (clover or a cover has time to establish after a July harvest).
  - Normal March–April rain over 7 in −5 (wet spring delays seeding).

## Weights and best fit

- **Weights:** all four bars weigh 1. Soil cover weighs **2** when the farmer flagged erosion or the average slope is at least 6 %, and the page says why.
- **Overall:** weighted mean of the scored bars, to 1 decimal. It needs at least **3** scored bars, otherwise it is unavailable.
- **Best fit:** the highest overall. Strategies within 1 point of the top count as tied, and the tie goes to the one with fewer practice changes. If no strategy has an overall, there is no best fit, and the page says "No best fit yet" with the reason.
- **Practical points:** equipment, market, cover-crop experience and livestock are shown as caveats and are **not scored**.

## Cover-crop table (`coverCrops.ts`)

| Species | Winter | Coldest-month normal it survives | Fall GDD (base 40 °F) needed | Goals |
| --- | --- | --- | --- | --- |
| Cereal rye | Hardy | −30 °F | 100 | erosion, weeds, scavenge, grazing |
| Winter wheat cover | Hardy | −15 °F | 150 | erosion, grazing, scavenge |
| Oats | Winter-kills | n/a | 500 | erosion, grazing, scavenge |
| Forage radish | Winter-kills | n/a | 600 | compaction, scavenge |
| Hairy vetch | Hardy | 10 °F | 500 | nitrogen, erosion |
| Crimson clover | Tender | 25 °F | 600 | nitrogen, erosion |
| Red clover | Hardy | −30 °F | n/a (sown into a small grain) | nitrogen, erosion, grazing |

**Ranking:**
- A species that fits the climate gets +10; one that doesn't gets −10. Without climate data none are marked as fitting: the most forgiving species (need of 150 or less) get +2 and the others −2.
- **Before corn:** legumes +4; winter-killed species +3; cereal rye −2 (nitrogen tie-up; end it early).
- **Before soybeans:** a hardy winter cereal +4; legumes −2.
- Red clover is offered only after a small grain, and gets +6 there.
- The same family as the next crop (other than grasses) gets −1.
- **Goals from the answers:** erosion (problem, or slope ≥ 6 %) and weeds +2; grazing (livestock), compaction (wet spots) and scavenging +1.

Example, a field near Ames, Iowa (POWER normals, October harvest): fall GDD is about 166, so cereal rye and winter wheat fit, and oats and radish don't (they need an August or early September seeding). After a July oat harvest there are more than 2,000 GDD, so everything except crimson clover fits (Iowa winters are too cold for it).

## Sources

| Id | Source |
| --- | --- |
| nrcs-340 | USDA NRCS Conservation Practice Standard 340, Cover Crop |
| nrcs-328 | USDA NRCS Conservation Practice Standard 328, Conservation Crop Rotation |
| nrcs-329 | USDA NRCS Conservation Practice Standard 329, Residue and Tillage Management, No-Till |
| sare-mccp | USDA SARE, *Managing Cover Crops Profitably*, 3rd edition |
| mccc | Midwest Cover Crops Council decision tools and species guides |
| davis-2012 | Davis et al. 2012, PLOS ONE 7(10): e47149 (Marsden Farm rotation study) |
| gray-2009 | Gray et al. 2009, Annual Review of Entomology 54 (western corn rootworm) |
| scn-coalition | The SCN Coalition |
| peltier-2012 | Peltier et al. 2012, Journal of Integrated Pest Management 3(2) (Sclerotinia stem rot) |
| farooq-2011 | Farooq et al. 2011, Critical Reviews in Plant Sciences 30(6) (heat stress in wheat) |
| nass-dates | USDA NASS, *Field Crops Usual Planting and Harvesting Dates* (Agricultural Handbook 628) |

The DOIs were checked against doi.org. The SARE, MCCC and NASS links return 200. The NRCS links could not be fetched from the build machine: nrcs.usda.gov refused scripted requests. Open them in a browser to confirm.

## Acceptance checks for `/rotation`

Automated checks are in `tests/e2e/rotation.spec.ts` (desktop and phone) and the unit tests. Manual checks are in a browser.

1. Every bar shows its label and either a number out of 100 or "Not enough info". The meter has `aria-valuetext`, so the meaning never depends on colour.
2. There is exactly one "Best fit" badge, or none plus a "No best fit yet" explanation when no strategy has 3 scored bars.
3. Every reason and every caveat lists at least one source: a citation link, a field-profile value with its honesty label, or the farmer's answer.
4. Missing data shows as missing. Climate is "Not enough info" without POWER, and the inputs list says "Not available". Nothing is ever filled with 0.
5. Missing answers never raise a score, and they lower the confidence shown under the bar.
6. With public data lookups off, scores fall back to the questionnaire and crop history, and a note says so.
7. A soil-test organic matter value replaces the soil-survey value and is labelled "You entered".
8. There is no horizontal scroll at 390 px wide. Strategy cards stack on phones and sit side by side from 1024 px.
9. Everything is reachable by keyboard: questionnaire radios and checkboxes, Next and Back, the field picker, strategy links, and Make this my plan. Focus moves to each new step's heading.
10. "Make this my plan" opens the Planner with that plan, and edits survive a reload.
11. Opening `/rotation` without `?field=` reopens the last field the farmer worked on.

## Open questions for domain review

1. Are the bar baselines (soil-cover arithmetic, 20/50/60/65/70 starts) and adjustment sizes reasonable?
2. Should residue from a winter-killed cover count as half a month of cover, more, or less?
3. Are the fall GDD needs right for each cover species? Should they come from the MCCC tool by county instead?
4. Is a one-month southern shift of the calendar good enough, or should planting dates come from NASS by state?
5. Should SCN and white-mold breaks require two non-host years before scoring +10?
6. Should IMERG and SMAP feed more than a small "dry right now" adjustment, given their 10 km and 9 km pixels?
7. Should feasibility (equipment, market, labour) be scored, or stay as caveats?
