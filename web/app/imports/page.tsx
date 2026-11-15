import { BoundaryImportCard } from '@/components/imports/BoundaryImportCard';
import { StubImportCard } from '@/components/imports/StubImportCard';

export const metadata = { title: 'Imports | PlotTwist' };

export default function ImportsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6 lg:px-8 lg:py-10">
        <h1 className="font-plate text-3xl">Imports</h1>
        <p className="mt-1 max-w-[65ch] text-[16px] leading-relaxed text-ink-soft">
          Bring in records you already keep on other platforms. Each kind of record has its own box. Field boundaries work today; the others will be read in later milestones.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2">
          <BoundaryImportCard />
          <StubImportCard
            title="Machine and equipment data"
            description="Planting, application and as-applied logs from your equipment displays."
            accept={['.zip', '.xml', '.csv']}
            acceptLabel="ISOXML (.zip or .xml), zipped shapefiles (.zip), or CSV"
            note="Exports from John Deere Operations Center, Climate FieldView, CNH or Ag Leader usually come as one of these."
          />
          <StubImportCard
            title="Supplier and purchase records"
            description="Seed, fertilizer and chemical purchases from your suppliers."
            accept={['.csv', '.xlsx', '.xls', '.pdf']}
            acceptLabel="CSV, Excel (.xlsx, .xls), or PDF invoices"
          />
          <StubImportCard
            title="Finance and payments"
            description="Income and expenses, to compare plans by what they cost and earn."
            accept={['.csv']}
            acceptLabel="CSV exports"
            note={
              <>
                Export a CSV from QuickBooks (Reports, then Export to CSV) or from the Stripe Dashboard (Payments, then Export). PlotTwist never asks for your account passwords or API keys.
              </>
            }
          />
          <StubImportCard
            title="Yield and harvest records"
            description="Yield maps and harvest totals by field and year."
            accept={['.csv', '.zip', '.xml']}
            acceptLabel="CSV, zipped shapefiles (.zip), or ISOXML (.zip or .xml)"
          />
        </div>
      </div>
    </div>
  );
}
