import { COVER_LABELS, IRRIGATION_LABELS, known, MONTH_NAMES, PROBLEM_LABELS, TILLAGE_LABELS, YES_NO_LABELS, type Problem } from '../management';
import type { StrategyId } from '../types';
import { agronomyOf, coldestMonthF, cropName, fallGdd40, familyOf, HOSTS, SMALL_GRAINS } from './agronomy';
import type { CitationId } from './citations';
import type { DataPoint, InputHonesty, RotationInputs } from './inputs';
import { buildStrategies, PLAN_YEARS, type PlannedSeason, type Strategy } from './strategies';

/**
 * Rotation Explorer rubric: four bars (0–100, higher is better) for each strategy.
 * Pure and deterministic: no clock, network or randomness. Every number is a placeholder documented in
 * docs/rotation-rubric.md and awaiting agronomist review.
 */

export type BarId = 'soilCover' | 'diversity' | 'pests' | 'climate';
export type Confidence = 'low' | 'medium' | 'high';

export const BARS: Array<{ id: BarId; label: string; question: string }> = [
  { id: 'soilCover', label: 'Soil cover', question: 'How much of the year living plants cover and hold the soil.' },
  { id: 'diversity', label: 'Crop diversity', question: 'How many crop families and growing seasons the rotation uses.' },
  { id: 'pests', label: 'Pests & diseases', question: 'How well the rotation breaks pest and disease cycles.' },
  { id: 'climate', label: 'Climate fit', question: 'How well the crops and covers fit this field’s weather.' },
];

export type ReasonSource =
  | { kind: 'citation'; id: CitationId }
  | { kind: 'data'; label: string; display: string; provider: string; honesty: InputHonesty }
  | { kind: 'answer'; question: string; answer: string }
  | { kind: 'history'; text: string };

export interface Reason {
  text: string;
  /** Points this reason added to (or took from) the bar. Absent = context only. */
  effect?: number;
  /** The reason that sets the bar's starting point (shown first in summaries). */
  headline?: boolean;
  sources: ReasonSource[];
}

export interface BarScore {
  id: BarId;
  label: string;
  score: number | null;
  confidence: Confidence;
  reasons: Reason[];
  /** Inputs that were missing; for an unscored bar, what would be needed. */
  missing: string[];
}

export interface StrategyScore {
  strategy: Strategy;
  bars: BarScore[];
  /** Weighted mean of the scored bars, 1 decimal; null with fewer than MIN_SCORED_BARS. */
  overall: number | null;
  /** Practical points that are not scored (equipment, markets, experience). */
  caveats: Reason[];
}

export interface RotationResult {
  strategies: StrategyScore[];
  bestFit: StrategyId | null;
  bestFitReason: string;
  weights: Record<BarId, number>;
  weightReasons: Reason[];
  problem?: string;
  knownSeasons: number;
}

export const MIN_SCORED_BARS = 3;
const LEVELS: Confidence[] = ['low', 'medium', 'high'];
const lower = (c: Confidence, steps = 1): Confidence => LEVELS[Math.max(0, LEVELS.indexOf(c) - steps)];
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const cite = (...ids: CitationId[]): ReasonSource[] => ids.map((id) => ({ kind: 'citation', id }));
const data = (p: DataPoint<unknown>): ReasonSource => ({ kind: 'data', label: p.label, display: p.display, provider: p.provider, honesty: p.honesty });
const answer = (question: string, a: string): ReasonSource => ({ kind: 'answer', question, answer: a });

class Bar {
  score: number;
  confidence: Confidence;
  reasons: Reason[] = [];
  missing: string[] = [];
  constructor(
    readonly id: BarId,
    base: number,
    confidence: Confidence,
  ) {
    this.score = base;
    this.confidence = confidence;
  }
  add(effect: number, text: string, sources: ReasonSource[]) {
    this.score += effect;
    this.reasons.push({ text, effect: effect || undefined, sources });
  }
  note(text: string, sources: ReasonSource[]) {
    this.reasons.push({ text, sources });
  }
  /** Set the starting score and explain it. */
  start(base: number, text: string, sources: ReasonSource[]) {
    this.score = base;
    this.reasons.push({ text, sources, headline: true });
  }
  /** Missing optional input: half the unfavourable adjustment, one confidence level lower, and say so. */
  assume(unfavourable: number, what: string, text: string, sources: ReasonSource[]) {
    this.add(unfavourable / 2, text, sources);
    this.confidence = lower(this.confidence);
    this.missing.push(what);
  }
  done(): BarScore {
    return { id: this.id, label: label(this.id), score: clamp(this.score), confidence: this.confidence, reasons: this.reasons, missing: this.missing };
  }
}

const label = (id: BarId) => BARS.find((b) => b.id === id)!.label;

function unscored(id: BarId, missing: string[], why: string, sources: ReasonSource[]): BarScore {
  return { id, label: label(id), score: null, confidence: 'low', reasons: [{ text: why, sources }], missing };
}

// ---------- helpers over a strategy's seasons ----------

type Coverage = { living: Set<number>; residue: Set<number> };

/** Months (absolute: year*12 + month-1) with living plants, and with winter-killed cover residue. */
export function coverage(seasons: PlannedSeason[]): Coverage {
  const living = new Set<number>();
  const residue = new Set<number>();
  const range = (from: number, to: number, into: Set<number>) => {
    for (let m = from; m <= to; m++) into.add(m);
  };
  for (const s of seasons) {
    for (const c of s.crops) {
      if (c.perennial) range(s.year * 12, s.year * 12 + 11, living);
      else range(c.plantYear * 12 + c.plant, c.harvestYear * 12 + c.harvest - 1, living); // month after planting → harvest month
    }
    if (s.cover) {
      const start = s.cover.plantYear * 12 + s.cover.plantMonth; // month after seeding
      const end = s.cover.endYear * 12 + s.cover.endMonth - 1;
      if (s.cover.pick.species.winterKills) {
        const killed = Math.min(end, s.cover.plantYear * 12 + 11); // dies by the end of December
        range(start, killed, living);
        range(killed + 1, end, residue);
      } else range(start, end, living);
    }
  }
  return { living, residue };
}

function coveredMonths(seasons: PlannedSeason[], firstYear: number): { living: number; residue: number; total: number } {
  const { living, residue } = coverage(seasons);
  const from = firstYear * 12;
  const to = (firstYear + PLAN_YEARS) * 12 - 1;
  let l = 0;
  let r = 0;
  for (let m = from; m <= to; m++) {
    if (living.has(m)) l++;
    else if (residue.has(m)) r++;
  }
  return { living: l, residue: r, total: to - from + 1 };
}

const seasonIds = (s: PlannedSeason) => s.ids;
const hasHost = (ids: string[] | null, hosts: ReadonlySet<string>) => !!ids && ids.some((id) => hosts.has(id));

// ---------- bars ----------

function soilCoverBar(st: Strategy, inputs: RotationInputs, firstYear: number): BarScore {
  const months = coveredMonths(st.seasons, firstYear);
  const base = (100 * (months.living + 0.5 * months.residue)) / months.total;
  const bar = new Bar('soilCover', 0, 'high');
  bar.start(
    base,
    `Living plants cover the soil about ${months.living} of the ${months.total} months from ${firstYear} to ${firstYear + PLAN_YEARS - 1}${months.residue ? `, and winter-killed cover residue protects it ${months.residue} more` : ''}.`,
    [...cite('nass-dates'), { kind: 'history', text: 'Usual planting and harvest months for each crop in this strategy' }],
  );
  const covers = st.seasons.filter((s) => s.cover);
  if (covers.length) {
    const names = [...new Set(covers.map((s) => s.cover!.pick.species.name.toLowerCase()))].join(' and ');
    bar.note(`A cover crop (${names}) keeps roots in the ground between harvest and the next planting, when the soil is otherwise bare.`, cite('nrcs-340', 'sare-mccp'));
  } else if (st.id === 'keep') {
    bar.note('Between harvest and planting the field has no living cover, so the soil is bare for much of fall, winter and spring.', cite('nrcs-340'));
  }
  const tillage = known(inputs.answers.tillage);
  const tq = 'How do you usually prepare this field?';
  if (tillage === 'no-till') bar.add(5, 'No-till leaves crop residue on the surface through the bare months.', [answer(tq, TILLAGE_LABELS['no-till']), ...cite('nrcs-329')]);
  else if (tillage === 'reduced') bar.note('Reduced tillage leaves some residue on the surface.', [answer(tq, TILLAGE_LABELS.reduced), ...cite('nrcs-329')]);
  else if (tillage === 'conventional') bar.add(-10, 'Full tillage buries most residue, so bare months are fully exposed to wind and rain.', [answer(tq, TILLAGE_LABELS.conventional), ...cite('nrcs-329')]);
  else bar.assume(-10, 'tillage', 'Tillage is unknown, so FieldShift assumed some residue is buried (half the full-tillage penalty).', [answer(tq, 'Not answered'), ...cite('nrcs-329')]);
  if (known(inputs.answers.harvestMonth) === undefined) {
    bar.confidence = lower(bar.confidence);
    bar.missing.push('harvest month');
    bar.note('Your usual harvest month is unknown, so the usual month for the crop was used.', cite('nass-dates'));
  }
  return bar.done();
}

function diversityBar(st: Strategy, inputs: RotationInputs, knownSeasons: number, unconfirmed: boolean): BarScore {
  if (knownSeasons < 2) {
    return unscored('diversity', ['an earlier season'], 'Not enough info: enter at least one earlier season on the Fields tab.', [{ kind: 'history', text: 'Crop history on the Fields tab' }]);
  }
  const cash = [...new Set(st.seasons.flatMap(seasonIds))];
  const covers = st.seasons.flatMap((s) => (s.cover ? [s.cover.pick.species] : []));
  const families = new Set<string>([...cash.map((id) => familyOf(id) ?? id), ...covers.map((c) => c.family)]);
  const seasonsUsed = new Set(cash.map((id) => agronomyOf(id)?.season));
  const bar = new Bar('diversity', 20, unconfirmed ? 'medium' : 'high');
  const extraFamilies = Math.min(3, families.size - 1);
  bar.start(20, 'Starts at 20 for a single crop family.', cite('nrcs-328'));
  if (extraFamilies > 0) bar.add(20 * extraFamilies, `${families.size} plant families (${[...families].join(', ')}) over ${PLAN_YEARS} years.`, cite('nrcs-328', 'davis-2012'));
  if (cash.length >= 3) bar.add(10, `${cash.length} different cash crops (${cash.map(cropName).join(', ')}).`, cite('davis-2012'));
  if (seasonsUsed.has('warm') && (seasonsUsed.has('cool') || seasonsUsed.has('perennial'))) {
    bar.add(10, 'Mixes warm-season and cool-season crops, which are planted and growing at different times of year.', cite('davis-2012', 'nrcs-328'));
  } else {
    bar.note('All cash crops grow in the same season, so the field follows the same calendar every year.', cite('nrcs-328'));
  }
  if (covers.length) bar.add(10, `Adds a cover crop species (${[...new Set(covers.map((c) => c.name))].join(', ')}).`, cite('sare-mccp'));
  if (unconfirmed) bar.note('Some past crops came from USDA’s Cropland Data Layer and you haven’t confirmed them yet.', [{ kind: 'history', text: 'Crops marked “Check this info” on the Fields tab' }]);
  return bar.done();
}

const PEST_CITES: Record<'rootworm' | 'scn' | 'white-mold', CitationId> = { rootworm: 'gray-2009', scn: 'scn-coalition', 'white-mold': 'peltier-2012' };

function pestsBar(st: Strategy, inputs: RotationInputs, knownSeasons: number, unconfirmed: boolean): BarScore {
  if (knownSeasons < 2) {
    return unscored('pests', ['an earlier season'], 'Not enough info: enter at least one earlier season on the Fields tab so FieldShift can see what follows what.', [{ kind: 'history', text: 'Crop history on the Fields tab' }]);
  }
  const current = inputs.seasons[inputs.seasons.length - 1].ids!;
  const seq: string[][] = [current, ...st.seasons.map(seasonIds)];
  const bar = new Bar('pests', 50, unconfirmed ? 'medium' : 'high');
  bar.start(50, 'Starts at 50, then rises or falls with how often host crops repeat.', cite('nrcs-328'));

  // Longest run of the same crop that touches a planned season.
  let longest = 1;
  let longestCrop = seq[1][0];
  for (const id of new Set(seq.flat())) {
    let run = 0;
    for (let i = 0; i < seq.length; i++) {
      run = seq[i].includes(id) ? run + 1 : 0;
      if (i >= 1 && run > longest) {
        longest = run;
        longestCrop = id;
      }
    }
  }
  if (longest === 1) bar.add(20, 'No crop follows itself, so pests and diseases that build up on one crop lose their host every year.', cite('nrcs-328', 'davis-2012'));
  else if (longest === 2) bar.note(`${cropName(longestCrop)} follows itself once, which gives its pests two seasons in a row.`, cite('nrcs-328'));
  else bar.add(-20, `${cropName(longestCrop)} is grown ${longest} years in a row, so pests and diseases of that crop can build up.`, cite('nrcs-328'));

  const problems = inputs.answers.problems;
  const pq = 'Which problems have you had on this field?';
  if (problems === undefined || problems === 'unsure') {
    bar.assume(-10, 'pest history', 'Pest history is unknown, so FieldShift assumed some pressure (half of a repeated-host penalty).', [answer(pq, problems === 'unsure' ? 'Not sure' : 'Not answered')]);
  } else if (problems.length === 0) {
    bar.note('You reported none of the listed pest problems.', [answer(pq, 'None of these')]);
  } else {
    for (const p of problems) pestRule(bar, p, seq, st, pq);
  }
  // Green bridge: a living grass cover right up to corn planting.
  const greenBridge = st.seasons.some((s, i) => s.cover && !s.cover.pick.species.winterKills && s.cover.pick.species.family === 'grasses' && (st.seasons[i + 1]?.ids ?? []).includes('corn'));
  if (greenBridge) bar.note('A grass cover ended right before corn can carry some insects (such as armyworm) into the crop. End it 10–14 days ahead.', cite('sare-mccp'));
  return bar.done();
}

function pestRule(bar: Bar, p: Problem, seq: string[][], st: Strategy, pq: string) {
  const src = answer(pq, PROBLEM_LABELS[p]);
  if (p === 'rootworm' || p === 'scn' || p === 'white-mold') {
    const hosts = HOSTS[p];
    const planned = seq.slice(1);
    const back2back = seq.some((ids, i) => i >= 1 && hasHost(ids, hosts) && hasHost(seq[i - 1], hosts));
    const name = PROBLEM_LABELS[p];
    if (back2back) {
      bar.add(-15, `${name}: a host crop follows a host crop, so the pest keeps its food source.`, [src, ...cite(PEST_CITES[p])]);
      return;
    }
    if (!planned.some((ids) => hasHost(ids, hosts))) {
      bar.add(10, `${name}: no host crop is planned, so the population should decline.`, [src, ...cite(PEST_CITES[p])]);
      return;
    }
    // Shortest gap (non-host seasons) between two host seasons.
    let gap = Infinity;
    let lastHost = -1;
    seq.forEach((ids, i) => {
      if (hasHost(ids, hosts)) {
        if (lastHost >= 0) gap = Math.min(gap, i - lastHost - 1);
        lastHost = i;
      }
    });
    if (p === 'rootworm') {
      bar.add(10, `${name}: corn never follows corn, which breaks the larvae’s life cycle. Watch for the rotation-resistant variant in your area.`, [src, ...cite('gray-2009')]);
    } else if (gap >= 2) {
      bar.add(10, `${name}: at least two non-host seasons between host crops.`, [src, ...cite(PEST_CITES[p])]);
    } else {
      bar.add(5, `${name}: one non-host season between host crops helps, but a longer break helps more.`, [src, ...cite(PEST_CITES[p])]);
    }
    return;
  }
  if (p === 'resistant-weeds') {
    const cool = st.seasons.some((s) => s.ids.some((id) => SMALL_GRAINS.has(id) || agronomyOf(id)?.season !== 'warm'));
    const cereal = st.seasons.some((s) => s.cover && !s.cover.pick.species.winterKills && s.cover.pick.species.family === 'grasses');
    if (cool) bar.add(10, 'Resistant weeds: a crop planted at a different time of year disrupts summer annual weeds such as waterhemp.', [src, ...cite('davis-2012')]);
    else if (cereal) bar.add(5, 'Resistant weeds: a winter cereal cover’s residue helps suppress early weed flushes.', [src, ...cite('sare-mccp')]);
    else bar.note('Resistant weeds: the same planting window every year favours the same weeds.', [src, ...cite('davis-2012')]);
  }
  // erosion and wet spots are handled by soil cover and its weight.
}

function climateBar(st: Strategy, inputs: RotationInputs): BarScore {
  if (!inputs.climate) {
    return unscored(
      'climate',
      ['NASA POWER climate normals'],
      inputs.lookupsOff ? 'Not enough info: public data lookups are off, so this field has no climate normals.' : 'Not enough info: NASA POWER climate normals for this field have not loaded.',
      [{ kind: 'data', label: 'Climate normals', display: 'Missing', provider: 'NASA POWER', honesty: 'Estimated' }],
    );
  }
  const c = inputs.climate.value;
  const climateSrc = data(inputs.climate);
  const irrigation = known(inputs.answers.irrigation);
  const iq = 'Is this field irrigated?';
  const bar = new Bar('climate', 0, 'medium');
  const sum = (months: number[]) => Math.round(months.reduce((a, m) => a + c.monthlyRainIn[m - 1], 0) * 10) / 10;
  bar.note('Based on 30-year normals for a roughly 50 km NASA POWER grid cell, not your field’s own weather.', [climateSrc]);

  if (st.id === 'keep') {
    bar.start(70, 'Starts at 70: you already grow these crops here, which is good evidence they suit the climate.', [{ kind: 'history', text: 'Your crop history' }]);
    const summerRain = sum([5, 6, 7, 8]);
    if (st.seasons.some((s) => s.ids.includes('corn')) && summerRain < 12) {
      if (irrigation === 'none') bar.add(-10, `Only about ${summerRain} in of normal May–August rain for rain-fed corn.`, [climateSrc, answer(iq, IRRIGATION_LABELS.none)]);
      else if (irrigation === 'supplemental') bar.add(-3, `About ${summerRain} in of normal May–August rain; your irrigation covers dry spells.`, [climateSrc, answer(iq, IRRIGATION_LABELS.supplemental)]);
      else if (irrigation === undefined) bar.assume(-10, 'irrigation', `About ${summerRain} in of normal May–August rain, and irrigation is unknown.`, [climateSrc, answer(iq, 'Not answered')]);
    }
    return bar.done();
  }

  if (st.id === 'cover') {
    bar.start(60, 'Starts at 60: a cover crop has to establish in the short window after harvest.', cite('sare-mccp'));
    const gap = st.seasons.find((s) => s.cover);
    if (gap?.cover) {
      const sp = gap.cover.pick.species;
      const gdd = fallGdd40(c.monthlyMeanTempF, gap.crops[gap.crops.length - 1].harvest);
      const need = Math.max(sp.fallGddNeed, 1);
      if (gdd >= 1.5 * need) bar.add(20, `Plenty of fall warmth after harvest in ${MONTH_NAMES[gap.cover.plantMonth - 1]} for ${sp.name.toLowerCase()} (about ${gdd} GDD, needs ${sp.fallGddNeed}).`, [climateSrc, ...cite(...sp.sources)]);
      else if (gdd >= need) bar.add(10, `Just enough fall warmth for ${sp.name.toLowerCase()} after harvest (about ${gdd} GDD, needs ${sp.fallGddNeed}). Seed promptly.`, [climateSrc, ...cite(...sp.sources)]);
      else bar.add(-20, `Too little fall warmth after harvest for a cover to establish (about ${gdd} GDD). Interseeding into the standing crop may work better.`, [climateSrc, ...cite('sare-mccp', 'mccc')]);
    }
    const spring = sum([4, 5]);
    if (spring < 5) {
      if (irrigation === 'none') bar.add(-10, `Only about ${spring} in of normal April–May rain: a cover uses spring soil water the next crop needs.`, [climateSrc, answer(iq, IRRIGATION_LABELS.none), ...cite('sare-mccp')]);
      else if (irrigation === undefined) bar.assume(-10, 'irrigation', `About ${spring} in of normal April–May rain, and irrigation is unknown.`, [climateSrc, answer(iq, 'Not answered'), ...cite('sare-mccp')]);
    }
    recentDryness(bar, inputs);
    return bar.done();
  }

  // small grains
  bar.start(65, 'Starts at 65: small grains are widely adapted across the central and northern US.', cite('davis-2012'));
  const june = c.monthlyMeanTempF[5];
  if (june >= 77) bar.add(-10, `June averages about ${Math.round(june)} °F, and heat during grain fill cuts small-grain yield.`, [climateSrc, ...cite('farooq-2011')]);
  else bar.note(`June averages about ${Math.round(june)} °F, mild enough for small-grain fill.`, [climateSrc, ...cite('farooq-2011')]);
  if (c.monthlyMeanTempF[7] >= 60 && c.monthlyMeanTempF[8] >= 60) bar.add(10, 'August and September stay warm, so clover or a cover has time to grow after the small grain comes off in July.', [climateSrc, ...cite('sare-mccp', 'mccc')]);
  if (st.smallGrain === 'winter-wheat') {
    const coldest = coldestMonthF(c.monthlyMeanTempF);
    bar.note(`The coldest month averages about ${Math.round(coldest)} °F, usually fine for winter wheat (snow cover helps).`, [climateSrc]);
  }
  const spring = sum([3, 4]);
  if (spring > 7) bar.add(-5, `A wet March–April (about ${spring} in normally) can delay early small-grain seeding.`, [climateSrc, ...cite('nass-dates')]);
  return bar.done();
}

/** Recent weather only nudges the score: it says how risky establishing a cover is this fall. */
function recentDryness(bar: Bar, inputs: RotationInputs) {
  const signals: Array<{ dry: boolean; src: ReasonSource; text: string }> = [];
  if (inputs.rain30 && inputs.rainNormal30 && inputs.rainNormal30.value > 0) {
    const pct = Math.round((100 * inputs.rain30.value) / inputs.rainNormal30.value);
    signals.push({ dry: pct < 50, src: data(inputs.rain30), text: `last 30 days had ${pct}% of normal rain (NASA POWER)` });
  }
  if (inputs.imergRain30 && inputs.rainNormal30 && inputs.rainNormal30.value > 0) {
    const pct = Math.round((100 * inputs.imergRain30.value) / inputs.rainNormal30.value);
    signals.push({ dry: pct < 50, src: data(inputs.imergRain30), text: `satellite rain is ${pct}% of normal (GPM IMERG)` });
  }
  if (inputs.smapSoilMoisture) {
    signals.push({ dry: inputs.smapSoilMoisture.value < 0.15, src: data(inputs.smapSoilMoisture), text: `surface soil moisture is ${inputs.smapSoilMoisture.value} m³/m³ (SMAP)` });
  }
  if (!signals.length) {
    bar.assume(-5, 'recent rain and soil moisture', 'Recent rain and soil moisture are unknown, so the risk of a dry fall seeding was assumed to be moderate.', cite('sare-mccp'));
    return;
  }
  const dry = signals.filter((s) => s.dry);
  if (dry.length) bar.add(-5, `Dry right now: ${dry.map((s) => s.text).join('; ')}. A fall-seeded cover may establish poorly this year.`, [...dry.map((s) => s.src), ...cite('sare-mccp')]);
  else bar.note(`Recent moisture looks adequate: ${signals.map((s) => s.text).join('; ')}.`, signals.map((s) => s.src));
}

// ---------- caveats (not scored) ----------

function caveats(st: Strategy, inputs: RotationInputs): Reason[] {
  const a = inputs.answers;
  const out: Reason[] = [];
  if (st.id === 'keep') out.push({ text: 'No new equipment, seed or markets are needed.', sources: [{ kind: 'history', text: 'Your current rotation' }] });
  if (st.id === 'cover') {
    const exp = known(a.coverExperience);
    const q = 'Have you grown cover crops before?';
    if (exp === 'never') out.push({ text: 'First time with cover crops: try one field first, and ask your NRCS office about cost-share (EQIP).', sources: [answer(q, COVER_LABELS.never), ...cite('nrcs-340')] });
    else if (exp) out.push({ text: 'You have grown covers before, so seeding and termination are familiar.', sources: [answer(q, COVER_LABELS[exp])] });
    if (a.livestock === 'yes') out.push({ text: 'Your livestock can graze the cover in fall or early spring.', sources: [answer('Do you keep livestock or need forage?', YES_NO_LABELS.yes), ...cite('sare-mccp')] });
  }
  if (st.id === 'small-grains') {
    const eq = known(a.smallGrainEquipment);
    const mk = known(a.smallGrainMarket);
    const eqQ = 'Do you have a grain drill and a small-grain combine head?';
    const mkQ = 'Is there a local buyer for small grains?';
    if (eq === 'no') out.push({ text: 'You said you lack small-grain equipment: custom hire or rent a drill and a head.', sources: [answer(eqQ, YES_NO_LABELS.no)] });
    else if (eq === undefined) out.push({ text: 'Check you have a grain drill and a small-grain combine head, or someone to custom hire.', sources: [answer(eqQ, 'Not answered')] });
    if (mk === 'no') out.push({ text: 'No local buyer: feed the grain on farm, sell straw, or look for a seed or feed buyer before planting.', sources: [answer(mkQ, YES_NO_LABELS.no), ...cite('davis-2012')] });
    else if (mk === undefined) out.push({ text: 'Check for a buyer (elevator, feed mill, a neighbour with livestock) before planting.', sources: [answer(mkQ, 'Not answered')] });
    if (a.livestock === 'yes') out.push({ text: 'Oats, straw and clover hay can feed your livestock.', sources: [answer('Do you keep livestock or need forage?', YES_NO_LABELS.yes), ...cite('davis-2012')] });
  }
  return out;
}

// ---------- weights and best fit ----------

function weightsFor(inputs: RotationInputs): { weights: Record<BarId, number>; reasons: Reason[] } {
  const weights: Record<BarId, number> = { soilCover: 1, diversity: 1, pests: 1, climate: 1 };
  const reasons: Reason[] = [];
  const problems = Array.isArray(inputs.answers.problems) ? inputs.answers.problems : [];
  const slope = inputs.slopePct;
  if (problems.includes('erosion') || (slope && slope.value >= 6)) {
    weights.soilCover = 2;
    const sources: ReasonSource[] = [...cite('nrcs-340')];
    if (problems.includes('erosion')) sources.unshift(answer('Which problems have you had on this field?', PROBLEM_LABELS.erosion));
    if (slope && slope.value >= 6) sources.unshift(data(slope));
    reasons.push({ text: 'Soil cover counts double in the best fit because this field is at risk of erosion.', sources });
  }
  return { weights, reasons };
}

function overallOf(bars: BarScore[], weights: Record<BarId, number>): number | null {
  const scored = bars.filter((b) => b.score !== null);
  if (scored.length < MIN_SCORED_BARS) return null;
  const w = scored.reduce((a, b) => a + weights[b.id], 0);
  return Math.round((10 * scored.reduce((a, b) => a + b.score! * weights[b.id], 0)) / w) / 10;
}

/** Score all three strategies for one field and pick the best fit. */
export function scoreRotation(inputs: RotationInputs): RotationResult {
  const set = buildStrategies(inputs);
  const { weights, reasons: weightReasons } = weightsFor(inputs);
  if (set.problem) return { strategies: [], bestFit: null, bestFitReason: set.problem, weights, weightReasons, problem: set.problem, knownSeasons: 0 };
  const firstYear = inputs.currentYear + 1;
  const unconfirmed = inputs.seasons.some((s) => s.status === 'detected');
  const strategies: StrategyScore[] = set.strategies.map((st) => {
    const bars = [soilCoverBar(st, inputs, firstYear), diversityBar(st, inputs, set.knownSeasons, unconfirmed), pestsBar(st, inputs, set.knownSeasons, unconfirmed), climateBar(st, inputs)];
    return { strategy: st, bars, overall: overallOf(bars, weights), caveats: caveats(st, inputs) };
  });
  const ranked = strategies.filter((s) => s.overall !== null).sort((a, b) => b.overall! - a.overall! || a.strategy.practiceChanges - b.strategy.practiceChanges);
  if (!ranked.length) {
    return {
      strategies,
      bestFit: null,
      bestFitReason: `Not enough info to pick a best fit: each strategy needs at least ${MIN_SCORED_BARS} of the 4 bars scored.`,
      weights,
      weightReasons,
      knownSeasons: set.knownSeasons,
    };
  }
  let best = ranked[0];
  // Within one point is a tie: prefer the strategy that changes less.
  const tied = ranked.filter((s) => best.overall! - s.overall! < 1);
  best = tied.sort((a, b) => a.strategy.practiceChanges - b.strategy.practiceChanges)[0];
  const others = ranked.filter((s) => s !== best).map((s) => `${s.strategy.title.toLowerCase()} ${s.overall}`);
  const reason =
    tied.length > 1
      ? `${best.strategy.title} ties within a point (${best.overall}) and changes the least, so it is the best fit.`
      : `${best.strategy.title} has the highest average across the bars (${best.overall}${others.length ? `, vs ${others.join(' and ')}` : ''}).`;
  return { strategies, bestFit: best.strategy.id, bestFitReason: reason, weights, weightReasons, knownSeasons: set.knownSeasons };
}
