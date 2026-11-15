/**
 * Every word the landing page shows lives here.
 *
 * Each string carries a {{KEY}} marker in the comment above it. Replace the value to change the copy;
 * content/README.md lists every key and where it appears on the page.
 *
 * Images: any `image` set to null shows a drawn placeholder. Drop a file in /public/assets and set the
 * path (for example '/assets/solutions-map.jpg') to use it instead. See public/assets/README.md.
 */

export interface LinkItem {
  label: string;
  href: string;
}

export const site = {
  meta: {
    // {{META_TITLE}}
    title: 'PlotTwist: rotate smarter, farm longer',
    // {{META_DESCRIPTION}}
    description: 'Map your fields, compare crop rotations built on NASA data, then plan, simulate and check the profit.',
  },

  // {{SITE_NAME}}
  name: 'PlotTwist',

  header: {
    // {{SKIP_LINK_LABEL}}  (keyboard users: jumps past the scroll hero)
    skipLabel: 'Skip the intro',
    // {{MENU_LABEL}}
    menuLabel: 'Menu',
    // {{MENU_CLOSE_LABEL}}
    menuCloseLabel: 'Close',
    // {{MENU_LINKS}}
    links: [
      { label: 'What you can do', href: '#solutions' },
      { label: 'How it measures', href: '#measures' },
      { label: 'How it works', href: '#how-it-works' },
      { label: 'Success stories', href: '#stories' },
      { label: 'Open the app', href: '/fields' },
    ] satisfies LinkItem[],
  },

  cta: {
    // {{CTA_LABEL}}  (default "Plot your fields")
    label: 'Map your field',
    href: '/plot',
    // {{CTA_SECONDARY_LABEL}}  (goes to the fields you already saved)
    secondaryLabel: 'Go to my fields',
    secondaryHref: '/fields',
  },

  hero: {
    // {{HERO_TAGLINE}}
    tagline: 'Rotate smarter. Farm longer.',
    // {{HERO_DESCRIPTION}}  (1–2 sentences)
    description:
      'Map your fields, answer a few questions about your crops and soil, and PlotTwist compares rotation strategies built on NASA data and recommends the best one. Then plan it, simulate it, and check the profit.',
    // {{MISSION_LABEL}}
    missionLabel: 'Our mission',
    // {{MISSION}}
    mission: 'Help every farmer adapt their fields to a changing climate with clear, NASA-backed decisions.',
    // {{HERO_SCROLL_HINT}}
    scrollHint: 'Scroll to zoom in',
    /** Optional rendered stills that replace the 3D scene at each zoom stage. */
    assets: {
      satellite: null as string | null, // /assets/hero-satellite.jpg
      field: null as string | null, // /assets/hero-field.jpg
      rows: null as string | null, // /assets/hero-rows.jpg
      soil: null as string | null, // /assets/hero-soil.jpg
    },
    // {{HERO_ALT}}  (describes the 3D scene for screen readers)
    alt: 'A slab of farmland lifted out of a patchwork of fields, showing crop rows on top and layers of soil and roots underneath.',
  },

  solutions: {
    // {{SOLUTIONS_LABEL}}
    label: 'What you can do',
    // {{SOLUTIONS_HEADLINE}}
    headline: 'Everything a rotation decision needs, on the fields you farm',
    cards: [
      {
        // {{SOLUTIONS_1_TAG}}
        tag: 'Fields',
        // {{SOLUTIONS_1_TITLE}}
        title: 'Map every field in minutes',
        // {{SOLUTIONS_1_BODY}}
        body: 'Draw a boundary on the satellite map. Acres, soil and crop history fill in on their own.',
        href: '/fields',
        art: 'rows' as const,
        image: null as string | null, // /assets/solutions-map.jpg
        // {{SOLUTIONS_1_ALT}}
        alt: 'Aerial view of straight crop rows across a field.',
      },
      {
        // {{SOLUTIONS_2_TAG}}
        tag: 'Rotation',
        // {{SOLUTIONS_2_TITLE}}
        title: 'Compare rotations side by side',
        // {{SOLUTIONS_2_BODY}}
        body: 'Keep what you grow, add a cover crop, or bring in small grains. See which fits your soil and weather best.',
        href: '/rotation',
        art: 'pivots' as const,
        image: null as string | null, // /assets/solutions-rotation.jpg
        // {{SOLUTIONS_2_ALT}}
        alt: 'Aerial view of round center-pivot fields in different crops.',
      },
      {
        // {{SOLUTIONS_3_TAG}}
        tag: 'Profit',
        // {{SOLUTIONS_3_TITLE}}
        title: 'Check the money before you plant',
        // {{SOLUTIONS_3_BODY}}
        body: 'Costs, yields and prices for your acres, tested against 40 years of weather.',
        href: '/finance',
        art: 'ruts' as const,
        image: null as string | null, // /assets/solutions-profit.jpg
        // {{SOLUTIONS_3_ALT}}
        alt: 'Aerial view of tractor tracks curving across a harvested field.',
      },
    ],
    // {{SOLUTIONS_CARD_LINK_LABEL}}  (screen readers hear "Open <title>")
    cardLinkLabel: 'Open',
  },

  measures: {
    // {{MEASURES_LABEL}}
    label: 'How it measures',
    // {{MEASURES_HEADLINE}}  (three lines)
    headline: ['Every field gets a sensor.', 'None of them are in the ground.', 'They are in orbit.'],
    // {{MEASURES_SUBLINE}}
    subline: 'NASA satellites read your soil, rain and heat every day. PlotTwist reads them for each field you draw.',
    // {{MEASURES_SKIP_LABEL}}  (the down-arrow circle)
    skipLabel: 'See what it reads',
    // {{SENSOR_ALT}}
    sensorAlt: 'Drawing of a field sensor on a post, with three readings pointing to it.',
    callouts: [
      {
        // {{SENSOR_CALLOUT_1}}
        title: 'Soil moisture',
        // {{SENSOR_CALLOUT_1_SOURCE}}
        source: 'NASA SMAP satellite',
      },
      {
        // {{SENSOR_CALLOUT_2}}
        title: 'Rainfall',
        // {{SENSOR_CALLOUT_2_SOURCE}}
        source: 'NASA GPM IMERG',
      },
      {
        // {{SENSOR_CALLOUT_3}}
        title: 'Temperature',
        // {{SENSOR_CALLOUT_3_SOURCE}}
        source: 'NASA POWER',
      },
    ],
    report: {
      // {{REPORT_TITLE}}
      title: 'Field report',
      // {{REPORT_FIELD}}
      field: 'North 80',
      // {{REPORT_CHART_LABEL}}
      chartLabel: 'Topsoil moisture, last 30 days',
      // {{REPORT_CHART_START}}
      chartStart: '30 days ago',
      // {{REPORT_CHART_END}}
      chartEnd: 'Today',
      // {{REPORT_STAT_LABEL}}
      statLabel: 'Rain, last 30 days',
      // {{REPORT_STAT_VALUE}}
      statValue: '2.4',
      // {{REPORT_STAT_UNIT}}
      statUnit: 'in',
      // {{REPORT_NOTE}}
      note: 'Example numbers',
    },
  },

  collage: {
    // {{STATEMENT}}
    statement: 'Forty years of NASA weather, read for the field you actually farm.',
    tiles: {
      // {{COLLAGE_TILE_ALTS}}
      pivotsAlt: 'Aerial view of center-pivot circles.',
      drainageAlt: 'Aerial view of drainage lines through a wet field.',
      sensorAlt: 'A field sensor on a post at the edge of a crop row.',
      rowsAlt: 'Aerial view of crop rows after planting.',
    },
    // {{COLLAGE_CARD_YIELD_LABEL}}
    yieldLabel: 'Expected yield',
    // {{COLLAGE_CARD_YIELD_VALUE}}
    yieldValue: '212 bu/acre',
    // {{COLLAGE_CARD_FIT_LABEL}}
    fitLabel: 'Best fit',
    // {{COLLAGE_CARD_FIT_VALUE}}
    fitValue: 'Add a cereal rye cover',
    // {{COLLAGE_CARD_WATER_LABEL}}
    waterLabel: 'Soil water',
    // {{COLLAGE_CARD_WATER_VALUE}}
    waterValue: 'Normal for May',
  },

  steps: {
    // {{STEPS_LABEL}}
    label: 'How it works',
    // {{STEPS_HEADLINE}}
    headline: 'From a field outline to a plan in four steps',
    // {{STEPS_PREFIX}}  (screen readers hear "Step 1: Draw your field")
    stepPrefix: 'Step',
    items: [
      {
        // {{STEPS_1_TITLE}}
        title: 'Draw your field',
        // {{STEPS_1_BODY}}
        body: 'Trace the boundary on a satellite map, or upload a shapefile you already have.',
      },
      {
        // {{STEPS_2_TITLE}}
        title: 'Add a few details',
        // {{STEPS_2_BODY}}
        body: 'Tell us what you grow, how you till, and any problems you see. Soil and weather fill in from NASA and USDA.',
      },
      {
        // {{STEPS_3_TITLE}}
        title: 'See the best rotation',
        // {{STEPS_3_BODY}}
        body: 'Three strategies, scored on soil cover, crop variety, pests and climate fit, with the reasons spelled out.',
      },
      {
        // {{STEPS_4_TITLE}}
        title: 'Plan it and check the profit',
        // {{STEPS_4_BODY}}
        body: 'Turn the pick into a season-by-season plan, test it in a dry or wet year, and see the dollars per acre.',
      },
    ],
  },

  stories: {
    // {{STORIES_LABEL}}
    label: 'Success stories',
    // {{STORIES_PILL}}
    pill: 'Success story',
    items: [
      {
        // {{GROWER_STORY_1_TITLE}}
        title: 'Added a rye cover on 320 acres and kept the topsoil where it belongs',
        // {{GROWER_STORY_1_NAME}}
        name: 'Grower name',
        // {{GROWER_STORY_1_ROLE}}  (crop, acreage, county)
        role: 'Corn and soybeans, 320 acres, Story County, IA',
        art: 'drainage' as const,
        image: null as string | null, // /assets/story-1.jpg
        // {{GROWER_STORY_1_ALT}}
        alt: 'Aerial view of a field with a green cover crop between drainage lines.',
      },
      {
        // {{GROWER_STORY_2_TITLE}}
        title: 'Brought oats back into the rotation and cut the nitrogen bill',
        // {{GROWER_STORY_2_NAME}}
        name: 'Grower name',
        // {{GROWER_STORY_2_ROLE}}
        role: 'Corn, soybeans and oats, 540 acres, Boone County, IA',
        art: 'strips' as const,
        image: null as string | null, // /assets/story-2.jpg
        // {{GROWER_STORY_2_ALT}}
        alt: 'Aerial view of strips of oats beside soybean rows.',
      },
    ],
  },

  latest: {
    // {{NEWS_LABEL}}
    label: 'Latest',
    // {{NEWS_HEADLINE}}
    headline: 'News from the field',
    // {{NEWS_SEE_ALL}}
    seeAll: 'See all',
    seeAllHref: '#',
    // {{NEWS_READ_LABEL}}  (screen readers hear "Read: <title>")
    readLabel: 'Read:',
    item: {
      // {{NEWS_DATE}}
      date: 'October 2026',
      // {{NEWS_TITLE}}
      title: 'PlotTwist was built for NASA Space Apps 2026',
      // {{NEWS_BODY}}
      body: 'How a weekend team turned free NASA soil, rain and weather data into a rotation planner farmers can use.',
      href: '#',
      art: 'pivots' as const,
      image: null as string | null, // /assets/news-1.jpg
      // {{NEWS_ALT}}
      alt: 'Aerial view of center-pivot fields at harvest.',
    },
  },

  closing: {
    // {{CLOSING_HEADLINE}}
    headline: 'Your next rotation starts with one outline',
    // {{CLOSING_SUBLINE}}
    subline: 'Draw a field. It takes about a minute and nothing to install.',
  },

  footer: {
    // {{FOOTER_LOCATIONS_LABEL}}
    locationsLabel: 'Where it works',
    // {{LOCATIONS}}
    locations: ['Iowa', 'The US Corn Belt'],
    columns: [
      {
        // {{FOOTER_COL_1_TITLE}}
        title: 'App',
        // {{FOOTER_COL_1_LINKS}}
        links: [
          { label: 'Fields', href: '/fields' },
          { label: 'Rotation Explorer', href: '/rotation' },
          { label: 'Planner', href: '/planner' },
          { label: 'Finance', href: '/finance' },
        ] satisfies LinkItem[],
      },
      {
        // {{FOOTER_COL_2_TITLE}}
        title: 'NASA data',
        // {{FOOTER_COL_2_LINKS}}
        links: [
          { label: 'NASA POWER', href: 'https://power.larc.nasa.gov/' },
          { label: 'SMAP soil moisture', href: 'https://smap.jpl.nasa.gov/' },
          { label: 'GPM IMERG rainfall', href: 'https://gpm.nasa.gov/data/imerg' },
        ] satisfies LinkItem[],
      },
      {
        // {{FOOTER_COL_3_TITLE}}
        title: 'Project',
        // {{FOOTER_COL_3_LINKS}}
        links: [
          { label: 'NASA Space Apps', href: 'https://www.spaceappschallenge.org/' },
          { label: 'Contact', href: '#' },
        ] satisfies LinkItem[],
      },
    ],
    // {{FOOTER_LEGAL_LINKS}}
    legal: [
      { label: 'Privacy', href: '#' },
      { label: 'Terms', href: '#' },
    ] satisfies LinkItem[],
    // {{FOOTER_COPYRIGHT}}
    copyright: '© 2026 PlotTwist',
    image: null as string | null, // /assets/footer-field.jpg
  },

  plot: {
    // {{PLOT_TITLE}}
    title: 'Map your field',
    // {{PLOT_HINT_START}}
    hintStart: 'Find your field, then click each corner of it. Click the first corner again to finish.',
    // {{PLOT_HINT_DONE}}
    hintDone: 'Drag a corner to adjust it, or save the field.',
    // {{PLOT_AREA_LABEL}}
    areaLabel: 'Area',
    // {{PLOT_AREA_UNIT}}
    areaUnit: 'acres',
    // {{PLOT_NAME_LABEL}}
    nameLabel: 'Field name',
    // {{PLOT_NAME_PLACEHOLDER}}
    namePlaceholder: 'North 80',
    // {{PLOT_CLEAR}}
    clear: 'Clear',
    // {{PLOT_SAVE}}
    save: 'Save field',
    // {{PLOT_SAVING}}
    saving: 'Saving…',
    // {{PLOT_BACK}}
    back: 'Back to home',
    // {{PLOT_MAP_ERROR}}
    mapError: 'The map could not load. Check your connection, or draw your field in the app instead.',
  },
};

export type Site = typeof site;
export type ArtKind = 'rows' | 'pivots' | 'ruts' | 'drainage' | 'strips';
