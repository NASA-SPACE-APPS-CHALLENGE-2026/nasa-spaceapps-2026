'use client';

import { useEffect, useMemo } from 'react';
import { analyzeFarm, type FarmAnalysis } from '../domain/finance/analysis';
import { anchorField, farmFieldInputs } from '../domain/finance/farm';
import { buildParams } from '../domain/finance/inputs';
import type { Params } from '../domain/finance/assumptions';
import { useFarm, useStore } from './StoreProvider';
import { useEffectiveFinance } from './useEffectiveFinance';
import type { WeatherState } from './store';

/** Whole-farm finance analysis from the store, recomputed whenever fields, plans or finance inputs change. */
export function useFarmAnalysis(): { analysis: FarmAnalysis | null; params: Params; weather: WeatherState | undefined; planned: number } {
  const store = useStore();
  const { fields, plans, weather, loaded } = useFarm();
  const { finance } = useEffectiveFinance();
  const anchor = anchorField(fields);
  useEffect(() => {
    if (anchor) store.ensureWeather(anchor.id);
  }, [anchor?.id, store]); // eslint-disable-line react-hooks/exhaustive-deps
  const w = anchor ? weather[anchor.id] : undefined;
  const history = w?.status === 'ok' ? w.history : undefined;
  const params = useMemo(() => buildParams(finance), [finance]);
  const analysis = useMemo(() => {
    if (!loaded || !fields.length) return null;
    return analyzeFarm(farmFieldInputs(fields, plans, finance), params, { beginningFarmer: finance.beginningFarmer, weather: history, forward: finance.forward });
  }, [loaded, fields, plans, finance, params, history]);
  const planned = new Set(plans.map((p) => p.fieldId)).size;
  return { analysis, params, weather: w, planned };
}
