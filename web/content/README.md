# Landing page copy

All the text on the landing page (`/`) and the field-drawing page (`/plot`) lives in [`site.ts`](site.ts). Each string has a `{{KEY}}` marker in the comment above it. To change some text, find its key in `site.ts` and replace the value. You don't need to touch any components.

The current values are short placeholder copy. Replace any of them.

The page shows the copy itself, not the `{{KEY}}` markers.

Images work the same way. Any `image: null` shows a drawn placeholder. Set a path such as `'/assets/story-1.jpg'` to use a real photo instead. See [`public/assets/README.md`](../public/assets/README.md).

## Every placeholder, by where it appears

### Page-wide

| Key | Where it appears |
|---|---|
| `{{META_TITLE}}` | Browser tab title and search result title |
| `{{META_DESCRIPTION}}` | Search result description |
| `{{SITE_NAME}}` | Header wordmark, the first hero frame (large), menu, footer wordmark |
| `{{SKIP_LINK_LABEL}}` | Keyboard-only link that jumps past the scroll hero (shows on Tab) |

### Header and menu

| Key | Where it appears |
|---|---|
| `{{MENU_LABEL}}` | Menu pill, top right |
| `{{MENU_CLOSE_LABEL}}` | Close button inside the open menu |
| `{{MENU_LINKS}}` | The big links in the open menu (label + target) |

### Calls to action (hero end and closing band)

| Key | Where it appears |
|---|---|
| `{{CTA_LABEL}}` | Green button → `/plot` (default suggestion: "Plot your fields") |
| `{{CTA_SECONDARY_LABEL}}` | Underlined link under the button → `/fields` (also on the /plot error screen) |

### Hero (pinned scroll sequence)

| Key | Where it appears |
|---|---|
| `{{SITE_NAME}}` | Frame 1, 0–12% of the hero scroll |
| `{{HERO_TAGLINE}}` | Frame 2, 12–30% |
| `{{HERO_DESCRIPTION}}` | Frame 3, 30–50% (1–2 sentences) |
| `{{MISSION_LABEL}}` | Pill above frame 4 |
| `{{MISSION}}` | Frame 4, 50–70% |
| `{{HERO_SCROLL_HINT}}` | Small hint at the bottom of frame 1 |
| `{{HERO_ALT}}` | Screen-reader description of the 3D scene |

The CTA pair is frame 5. It appears at 70% and stays.

### What you can do (`#solutions`)

| Key | Where it appears |
|---|---|
| `{{SOLUTIONS_LABEL}}` | Pill label |
| `{{SOLUTIONS_HEADLINE}}` | Section headline |
| `{{SOLUTIONS_1_TAG}}` … `{{SOLUTIONS_3_TAG}}` | Bracketed label on each card, e.g. `[ Fields ]` |
| `{{SOLUTIONS_1_TITLE}}` … `{{SOLUTIONS_3_TITLE}}` | Card titles |
| `{{SOLUTIONS_1_BODY}}` … `{{SOLUTIONS_3_BODY}}` | Card body text |
| `{{SOLUTIONS_1_ALT}}` … `{{SOLUTIONS_3_ALT}}` | Card image descriptions (alt text) |
| `{{SOLUTIONS_CARD_LINK_LABEL}}` | Screen-reader name of each round arrow button ("Open …") |

### How it measures (`#measures`, black section)

| Key | Where it appears |
|---|---|
| `{{MEASURES_LABEL}}` | Pill label |
| `{{MEASURES_HEADLINE}}` | Three-line centred headline (an array of 3 lines) |
| `{{MEASURES_SUBLINE}}` | Line under the headline |
| `{{MEASURES_SKIP_LABEL}}` | Screen-reader name of the down-arrow circle |
| `{{SENSOR_ALT}}` | Description of the sensor drawing |
| `{{SENSOR_CALLOUT_1}}` … `{{SENSOR_CALLOUT_3}}` | Callout titles (soil moisture, rainfall, temperature) |
| `{{SENSOR_CALLOUT_1_SOURCE}}` … `{{SENSOR_CALLOUT_3_SOURCE}}` | Small mono line under each callout |
| `{{REPORT_TITLE}}` | "Field report" card heading |
| `{{REPORT_FIELD}}` | Field-name chip on the card |
| `{{REPORT_NOTE}}` | Note at the card's top right ("Example numbers") |
| `{{REPORT_CHART_LABEL}}` | Chart title |
| `{{REPORT_CHART_START}}`, `{{REPORT_CHART_END}}` | Chart axis ends |
| `{{REPORT_STAT_LABEL}}`, `{{REPORT_STAT_VALUE}}`, `{{REPORT_STAT_UNIT}}` | The big-number tile |

### Collage (light section)

| Key | Where it appears |
|---|---|
| `{{STATEMENT}}` | The one sentence in the middle |
| `{{COLLAGE_CARD_YIELD_LABEL}}` / `_VALUE` | White stat tile |
| `{{COLLAGE_CARD_FIT_LABEL}}` / `_VALUE` | Green stat tile |
| `{{COLLAGE_CARD_WATER_LABEL}}` / `_VALUE` | Dark stat tile (desktop only) |
| `{{COLLAGE_TILE_ALTS}}` | Descriptions of the four picture tiles |

### How it works (`#how-it-works`)

| Key | Where it appears |
|---|---|
| `{{STEPS_LABEL}}` | Pill label |
| `{{STEPS_HEADLINE}}` | Section headline |
| `{{STEPS_PREFIX}}` | Screen-reader word before each number ("Step 1: …") |
| `{{STEPS_1_TITLE}}` … `{{STEPS_4_TITLE}}` | Row titles, next to the numbered green circles |
| `{{STEPS_1_BODY}}` … `{{STEPS_4_BODY}}` | Row descriptions |

### Success stories (`#stories`)

| Key | Where it appears |
|---|---|
| `{{STORIES_LABEL}}` | Section label (pill) |
| `{{STORIES_PILL}}` | "Success story" pill on each card |
| `{{GROWER_STORY_1_TITLE}}`, `{{GROWER_STORY_2_TITLE}}` | Card headlines |
| `{{GROWER_STORY_1_NAME}}`, `{{GROWER_STORY_2_NAME}}` | Grower name (mono style) |
| `{{GROWER_STORY_1_ROLE}}`, `{{GROWER_STORY_2_ROLE}}` | Crops, acreage, county (mono style) |
| `{{GROWER_STORY_1_ALT}}`, `{{GROWER_STORY_2_ALT}}` | Card image descriptions |

> The stories are placeholders. The grower names say "Grower name" on purpose. Replace them with real growers who agreed to be quoted, or remove the section from `app/(site)/page.tsx`.

### Latest (`#latest`, optional)

| Key | Where it appears |
|---|---|
| `{{NEWS_LABEL}}` | Pill label |
| `{{NEWS_HEADLINE}}` | Section heading |
| `{{NEWS_SEE_ALL}}` | "See all" link (set `seeAllHref`) |
| `{{NEWS_READ_LABEL}}` | Screen-reader name of the card's arrow button ("Read: …") |
| `{{NEWS_DATE}}`, `{{NEWS_TITLE}}`, `{{NEWS_BODY}}`, `{{NEWS_ALT}}` | The news card (set `item.href`) |

To drop the section, remove `<Latest />` from `app/(site)/page.tsx`.

### Closing band

| Key | Where it appears |
|---|---|
| `{{CLOSING_HEADLINE}}` | Big headline in the dark rounded band |
| `{{CLOSING_SUBLINE}}` | Line under it (the CTA pair repeats below) |

### Footer

| Key | Where it appears |
|---|---|
| `{{FOOTER_LOCATIONS_LABEL}}` | Small label over the locations |
| `{{LOCATIONS}}` | Locations list (array) |
| `{{FOOTER_COL_1_TITLE}}` … `{{FOOTER_COL_3_TITLE}}` | Link column headings |
| `{{FOOTER_COL_1_LINKS}}` … `{{FOOTER_COL_3_LINKS}}` | Links in each column |
| `{{FOOTER_LEGAL_LINKS}}` | Privacy / Terms (still `#`; point them at real pages) |
| `{{FOOTER_COPYRIGHT}}` | Bottom-left line |

### /plot (drawing page)

| Key | Where it appears |
|---|---|
| `{{PLOT_TITLE}}` | Page title (tab and screen readers) |
| `{{PLOT_BACK}}` | Back link, top left |
| `{{PLOT_HINT_START}}` | Panel hint before the boundary is closed |
| `{{PLOT_HINT_DONE}}` | Panel hint once it is closed |
| `{{PLOT_AREA_LABEL}}`, `{{PLOT_AREA_UNIT}}` | Live area readout |
| `{{PLOT_NAME_LABEL}}`, `{{PLOT_NAME_PLACEHOLDER}}` | Field name input (the placeholder is also the default name) |
| `{{PLOT_CLEAR}}`, `{{PLOT_SAVE}}`, `{{PLOT_SAVING}}` | Buttons |
| `{{PLOT_MAP_ERROR}}` | Shown if the map can't start (no WebGL) |

## Notes

- `NEXT_PUBLIC_MAP_TOKEN` (optional): set a Mapbox token to use Mapbox satellite imagery on `/plot`. Without one, it uses free USGS imagery.
- Saving on `/plot` creates a real field in the app, the same as drawing one on Fields, and opens `/fields`.
