import Link from 'next/link';
import { BoundaryImportCard } from '@/components/imports/BoundaryImportCard';
import { FieldReference, RecordImportCard } from '@/components/imports/RecordImportCard';

export const metadata = { title: 'Imports | PlotTwist' };

export default function ImportsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6 lg:px-8 lg:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h1 className="font-plate text-3xl">Imports</h1>
            <p className="mt-1 max-w-[65ch] text-[16px] leading-relaxed text-ink-soft">Bring your field, machinery, purchase, payment and harvest records together. Saved records stay in this browser and update your financial projections.</p></div>
          <Link href="/finance" className="font-semibold text-sky-deep hover:underline">View Finance →</Link>
        </div>
        <FieldReference />
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <BoundaryImportCard />
          {(['land', 'equipment', 'purchases', 'payments', 'harvests'] as const).map(dataset => <RecordImportCard key={dataset} dataset={dataset} />)}
        </div>
      </div>
    </div>
  );
}
