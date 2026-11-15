'use client';

import { useMemo } from 'react';
import { forecastRevenue } from '../domain/finance/forecast';
import type { FinanceInputs } from '../domain/finance/inputs';
import { useFarm } from './StoreProvider';

export function useRevenueForecast(horizon: FinanceInputs['horizon'], firstSeason?: number) {
  const { loaded, forecastRecords, fields, plans, finance } = useFarm();
  const startYear = firstSeason ?? new Date().getFullYear() + 1;
  const forecast = useMemo(() => loaded ? forecastRevenue({
    records: forecastRecords, fields, plans, finance, startYear, horizon,
  }) : null, [loaded, forecastRecords, fields, plans, finance, startYear, horizon]);
  return { forecast, startYear };
}
