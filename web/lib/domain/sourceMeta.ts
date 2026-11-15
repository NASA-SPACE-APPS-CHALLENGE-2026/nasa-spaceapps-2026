import type { SourceId } from './types';

export interface SourceMeta {
  id: SourceId;
  name: string;
  provider: string;
  docsUrl: string;
  /** null = never goes stale (soil, terrain). */
  staleAfterMs: number | null;
  needsEarthdata: boolean;
  blurb: string;
}

const DAY = 24 * 60 * 60 * 1000;

/** Display metadata shared by client and server. Server modules live in lib/sources. */
export const SOURCE_META: Record<SourceId, SourceMeta> = {
  power: {
    id: 'power',
    name: 'Weather & climate',
    provider: 'NASA POWER',
    docsUrl: 'https://power.larc.nasa.gov/docs/services/api/',
    staleAfterMs: DAY,
    needsEarthdata: false,
    blurb: 'Daily weather for the last 30 days, compared with the 1991–2020 normal.',
  },
  ssurgo: {
    id: 'ssurgo',
    name: 'Soil',
    provider: 'USDA NRCS SSURGO (Soil Data Access)',
    docsUrl: 'https://sdmdataaccess.nrcs.usda.gov/',
    staleAfterMs: null,
    needsEarthdata: false,
    blurb: 'Soil survey map units under the field: texture, organic matter, drainage, hydrologic group.',
  },
  elevation: {
    id: 'elevation',
    name: 'Elevation & slope',
    provider: 'USGS 3DEP via Elevation Point Query Service',
    docsUrl: 'https://apps.nationalmap.gov/epqs/',
    staleAfterMs: null,
    needsEarthdata: false,
    blurb: 'Ground elevation sampled across the field and the average slope.',
  },
  smap: {
    id: 'smap',
    name: 'Soil moisture',
    provider: 'NASA SMAP (Earthdata)',
    docsUrl: 'https://nsidc.org/data/smap',
    staleAfterMs: DAY,
    needsEarthdata: true,
    blurb: 'Satellite surface soil moisture.',
  },
  imerg: {
    id: 'imerg',
    name: 'Satellite rainfall',
    provider: 'NASA GPM IMERG (Earthdata)',
    docsUrl: 'https://gpm.nasa.gov/data/imerg',
    staleAfterMs: DAY,
    needsEarthdata: true,
    blurb: 'Satellite precipitation estimates.',
  },
  ndvi: {
    id: 'ndvi',
    name: 'Crop greenness (NDVI)',
    provider: 'NASA MODIS MOD13Q1 via ORNL DAAC',
    docsUrl: 'https://modis.ornl.gov/data/modis_webservice.html',
    staleAfterMs: 7 * DAY,
    needsEarthdata: false,
    blurb: 'Satellite vegetation index (250 m, 16-day) for the field, now and a year ago.',
  },
};

export const SOURCE_ORDER: SourceId[] = ['power', 'ssurgo', 'elevation', 'smap', 'imerg', 'ndvi'];

export function isSourceId(value: string): value is SourceId {
  return (SOURCE_ORDER as string[]).includes(value);
}
