'use client';

import { useMemo } from 'react';
import { withImports, type FinanceInputs, type ImportedFinance } from '../domain/finance/inputs';
import { derivedFromImports } from '../import/derive';
import { useFarm } from './StoreProvider';

/**
 * Finance inputs as the engine should see them: what the farmer typed, with applied imports underneath.
 * Save the raw `finance` from useFarm(), never this merged object.
 */
export function useEffectiveFinance(): { finance: FinanceInputs; imported: ImportedFinance } {
  const { finance, imports } = useFarm();
  const imported = useMemo(() => derivedFromImports(imports), [imports]);
  return useMemo(() => ({ finance: withImports(finance, imported), imported }), [finance, imported]);
}
