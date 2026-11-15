import { Suspense } from 'react';
import { SimulatorScreen } from '@/components/simulator/SimulatorScreen';

export const metadata = { title: 'Scenario Simulator | PlotTwist' };

export default function Page() {
  return (
    <Suspense>
      <SimulatorScreen />
    </Suspense>
  );
}
