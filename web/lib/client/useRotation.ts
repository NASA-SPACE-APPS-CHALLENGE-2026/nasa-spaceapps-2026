'use client';

import { useMemo } from 'react';
import { answersOf } from '../domain/management';
import { buildInputs } from '../domain/rotation/inputs';
import { scoreRotation } from '../domain/rotation/score';
import type { Field } from '../domain/types';
import { useFarm } from './StoreProvider';

/** Inputs and scores for one field, recomputed when its crops, profile or answers change. */
export function useRotation(field: Field | undefined) {
  const { profiles, management, settings } = useFarm();
  const profile = field ? profiles[field.id] : undefined;
  const record = field ? management[field.id] : undefined;
  return useMemo(() => {
    if (!field) return null;
    const answers = answersOf(record);
    const inputs = buildInputs(field, profile, answers, { lookupsOff: !settings.externalLookups });
    return { answers, inputs, result: scoreRotation(inputs), hasAnswers: !!record, profile };
  }, [field, profile, record, settings.externalLookups]);
}
