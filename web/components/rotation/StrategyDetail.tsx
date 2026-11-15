'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { MONTH_NAMES } from '@/lib/domain/management';
import { planFromStrategy } from '@/lib/domain/plan';
import { cropName } from '@/lib/domain/rotation/agronomy';
import { CITATIONS } from '@/lib/domain/rotation/citations';
import { suggestCovers, type CoverPick } from '@/lib/domain/rotation/coverCrops';
import type { DataPoint, RotationInputs } from '@/lib/domain/rotation/inputs';
import type { StrategyScore } from '@/lib/domain/rotation/score';
import { goalsFor, type Strategy } from '@/lib/domain/rotation/strategies';
import type { StrategyId } from '@/lib/domain/types';
import { useFarm, useStore } from '@/lib/client/StoreProvider';
import { useActiveField } from '@/lib/client/useActiveField';
import { useRotation } from '@/lib/client/useRotation';
import { Button } from '../ui/Button';
import { NoFieldsYet } from '../ui/FieldPicker';
import { ScoreAccordion } from './ScoreAccordion';
import { SeasonTable } from './SeasonPreview';
import { InputBadge, ReasonList, SourceList } from './Sources';

const SECTION = 'rounded-parcel border border-line bg-panel p-4 lg:p-5';

export function StrategyDetail({ strategyId }: { strategyId: StrategyId }) {
  const store = useStore();
  const router = useRouter();
  const { plans } = useFarm();
  const { field, loaded } = useActiveField();
  const rotation = useRotation(field);

  useEffect(() => {
    if (field) store.ensureLookups(field.id);
  }, [field?.id, store]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) return <Shell><p role="status">Loading…</p></Shell>;
  if (!field || !rotation) return <Shell><NoFieldsYet what="Rotation Explorer" /></Shell>;
  const back = `/rotation?field=${field.id}`;
  const s = rotation.result.strategies.find((x) => x.strategy.id === strategyId);
  if (!s) {
    return (
      <Shell>
        <BackLink href={back} />
        <p className="mt-4 text-[16px]">{rotation.result.problem ?? 'This strategy is not available for this field.'}</p>
      </Shell>
    );
  }
  const best = rotation.result.bestFit === strategyId;
  const existing = plans.filter((p) => p.fieldId === field.id && p.strategyId === strategyId);

  const makePlan = async () => {
    const plan = planFromStrategy(s.strategy, field, rotation.answers);
    await store.savePlan(plan);
    router.push(`/planner?field=${field.id}&plan=${plan.id}`);
  };

  return (
    <Shell>
      <BackLink href={back} />
      <header className="mt-3">
        <p className="text-[14.5px] font-semibold text-ink-soft">{field.name}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-plate text-3xl">{s.strategy.title}</h1>
          {best && <span className="rounded-full bg-field px-2.5 py-1 text-[13px] font-bold text-white">Best fit</span>}
        </div>
        <p className="mt-1 max-w-3xl text-[16.5px] text-ink-soft">{s.strategy.summary}</p>
        {s.strategy.notes.map((n, i) => (
          <p key={i} className="mt-2 max-w-3xl text-[14.5px] text-ink-soft">
            {n}
          </p>
        ))}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void makePlan()}>Make this my plan</Button>
          {existing.length > 0 && (
            <Link href={`/planner?field=${field.id}&plan=${existing[existing.length - 1].id}`} className="inline-flex min-h-12 items-center rounded-parcel border border-line-strong bg-panel px-4 text-[15px] font-semibold hover:border-field hover:text-field">
              Open the plan you made
            </Link>
          )}
        </div>
      </header>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-5">
          <section aria-labelledby="seasons-h" className={SECTION}>
            <h2 id="seasons-h" className="font-plate text-xl">
              Season by season
            </h2>
            <p className="mt-1 text-[14px] text-ink-faint">Usual months for the central US. You can change every date in the Planner.</p>
            <div className="mt-3">
              <SeasonTable strategy={s.strategy} />
            </div>
          </section>
          <InputsUsed inputs={rotation.inputs} />
          <GroundChecks s={s} inputs={rotation.inputs} />
        </div>
        <div className="space-y-5">
          <section aria-labelledby="scores-h" className={SECTION}>
            <h2 id="scores-h" className="font-plate text-xl">
              Scores and why
            </h2>
            <p className="mt-1 text-[14px] text-ink-faint">Average {s.overall ?? 'not available'}. Open a score to see why.</p>
            <div className="mt-4 space-y-3">
              {s.bars.map((b) => (
                <ScoreAccordion key={b.id} bar={b} />
              ))}
            </div>
          </section>
          <CoverSuggestions strategy={s.strategy} inputs={rotation.inputs} />
          {s.caveats.length > 0 && (
            <section aria-labelledby="caveats-h" className={SECTION}>
              <h2 id="caveats-h" className="font-plate text-xl">
                Practical points (not scored)
              </h2>
              <div className="mt-3">
                <ReasonList reasons={s.caveats} />
              </div>
            </section>
          )}
        </div>
      </div>
      <p className="mt-6 text-[13.5px] text-ink-faint">Scores come from a placeholder rubric (docs/rotation-rubric.md). They are not a yield, profit or pest forecast and have not been reviewed by agronomists yet.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:py-8">{children}</div>
    </div>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link href={href} className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-parcel px-2 font-semibold text-field hover:bg-field-tint">
      <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
        <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      All strategies
    </Link>
  );
}

/** Cover-crop options for each gap between cash crops in this strategy (deduplicated by crop pair). */
function CoverSuggestions({ strategy, inputs }: { strategy: Strategy; inputs: RotationInputs }) {
  const gaps: Array<{ key: string; title: string; picks: CoverPick[]; scheduled?: string }> = [];
  strategy.seasons.forEach((s, i) => {
    const last = s.crops[s.crops.length - 1];
    if (!last || last.perennial) return;
    const next = strategy.seasons[i + 1]?.crops[0];
    if (next && (next.perennial || next.plantYear === s.year)) return;
    const key = `${last.id}>${next?.id ?? ''}`;
    if (gaps.some((g) => g.key === key)) return;
    const picks = suggestCovers({ prevCrop: last.id, nextCrop: next?.id, harvestMonth: last.harvest, climate: inputs.climate?.value, goals: goalsFor(inputs) }).slice(0, 3);
    gaps.push({ key, title: `After ${cropName(last.id).toLowerCase()} (harvest ${MONTH_NAMES[last.harvest - 1]})${next ? `, before ${cropName(next.id).toLowerCase()}` : ''}`, picks, scheduled: s.cover?.pick.species.id });
  });
  return (
    <section aria-labelledby="covers-h" className={SECTION} data-testid="cover-suggestions">
      <h2 id="covers-h" className="font-plate text-xl">
        Cover crop suggestions
      </h2>
      <p className="mt-1 text-[14px] text-ink-faint">Ranked for this field’s fall weather, the next crop and your answers. Check local seeding dates with the Midwest Cover Crops Council tool or your NRCS office.</p>
      {gaps.length === 0 && <p className="mt-3 text-[15px]">This rotation has no gap between cash crops for a cover crop (a fall-sown or perennial crop already covers the soil).</p>}
      <div className="mt-4 space-y-5">
        {gaps.map((g) => (
          <div key={g.key}>
            <h3 className="text-[16px] font-semibold">{g.title}</h3>
            <ol className="mt-2 space-y-3">
              {g.picks.map((p) => (
                <li key={p.species.id} className="rounded-parcel border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[16px] font-semibold">{p.species.name}</p>
                    {g.scheduled === p.species.id && <span className="rounded-full bg-field-tint px-2 py-0.5 text-[12.5px] font-semibold text-field">In this strategy</span>}
                    <FitBadge fits={p.fits} />
                  </div>
                  <ul className="mt-1 space-y-0.5 text-[14.5px] text-ink-soft">
                    {p.why.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[14.5px]">
                    <strong>Seeding:</strong> {p.species.seeding}
                  </p>
                  <p className="text-[14.5px]">
                    <strong>Ending it:</strong> {p.species.termination}
                  </p>
                  <SourceList sources={[...p.species.sources.map((id) => ({ kind: 'citation' as const, id })), ...(inputs.climate ? [{ kind: 'data' as const, label: inputs.climate.label, display: 'fall temperatures', provider: inputs.climate.provider, honesty: inputs.climate.honesty }] : [])]} />
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}

function FitBadge({ fits }: { fits: boolean | null }) {
  if (fits === null) return <span className="rounded-full border border-line-strong bg-paper px-2 py-0.5 text-[12.5px] font-semibold text-ink-soft">Climate not checked</span>;
  return fits ? (
    <span className="rounded-full bg-field-tint px-2 py-0.5 text-[12.5px] font-semibold text-field">Fits this field’s climate</span>
  ) : (
    <span className="rounded-full bg-alert-tint px-2 py-0.5 text-[12.5px] font-semibold text-alert">Poor fit here</span>
  );
}

function InputsUsed({ inputs }: { inputs: RotationInputs }) {
  const rows: Array<[string, DataPoint<unknown> | undefined]> = [
    ['Climate normals (NASA POWER)', inputs.climate],
    ['Rain, last 30 days (NASA POWER)', inputs.rain30],
    ['Normal rain for those dates', inputs.rainNormal30],
    ['Satellite rain, last 30 days (GPM IMERG)', inputs.imergRain30],
    ['Satellite soil moisture (SMAP)', inputs.smapSoilMoisture],
    ['Surface texture', inputs.texture],
    ['Organic matter', inputs.organicMatter],
    ['Drainage class', inputs.drainage],
    ['Average slope', inputs.slopePct],
  ];
  return (
    <section aria-labelledby="inputs-h" className={SECTION}>
      <h2 id="inputs-h" className="font-plate text-xl">
        Field data used
      </h2>
      <dl className="mt-3 divide-y divide-line">
        {rows.map(([label, p]) => (
          <div key={label} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
            <dt className="text-[14.5px] text-ink-soft">{label}</dt>
            <dd className="flex items-center gap-2 text-[14.5px]">
              {p ? (
                <>
                  <span className="font-semibold">{p.display}</span>
                  <InputBadge honesty={p.honesty} />
                </>
              ) : (
                <span className="text-ink-faint">Not available</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[13.5px] text-ink-faint">Missing values are shown as missing; PlotTwist never fills them in.</p>
    </section>
  );
}

function GroundChecks({ s, inputs }: { s: StrategyScore; inputs: RotationInputs }) {
  const items: string[] = [];
  if (inputs.seasons.some((x) => x.status === 'detected')) items.push('Confirm the past crops marked “Check this info” on the Fields tab; some reasons depend on them.');
  if (!inputs.answers.soilTest) items.push('Take a soil test (pH, P, K, organic matter) if the last one is more than 3–4 years old.');
  if (s.strategy.seasons.some((x) => x.ids.includes('soybeans'))) items.push('Sample for soybean cyst nematode egg counts after a soybean harvest.');
  if (s.strategy.seasons.some((x) => x.cover)) items.push('Walk the field after seeding the cover: aim for an even stand before winter.');
  if (s.strategy.id === 'small-grains') items.push('Confirm a buyer and seed source for the small grain before ordering seed.');
  items.push('Look for washed areas, gullies and ponding after heavy rain. Soil cover matters most there.');
  items.push('Check seeding dates and cost-share programmes (such as EQIP) with your local NRCS office.');
  return (
    <section aria-labelledby="checks-h" className={SECTION}>
      <h2 id="checks-h" className="font-plate text-xl">
        Check on the ground
      </h2>
      <ul className="mt-3 space-y-2 text-[15px]">
        {items.map((t) => (
          <li key={t} className="flex gap-2">
            <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-wheat" />
            {t}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13.5px] text-ink-faint">
        Sources: <a className="text-field underline underline-offset-2" href={CITATIONS['nrcs-340'].url} target="_blank" rel="noopener noreferrer">NRCS cover crop standard</a>,{' '}
        <a className="text-field underline underline-offset-2" href={CITATIONS['scn-coalition'].url} target="_blank" rel="noopener noreferrer">The SCN Coalition</a>.
      </p>
    </section>
  );
}
