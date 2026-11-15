import { Suspense } from 'react';
import { PlannerScreen } from '@/components/planner/PlannerScreen';

export const metadata = { title: 'Planner | PlotTwist' };

export default function Page() {
  return (
    <Suspense>
      <PlannerScreen />
    </Suspense>
  );
}
