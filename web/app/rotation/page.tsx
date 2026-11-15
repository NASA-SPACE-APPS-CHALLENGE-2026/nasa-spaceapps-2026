import { Suspense } from 'react';
import { RotationScreen } from '@/components/rotation/RotationScreen';

export const metadata = { title: 'Rotation Explorer | PlotTwist' };

export default function Page() {
  return (
    <Suspense>
      <RotationScreen />
    </Suspense>
  );
}
