import { Suspense } from 'react';
import { RotationScreen } from '@/components/rotation/RotationScreen';

export const metadata = { title: 'Rotation Explorer | FieldShift' };

export default function Page() {
  return (
    <Suspense>
      <RotationScreen />
    </Suspense>
  );
}
