import { ComingSoon } from '@/components/shell/ComingSoon';

export const metadata = { title: 'Finance | FieldShift' };

export default function Page() {
  return (
    <ComingSoon title="Finance" actions={[{ href: '/imports', label: 'Import finance records' }, { href: '/rotation', label: 'Explore rotation' }, { href: '/planner', label: 'Open planner' }]}>
      <p>Cost and income projections, with weather risk drawn from 40 years of NASA POWER records for each field.</p>
    </ComingSoon>
  );
}
