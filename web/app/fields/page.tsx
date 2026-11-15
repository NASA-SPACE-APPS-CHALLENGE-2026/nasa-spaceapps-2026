import { Suspense } from 'react';
import { FieldsScreen } from '@/components/fields/FieldsScreen';

export const metadata = { title: 'Fields | FieldShift' };

export default function FieldsPage() {
  return (
    <Suspense>
      <FieldsScreen />
    </Suspense>
  );
}
