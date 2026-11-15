'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { answeredCount, hasSoilTest, QUESTION_KEYS } from '@/lib/domain/management';
import { BARS } from '@/lib/domain/rotation/score';
import { useFarm, useStore } from '@/lib/client/StoreProvider';
import { useActiveField } from '@/lib/client/useActiveField';
import { useRotation } from '@/lib/client/useRotation';
import { FieldPicker, NoFieldsYet } from '../ui/FieldPicker';
import { Button } from '../ui/Button';
import { Questionnaire } from './Questionnaire';
import { ReasonList } from './Sources';
import { StrategyCard } from './StrategyCard';

export function RotationScreen() {
  const store = useStore();
  const { settings } = useFarm();
  const { field, fields, loaded, select } = useActiveField();
  const rotation = useRotation(field);
  // Questions first until the farmer has answered something; then results, with "Edit answers".
  const [mode, setMode] = useState<'questions' | 'results' | null>(null);
  useEffect(() => setMode(null), [field?.id]);
  const effectiveMode = mode ?? (rotation?.hasAnswers ? 'results' : 'questions');

  useEffect(() => {
    if (field) store.ensureLookups(field.id);
  }, [field?.id, store]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 lg:py-8">
        <header>
          <h1 className="font-plate text-3xl">Rotation Explorer</h1>
          <p className="mt-1 max-w-3xl text-[16px] text-ink-soft">
            Answer a few questions about how you farm a field, then compare three strategies on soil cover, crop diversity, pests and diseases, and climate fit.
          </p>
        </header>

        {!loaded ? (
          <p className="text-ink-soft" role="status">
            Loading your fields…
          </p>
        ) : !field ? (
          <NoFieldsYet what="Rotation Explorer" />
        ) : (
          <>
            <FieldPicker fields={fields} field={field} onSelect={select} />
            {effectiveMode === 'questions' && rotation ? (
              <Questionnaire
                key={field.id}
                field={field}
                answers={rotation.answers}
                onChange={(a) => {
                  setMode('questions'); // the first saved answer must not flip the page to results
                  void store.saveAnswers(field.id, a);
                }}
                onDone={() => setMode('results')}
              />
            ) : (
              rotation && <Results fieldId={field.id} rotation={rotation} lookupsOn={settings.externalLookups} onEdit={() => setMode('questions')} onSave={() => void store.saveAnswers(field.id, rotation.answers)} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Results({ fieldId, rotation, lookupsOn, onEdit, onSave }: { fieldId: string; rotation: NonNullable<ReturnType<typeof useRotation>>; lookupsOn: boolean; onEdit: () => void; onSave: () => void }) {
  const { result, answers, profile } = rotation;
  const answered = answeredCount(answers);
  // Make sure skipping straight to results still records that the farmer has seen them.
  useEffect(() => {
    if (!rotation.hasAnswers) onSave();
  }, [rotation.hasAnswers]); // eslint-disable-line react-hooks/exhaustive-deps
  // Only the sources the rubric reads (NDVI is shown on Fields but not scored).
  const loading = profile && (['power', 'ssurgo', 'elevation', 'imerg', 'smap'] as const).some((id) => profile.sources[id]?.status === 'loading');

  if (result.problem) {
    return (
      <div className="rounded-parcel border border-wheat/40 bg-wheat-tint p-5" data-testid="rotation-problem">
        <p className="text-[16px] font-semibold text-wheat-deep">{result.problem}</p>
        <Link href="/fields" className="mt-3 inline-flex min-h-12 items-center rounded-parcel bg-field px-5 font-semibold text-white hover:bg-field-deep">
          Go to Fields
        </Link>
      </div>
    );
  }

  const best = result.strategies.find((s) => s.strategy.id === result.bestFit);
  return (
    <section aria-labelledby="results-h" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="results-h" className="font-plate text-2xl">
            Three strategies for the next three seasons
          </h2>
          <p className="text-[14.5px] text-ink-soft">
            {answered} of {QUESTION_KEYS.length} questions answered{hasSoilTest(answers) ? ', soil test added' : ''}. Unanswered questions lower confidence.
          </p>
        </div>
        <Button variant="secondary" onClick={onEdit}>
          Edit answers
        </Button>
      </div>

      <div className={`rounded-parcel border p-4 ${best ? 'border-field/40 bg-field-tint' : 'border-wheat/40 bg-wheat-tint'}`} role="status" data-testid="best-fit-summary">
        <p className={`text-[16px] font-semibold ${best ? 'text-field' : 'text-wheat-deep'}`}>{best ? `Best fit: ${best.strategy.title}` : 'No best fit yet'}</p>
        <p className="mt-0.5 text-[15px]">{result.bestFitReason}</p>
        {result.weightReasons.length > 0 && (
          <div className="mt-2">
            <ReasonList reasons={result.weightReasons} />
          </div>
        )}
      </div>

      {!lookupsOn && <p className="rounded-parcel bg-paper px-3 py-2 text-[14.5px] text-ink-soft">Public data lookups are off, so climate and soil data are missing and those parts are marked “Not enough info”.</p>}
      {loading && (
        <p className="text-[14.5px] text-ink-soft" role="status">
          Some field data is still loading. Scores update when it arrives.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {result.strategies.map((s) => (
          <StrategyCard key={s.strategy.id} s={s} best={s.strategy.id === result.bestFit} fieldId={fieldId} />
        ))}
      </div>

      <details className="rounded-parcel border border-line bg-panel p-4">
        <summary className="min-h-11 cursor-pointer content-center text-[16px] font-semibold">How the four bars are scored</summary>
        <ul className="mt-2 space-y-1 text-[15px] text-ink-soft">
          {BARS.map((b) => (
            <li key={b.id}>
              <strong className="text-ink">{b.label}</strong>: {b.question}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[14px] text-ink-faint">
          Each bar is 0–100, higher is better. The best fit has the highest average of at least three scored bars; within one point, the strategy with fewer changes wins. All thresholds are placeholders awaiting agronomist review.
        </p>
      </details>
    </section>
  );
}
