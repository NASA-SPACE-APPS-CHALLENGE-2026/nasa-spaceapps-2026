import { ComingSoon } from '@/components/shell/ComingSoon';

export const metadata = { title: 'Scenario Simulator | FieldShift' };

export default function Page() {
  return (
    <ComingSoon title="Scenario Simulator" actions={[{ href: '/rotation', label: 'Explore rotation' }, { href: '/planner', label: 'Open planner' }, { href: '/fields', label: 'Go to Fields' }]}>
      <p>Compare a suggested plan with what you do today, field by field.</p>
    </ComingSoon>
  );
}
