import { Suspense } from 'react';
import { PlannerScreen } from '@/components/planner/PlannerScreen';

export const metadata = { title: 'Planner | FieldShift' };

export default function Page() {
  return (
    <Suspense>
      <PlannerScreen />
    </Suspense>
  );
}
