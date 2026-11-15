import { interiorPoint } from '../acreage';
import { cropLabel } from '../crops';
import type { RotationAnswers } from '../management';
import { SOURCE_META } from '../sourceMeta';
import type { ClimateNormals, Field, FieldProfile, Honesty, SeasonStatus, SourceId } from '../types';
import { cropIdsOf } from './agronomy';

/** Where an input came from, so every reason can show its evidence. */
export type InputHonesty = Honesty | 'You entered';

export interface DataPoint<T> {
  value: T;
  label: string;
  /** Human-readable value with unit. */
  display: string;
  provider: string;
  honesty: InputHonesty;
}

export interface KnownSeason {
  year: number;
  /** Catalog crop ids (two for a double crop); null = not entered, or a crop the rubric doesn't know. */
  ids: string[] | null;
  label: string;
  status: SeasonStatus;
}

export interface RotationInputs {
  fieldName: string;
  lat?: number;
  currentYear: number;
  /** Oldest season first, this season last. */
  seasons: KnownSeason[];
  climate?: DataPoint<ClimateNormals>;
  rain30?: DataPoint<number>;
  rainNormal30?: DataPoint<number>;
  imergRain30?: DataPoint<number>;
  smapSoilMoisture?: DataPoint<number>;
  texture?: DataPoint<string>;
  organicMatter?: DataPoint<number>;
  drainage?: DataPoint<string>;
  slopePct?: DataPoint<number>;
  answers: RotationAnswers;
  /** Public data lookups are switched off, so profile inputs are missing on purpose. */
  lookupsOff: boolean;
}

function value(profile: FieldProfile | undefined, source: SourceId, key: string) {
  const r = profile?.sources[source];
  if (!r || r.status !== 'ok') return undefined;
  return r.values.find((v) => v.key === key);
}

function numberPoint(profile: FieldProfile | undefined, source: SourceId, key: string, label: string): DataPoint<number> | undefined {
  const v = value(profile, source, key);
  if (!v || typeof v.value !== 'number' || !Number.isFinite(v.value)) return undefined;
  return { value: v.value, label, display: `${v.value}${v.unit ? ` ${v.unit}` : ''}`, provider: SOURCE_META[source].provider, honesty: v.honesty };
}

function stringPoint(profile: FieldProfile | undefined, source: SourceId, key: string, label: string): DataPoint<string> | undefined {
  const v = value(profile, source, key);
  if (!v || v.value === '' || v.value === null) return undefined;
  return { value: String(v.value), label, display: String(v.value), provider: SOURCE_META[source].provider, honesty: v.honesty };
}

/** Gather everything the rubric uses for one field. Profiles from an older boundary are ignored. */
export function buildInputs(field: Field, profile: FieldProfile | undefined, answers: RotationAnswers, opts: { lookupsOff?: boolean } = {}): RotationInputs {
  const p = profile && profile.geometryHash === field.geometryHash ? profile : undefined;
  const seasons: KnownSeason[] = [...field.crops.history]
    .reverse()
    .concat(field.crops.current)
    .map((s) => ({ year: s.year, ids: cropIdsOf(s.crop), label: s.crop ? cropLabel(s.crop) : 'Not entered', status: s.status }));

  const power = p?.sources.power;
  const climate: DataPoint<ClimateNormals> | undefined =
    power?.status === 'ok' && power.climate && power.climate.monthlyMeanTempF.length === 12
      ? { value: power.climate, label: '1991–2020 monthly normals', display: 'Monthly temperature and rain normals', provider: SOURCE_META.power.provider, honesty: 'Estimated' }
      : undefined;

  const soilTest = answers.soilTest;
  const organicMatter: DataPoint<number> | undefined =
    soilTest?.organicMatterPct !== undefined
      ? { value: soilTest.organicMatterPct, label: 'Organic matter (your soil test)', display: `${soilTest.organicMatterPct} %`, provider: 'Your soil test', honesty: 'You entered' }
      : numberPoint(p, 'ssurgo', 'organicMatter', 'Organic matter (soil survey)');

  return {
    fieldName: field.name,
    lat: interiorPoint(field.feature.geometry)[1],
    currentYear: field.crops.current.year,
    seasons,
    climate,
    rain30: numberPoint(p, 'power', 'rain30', 'Rain, last 30 days'),
    rainNormal30: numberPoint(p, 'power', 'rainNormal', 'Normal rain for those dates'),
    imergRain30: numberPoint(p, 'imerg', 'imergRain30', 'Satellite rain, last 30 days'),
    smapSoilMoisture: numberPoint(p, 'smap', 'smapLatest', 'Satellite surface soil moisture'),
    texture: stringPoint(p, 'ssurgo', 'texture', 'Surface texture'),
    organicMatter,
    drainage: stringPoint(p, 'ssurgo', 'drainage', 'Drainage class'),
    slopePct: numberPoint(p, 'elevation', 'slopePct', 'Average slope'),
    answers,
    lookupsOff: !!opts.lookupsOff,
  };
}
