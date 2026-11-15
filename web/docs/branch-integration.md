# AP / main integration audit

## Git starting point

- Clean working tree on `AP-Changes`, commit `4193592`.
- Fetched `origin/main` at `c217d51`; local `main` remains `2aa8a47`.
- Common ancestor: `263144da79dce6326e0004077f603e5837aebb99`.
- Divergence: three AP commits and seven main commits since the ancestor (main history includes its earlier integration merge).
- Original AP work protected by both `AP-Changes` and `backup/AP-Changes-before-integration-20261115`.
- Created `AP-Branch` from AP-Changes to honor the requested destination; merged `origin/main` there. No remote push.

## Ownership and conflicts

| Area | Decision |
|---|---|
| Overview | Main’s OverviewScreen, summaries, field/environment cards and schedule links retained. |
| Fields / Imports | Main’s map, address lookup, crop histories, geometry, editing/imports and persistence retained. |
| Rotation Explorer | Main’s scoring, questionnaire, recommendations, score explanations and strategy IDs retained. AP’s custom Simulator scoring additions removed with its competing engine. |
| Planner | Main’s tasks, timeline, drag-and-drop, crop/cover editing, plan IDs and persistence retained. |
| Simulator | Main’s field/history/Planner workflow; AP comparison-card, paired-bar, legend, chart tooltip and cover-timeline presentation adapted to the integrated ecological model. |
| Finance | Main’s ISU-budget, whole-farm, cash-flow, sensitivity, risk, transparency and cost-share calculations retained. AP annual/cumulative financial chart code adapted to main’s result data for the explicit field-scenario view. |
| Shared state | Main’s store/repositories are primary. Added compatibility reader for AP’s per-field financial profiles; retained original localStorage records. |

Git reported nine conflicted files: the Finance and Simulator route/screen files, StoreProvider, store, repository interface/local implementation, and finance unit tests. These were resolved intentionally using main as the foundation. Auto-merged rotation/types/test files were reviewed and main’s versions chosen where AP’s old engines no longer applied. No whole-repository replacement was performed. Core integration passed a production build before ecological feature development.

## Architectural findings

Both branches use Next.js 15 / React 19 / TypeScript and the same design tokens, field model, localStorage repositories and crop catalog. AP’s finances used per-field manually entered budgets; main uses one farm-wide documented parameter engine. AP’s simulator compared a three-year recommendation rubric; main supports editable current crops against Planner over three/five years. Keeping both engines would create conflicting assumptions and persistence. The final code has one budget engine and one separate ecological analysis module.

Main’s old numeric fields committed on blur. They now commit valid numbers on change while retaining safe draft handling. Legacy simulator/finance acreage could override mapped acreage; those values are now inactive unless a scenario override is explicitly enabled. No hardcoded corn yield of 3 or soybean price of 3 was found in the source defaults. Saved inputs remain distinguishable from references and are not silently replaced. The old “earns more” Simulator prose was removed; the Finance scenario view distinguishes higher net return from smaller losses.

The duplicate AP financial/scoring engines and their obsolete tests were removed, with source recoverable on the backup branch. Main’s arbitrary erosion-score formula was also removed from the financial simulator; the ecological page uses transparent qualitative factors instead of interpreting that score as physical soil loss.

## Validation

Final command results and browser coverage are recorded in the delivery report. New unit tests cover nutrient arithmetic, missing inputs, crop-specific Finance compatibility, Planner dates, winter cover, leap years, diversity, legacy migrations and canonical acreage. Browser tests exercise immediate updates, saved inputs, field switching, Planner edits, the Finance handoff and widths 390/768/1440. Third-party API responses are mocked in browser tests; live Earthdata credentials are not verified.

Validated before the Imports follow-up: production build, TypeScript, lint and 160 unit tests passed. Four focused browser tests passed in installed Chrome (desktop and phone), covering the ecological controls, field isolation, persistence, Finance handoff, responsive widths and Planner date edits. The full existing end-to-end suite has not yet been run.
