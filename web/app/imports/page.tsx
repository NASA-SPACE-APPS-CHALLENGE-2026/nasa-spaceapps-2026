import { BoundaryImportCard } from '@/components/imports/BoundaryImportCard';

export const metadata = { title: 'Imports | PlotTwist' };

export default function ImportsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6 lg:px-8 lg:py-10">
        <h1 className="font-plate text-3xl">Imports</h1>
        <p className="mt-1 max-w-[65ch] text-[16px] leading-relaxed text-ink-soft">
          Import your field boundaries from another farm platform, GIS, or Google Earth. Preview the shapes, choose your fields, and save them to your farm.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2">
          <BoundaryImportCard />
        </div>
      </div>
    </div>
  );
}
