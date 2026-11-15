import { ComingSoon } from '@/components/shell/ComingSoon';

export const metadata = { title: 'Overview | FieldShift' };

export default function Page() {
  return (
    <ComingSoon title="Overview">
      <p>A dashboard across all your fields: what is planted, what is planned, and where weather and soil put each field at risk. It will draw on the field profiles, your answers in Rotation Explorer and the plans you make in the Planner.</p>
    </ComingSoon>
  );
}
