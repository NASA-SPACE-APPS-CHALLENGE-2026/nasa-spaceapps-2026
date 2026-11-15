import { Suspense } from 'react';
import { FinanceScreen } from '@/components/finance/FinanceScreen';

export const metadata = { title: 'Finance | PlotTwist' };

export default function Page() {
  return (
    <Suspense>
      <FinanceScreen />
    </Suspense>
  );
}
