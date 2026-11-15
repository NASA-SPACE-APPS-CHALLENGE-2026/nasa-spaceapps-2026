import type { ClimateNormals } from '../types';
import { coldestMonthF, fallGdd40, familyOf, LEGUME_CASH, SMALL_GRAINS, type Family } from './agronomy';
import type { CitationId } from './citations';

/**
 * Cover-crop rule table. Thresholds are rounded, documented placeholders drawn from the general guidance in
 * SARE "Managing Cover Crops Profitably" and Midwest Cover Crops Council species guides. Local seeding dates
 * from the MCCC decision tool or an NRCS office always win over these.
 */
export type CoverGoal = 'erosion' | 'nitrogen' | 'weeds' | 'grazing' | 'compaction' | 'scavenge';

export interface CoverSpecies {
  id: string;
  name: string;
  family: Family;
  /** Dies over a normal winter, so there is nothing to terminate in spring. */
  winterKills: boolean;
  /** Coldest-month normal (°F) the species usually survives. Ignored for winter-killed species. */
  minColdestF: number;
  /** Fall GDD (base 40 °F) it needs after seeding to establish before winter. */
  fallGddNeed: number;
  goals: CoverGoal[];
  seeding: string;
  termination: string;
  /** Only sown into or right after a small grain (frost-seeding, underseeding). */
  afterSmallGrainOnly?: boolean;
  sources: CitationId[];
}

export const COVER_SPECIES: CoverSpecies[] = [
  {
    id: 'cereal-rye',
    name: 'Cereal rye',
    family: 'grasses',
    winterKills: false,
    minColdestF: -30,
    fallGddNeed: 100,
    goals: ['erosion', 'weeds', 'scavenge', 'grazing'],
    seeding: 'Drill or broadcast right after harvest. It still establishes when seeded late in fall.',
    termination: 'Before corn, end it 10–14 days ahead of planting. Soybeans can be planted green into it.',
    sources: ['sare-mccp', 'mccc'],
  },
  {
    id: 'winter-wheat-cover',
    name: 'Winter wheat (as a cover)',
    family: 'grasses',
    winterKills: false,
    minColdestF: -15,
    fallGddNeed: 150,
    goals: ['erosion', 'grazing', 'scavenge'],
    seeding: 'Drill soon after harvest. It is cheaper seed than rye but needs a slightly earlier start.',
    termination: 'End it in spring 1–2 weeks before planting. It is easier to manage than rye.',
    sources: ['sare-mccp', 'mccc'],
  },
  {
    id: 'oats',
    name: 'Oats',
    family: 'grasses',
    winterKills: true,
    minColdestF: 99,
    fallGddNeed: 500,
    goals: ['erosion', 'grazing', 'scavenge'],
    seeding: 'Seed in late summer, about 6–8 weeks before the first hard frost.',
    termination: 'Winter-kills in most of the Corn Belt, leaving a mulch with no spring termination.',
    sources: ['sare-mccp', 'mccc'],
  },
  {
    id: 'radish',
    name: 'Forage radish',
    family: 'brassicas',
    winterKills: true,
    minColdestF: 99,
    fallGddNeed: 600,
    goals: ['compaction', 'scavenge'],
    seeding: 'Seed by late summer, often mixed with oats. It needs warm weeks to grow a taproot.',
    termination: 'Winter-kills after a few nights in the low 20s °F. The residue breaks down fast in spring.',
    sources: ['sare-mccp', 'mccc'],
  },
  {
    id: 'hairy-vetch',
    name: 'Hairy vetch',
    family: 'legumes',
    winterKills: false,
    minColdestF: 10,
    fallGddNeed: 500,
    goals: ['nitrogen', 'erosion'],
    seeding: 'Seed in late summer or early fall, often with cereal rye so it has something to climb.',
    termination: 'Most nitrogen comes from growth at flowering in late spring, so termination and corn planting are later.',
    sources: ['sare-mccp', 'mccc'],
  },
  {
    id: 'crimson-clover',
    name: 'Crimson clover',
    family: 'legumes',
    winterKills: false,
    minColdestF: 25,
    fallGddNeed: 600,
    goals: ['nitrogen', 'erosion'],
    seeding: 'Seed in late summer. It suits mild winters (the South and lower Midwest).',
    termination: 'End it at early bloom in spring, before corn or cotton.',
    sources: ['sare-mccp'],
  },
  {
    id: 'red-clover',
    name: 'Red clover',
    family: 'legumes',
    winterKills: false,
    minColdestF: -30,
    fallGddNeed: 0,
    goals: ['nitrogen', 'erosion', 'grazing'],
    seeding: 'Frost-seed into winter wheat in late winter, or sow with oats in spring. It grows on after the grain is harvested.',
    termination: 'End it the next spring before corn, or keep it a season for hay or grazing.',
    afterSmallGrainOnly: true,
    sources: ['sare-mccp', 'davis-2012'],
  },
];

export interface CoverContext {
  /** Cash crop the cover follows (catalog id). */
  prevCrop: string;
  /** Cash crop the cover comes before (catalog id), if known. */
  nextCrop?: string;
  /** Month the previous crop is harvested (1–12). */
  harvestMonth: number;
  climate?: ClimateNormals;
  goals: CoverGoal[];
}

export interface CoverPick {
  species: CoverSpecies;
  /** true = the climate checks pass; false = they fail; null = climate data missing, so it was not checked. */
  fits: boolean | null;
  rank: number;
  why: string[];
  fallGdd?: number;
}

/** Rank the cover crops for one gap between cash crops, best first. */
export function suggestCovers(ctx: CoverContext): CoverPick[] {
  const prevSmallGrain = SMALL_GRAINS.has(ctx.prevCrop);
  const nextFamily = ctx.nextCrop ? familyOf(ctx.nextCrop) : undefined;
  const nextIsCorn = ctx.nextCrop === 'corn' || ctx.nextCrop === 'sweet-corn' || ctx.nextCrop === 'popcorn' || ctx.nextCrop === 'sorghum';
  const nextIsLegume = !!ctx.nextCrop && LEGUME_CASH.has(ctx.nextCrop);
  const gdd = ctx.climate ? fallGdd40(ctx.climate.monthlyMeanTempF, ctx.harvestMonth) : undefined;
  const coldest = ctx.climate ? coldestMonthF(ctx.climate.monthlyMeanTempF) : undefined;

  const picks: CoverPick[] = [];
  for (const s of COVER_SPECIES) {
    if (s.afterSmallGrainOnly && !prevSmallGrain) continue;
    const why: string[] = [];
    let rank = 0;
    let fits: boolean | null = null;
    if (gdd !== undefined && coldest !== undefined) {
      const warmEnough = gdd >= s.fallGddNeed;
      const survives = s.winterKills || coldest >= s.minColdestF;
      fits = warmEnough && survives;
      if (!warmEnough) why.push(`About ${gdd} fall growing degree days after harvest, and it needs about ${s.fallGddNeed}.`);
      else if (s.fallGddNeed > 0) why.push(`Enough fall warmth after harvest (about ${gdd} GDD, needs ${s.fallGddNeed}).`);
      if (!survives) why.push(`Winters here are too cold for it (coldest month averages ${Math.round(coldest)} °F).`);
      rank += fits ? 10 : -10;
    } else {
      // No climate data: only the most forgiving species are presented without a warning.
      fits = null;
      rank += s.fallGddNeed <= 150 ? 2 : -2;
      why.push('Climate data is missing, so the fall seeding window was not checked.');
    }
    if (prevSmallGrain && s.afterSmallGrainOnly) {
      rank += 6;
      why.push('Fits right into a small grain: frost-seed or underseed it, and it is growing when the grain comes off.');
    }
    if (nextIsCorn) {
      if (s.family === 'legumes') {
        rank += 4;
        why.push('A legume before corn can supply part of the corn’s nitrogen.');
      }
      if (s.winterKills) {
        rank += 3;
        why.push('Winter-kills, so there is nothing to end before corn planting.');
      }
      if (s.id === 'cereal-rye') {
        rank -= 2;
        why.push('Before corn, end rye early. A rye cover going into corn can tie up nitrogen.');
      }
    }
    if (nextIsLegume) {
      if (s.family === 'grasses' && !s.winterKills) {
        rank += 4;
        why.push('A winter cereal before soybeans is the most forgiving combination: soybeans don’t need the nitrogen.');
      }
      if (s.family === 'legumes') rank -= 2;
    }
    if (nextFamily && s.family === nextFamily && s.family !== 'grasses') {
      rank -= 1;
      why.push('It is the same family as the next crop, so it gives less of a disease break.');
    }
    for (const g of ctx.goals) {
      if (s.goals.includes(g)) {
        rank += g === 'erosion' || g === 'weeds' ? 2 : 1;
        why.push(GOAL_REASON[g]);
      }
    }
    picks.push({ species: s, fits, rank, why, fallGdd: gdd });
  }
  return picks.sort((a, b) => b.rank - a.rank || a.species.fallGddNeed - b.species.fallGddNeed);
}

const GOAL_REASON: Record<CoverGoal, string> = {
  erosion: 'Holds soil over winter (you flagged erosion).',
  nitrogen: 'Fixes nitrogen from the air.',
  weeds: 'Dense residue helps suppress weeds (you flagged resistant weeds).',
  grazing: 'Can be grazed by your livestock.',
  compaction: 'A deep taproot can open up compacted or wet ground.',
  scavenge: 'Picks up nitrogen left after harvest so less leaches away.',
};

/** The one cover a strategy schedules for a gap: the best fitting pick, or the most forgiving one if none fit. */
export function pickCover(ctx: CoverContext): CoverPick {
  const ranked = suggestCovers(ctx);
  return ranked.find((p) => p.fits !== false) ?? ranked.find((p) => p.species.id === 'cereal-rye') ?? ranked[0];
}
