import { BoundaryImportCard } from '@/components/imports/BoundaryImportCard';
import { ImportsSummary } from '@/components/imports/ImportsSummary';
import { RecordImportCard } from '@/components/imports/RecordImportCard';

export const metadata = { title: 'Imports | PlotTwist' };

export default function ImportsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6 lg:px-8 lg:py-10">
        <h1 className="font-plate text-3xl">Imports</h1>
        <p className="mt-1 max-w-[65ch] text-[16px] leading-relaxed text-ink-soft">
          Bring in records you already keep on other platforms. PlotTwist reads each file, shows you what it found, and you choose which numbers to use. Your yields, prices and costs then replace the Iowa defaults in Finance, Overview and the Simulator.
        </p>
        <ImportsSummary />
        <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2">
          <BoundaryImportCard />
          <RecordImportCard
            kind="yield"
            title="Yield and harvest records"
            description="Yields by field and year, yield maps, or harvest task data. Sets your expected yields and can confirm past crops on Fields."
            acceptLabel="CSV or Excel, zipped shapefile yield maps (.zip), or ISOXML task data (TASKDATA .zip or .xml)"
            note="Exports from John Deere Operations Center, Climate FieldView, Ag Leader SMS or your combine’s display work."
          />
          <RecordImportCard
            kind="machine"
            title="Machine and equipment data"
            description="Planting, application, tillage and harvest logs from your equipment. Sets nitrogen and seeding rates, and tillage per field."
            acceptLabel="CSV or Excel summaries, zipped shapefile as-applied or seeding maps, or ISOXML task data with time logs"
            note="Use the field operations or as-applied export from JD Operations Center, FieldView, CNH AFS or Ag Leader, or the TASKDATA folder from an ISOBUS display (zip it first)."
          />
          <RecordImportCard
            kind="supplier"
            title="Supplier and purchase records"
            description="Seed, fertilizer and chemical invoices. Sets your nitrogen, phosphate, potash and seed prices."
            acceptLabel="CSV or Excel, PDF invoices (scanned ones too), or a photo of an invoice (.jpg, .png)"
            note="Scans and photos are read on this computer with text recognition; check every number before you use it."
          />
          <RecordImportCard
            kind="finance"
            title="Finance and payments"
            description="Income and expenses. Sets last year’s revenue and costs, prices you received, cash rent, and can scale the budget to what you actually spent."
            acceptLabel="CSV or Excel exports (QuickBooks, Stripe, your bank), or a PDF statement"
            note={<>Export a CSV from QuickBooks (Reports, then Transaction List by Date, then Export) or from the Stripe Dashboard (Payments, then Export). PlotTwist never asks for your account passwords or API keys.</>}
          />
        </div>
      </div>
    </div>
  );
}
