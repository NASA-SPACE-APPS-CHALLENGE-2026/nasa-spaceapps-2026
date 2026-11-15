import { Suspense } from 'react';
import { FinanceScreen } from '@/components/finance/FinanceScreen';

export const metadata = { title: 'Finance | FieldShift' };

export default function Page() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-7xl px-4 py-8">Loading Finance…</main>}>
      <FinanceScreen />
    </Suspense>
  );
}
