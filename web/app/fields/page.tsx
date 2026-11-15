import { Suspense } from 'react';
import { FieldsScreen } from '@/components/fields/FieldsScreen';

export const metadata = { title: 'Fields | PlotTwist' };

export default function FieldsPage() {
  return (
    <Suspense>
      <FieldsScreen />
    </Suspense>
  );
}
