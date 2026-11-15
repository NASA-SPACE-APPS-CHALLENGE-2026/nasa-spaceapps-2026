import { Suspense } from 'react';
import { SimulatorScreen } from '@/components/simulator/SimulatorScreen';

export const metadata = { title: 'Scenario Simulator | FieldShift' };

export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-ink-soft" role="status">Loading Scenario Simulator…</p>}>
      <SimulatorScreen />
    </Suspense>
  );
}
