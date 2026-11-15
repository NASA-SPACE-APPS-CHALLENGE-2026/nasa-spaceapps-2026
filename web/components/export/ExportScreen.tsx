'use client';

import { useMemo, useState } from 'react';
import { useFarm } from '@/lib/client/StoreProvider';
import { useEffectiveFinance } from '@/lib/client/useEffectiveFinance';
import { activePlan, fieldAcres } from '@/lib/domain/finance/farm';
import type { FarmAnalysis, PlanYear } from '@/lib/domain/finance/analysis';
import { cropIdsOf, cropName } from '@/lib/domain/rotation/agronomy';
import type { CropRef, Field, Plan } from '@/lib/domain/types';
import { NoFieldsYet } from '../ui/FieldPicker';

import { useFarmAnalysis as useAnalysis } from '@/lib/client/useFarmAnalysis';

type Row = Record<string, string | number | boolean>;

const round = (value: number) => Math.round(value * 100) / 100;
const dollars = (value: number) => `$${Math.round(value).toLocaleString('en-US')}`;
const fileDate = () => new Date().toISOString().slice(0, 10);

function cropLabel(ref: CropRef | null): string {
  if (!ref) return 'Not entered';
  const ids = cropIdsOf(ref);
  if (ids?.length) return ids.map(cropName).join(' + ');
  if (ref.kind === 'other') return ref.text;
  if (ref.kind === 'cdl-raw') return ref.name;
  return 'Not entered';
}

function exportRows(fields: Field[], plans: Plan[], analysis: FarmAnalysis | null, finance: ReturnType<typeof useEffectiveFinance>['finance'], profiles: ReturnType<typeof useFarm>['profiles']) {
  const totalAcres = fields.reduce((sum, field) => sum + fieldAcres(field, finance), 0);
  const complete = !!analysis && analysis.unmodeled.length === 0;
  const overview: Row[] = [
    { Metric: 'Generated', Value: new Date().toLocaleString() },
    { Metric: 'Land assumption', Value: 'Owned unless a rental arrangement was explicitly selected' },
    { Metric: 'Fields', Value: fields.length },
    { Metric: 'Total acres', Value: round(totalAcres) },
    { Metric: 'Fields with plans', Value: new Set(plans.map((plan) => plan.fieldId)).size },
    { Metric: 'Planning horizon', Value: `${finance.horizon} years` },
    { Metric: 'Financial status', Value: complete ? 'Complete' : analysis?.unmodeled.join('; ') || 'Not available' },
  ];
  if (complete && analysis) {
    overview.push(
      { Metric: 'Most likely change in net return', Value: `${dollars(analysis.headline.mid)}/acre/year` },
      { Metric: `Whole-farm change over ${analysis.headline.horizon} years`, Value: dollars(analysis.headline.wholeFarm) },
    );
  }

  const fieldRows: Row[] = fields.map((field) => {
    const ff = finance.fields[field.id] ?? {};
    const plan = activePlan(plans, field.id);
    return {
      Field: field.name,
      Acres: round(fieldAcres(field, finance)),
      Ownership: ff.tenure ?? 'own',
      Irrigated: ff.irrigated ? 'Yes' : 'No',
      'Current crop': cropLabel(field.crops.current.crop),
      'Current crop year': field.crops.current.year,
      'Active plan': plan?.name ?? 'No plan',
      'Boundary source': field.definedBy,
    };
  });

  const cropRows: Row[] = fields.flatMap((field) =>
    [field.crops.current, ...field.crops.history]
      .sort((a, b) => b.year - a.year)
      .map((season) => ({
        Field: field.name,
        Year: season.year,
        Crop: cropLabel(season.crop),
        Status: season.status,
        Source: season.origin === 'cdl' ? 'USDA Cropland Data Layer' : 'Farmer entered',
      })),
  );

  const planRows: Row[] = plans.flatMap((plan) => {
    const field = fields.find((item) => item.id === plan.fieldId);
    return plan.seasons.map((season) => ({
      Field: field?.name ?? plan.fieldId,
      Plan: plan.name,
      Strategy: plan.strategyId,
      Year: season.year,
      Crop: cropLabel(season.crop),
      'Cover crop': season.cover?.name ?? '',
      Tasks: season.tasks.map((task) => `${task.month}: ${task.label}`).join('; '),
    }));
  });

  const projectionRows: Row[] = [];
  if (complete && analysis) {
    const addYear = (year: number, scenario: string, data: PlanYear) => projectionRows.push({
      Year: year,
      Scenario: scenario,
      Acres: round(data.acres),
      Revenue: round(data.revenue + data.programs),
      'Operating costs': round(data.operating),
      'Land cost': round(data.land),
      'Net return': round(data.net),
      'Net return per acre': round(data.acres ? data.net / data.acres : 0),
      'Nitrogen lb': round(data.nLbs),
    });
    analysis.years.forEach((year, index) => {
      addYear(year, 'Current rotation', analysis.current[index]);
      addYear(year, 'PlotTwist plan', analysis.proposed[index]);
    });
  } else {
    projectionRows.push({ Status: 'Not calculated', Reason: analysis?.unmodeled.join('; ') || 'No financial analysis is available.' });
  }

  const assumptionRows: Row[] = (analysis?.transparency ?? []).map((item) => ({
    Assumption: item.label,
    Group: item.group,
    Value: item.value,
    Unit: item.unit,
    Origin: item.origin,
    Confidence: item.confidence,
    Source: item.source.name,
    'Source date': item.source.date,
  }));

  const publicDataRows: Row[] = Object.values(profiles).flatMap((profile) =>
    Object.values(profile.sources).flatMap((source) =>
      (source?.values ?? []).map((value) => ({
        Field: fields.find((field) => field.id === profile.fieldId)?.name ?? profile.fieldId,
        Source: source?.sourceName ?? '',
        Status: source?.status ?? '',
        Measure: value.label,
        Value: value.value,
        Unit: value.unit ?? '',
        Quality: value.honesty,
        Note: value.note ?? '',
      })),
    ),
  );

  return { totalAcres, complete, overview, fieldRows, cropRows, planRows, projectionRows, assumptionRows, publicDataRows };
}

function setSheetWidths(sheet: { ['!cols']?: Array<{ wch?: number }> }, rows: Row[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  sheet['!cols'] = keys.map((key) => ({ wch: Math.min(48, Math.max(key.length + 2, ...rows.map((row) => String(row[key] ?? '').length + 2))) }));
}

export function ExportScreen() {
  const farm = useFarm();
  const { finance } = useEffectiveFinance();
  const { analysis } = useAnalysis();
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null);
  const [message, setMessage] = useState('');
  const data = useMemo(() => exportRows(farm.fields, farm.plans, analysis, finance, farm.profiles), [farm.fields, farm.plans, farm.profiles, analysis, finance]);

  const excel = async () => {
    setBusy('xlsx');
    setMessage('');
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const sheets: Array<[string, Row[]]> = [
        ['Overview', data.overview],
        ['Fields', data.fieldRows],
        ['Crop History', data.cropRows],
        ['Plans', data.planRows.length ? data.planRows : [{ Status: 'No plans saved' }]],
        ['Financial Projection', data.projectionRows],
        ['Assumptions', data.assumptionRows.length ? data.assumptionRows : [{ Status: 'No assumptions used' }]],
        ['Public Field Data', data.publicDataRows.length ? data.publicDataRows : [{ Status: 'No public field data available' }]],
      ];
      for (const [name, rows] of sheets) {
        const sheet = XLSX.utils.json_to_sheet(rows);
        setSheetWidths(sheet, rows);
        sheet['!autofilter'] = { ref: sheet['!ref'] ?? 'A1:A1' };
        XLSX.utils.book_append_sheet(workbook, sheet, name);
      }
      XLSX.writeFile(workbook, `PlotTwist-farm-export-${fileDate()}.xlsx`, { compression: true });
      setMessage('Excel workbook downloaded.');
    } catch (error) {
      setMessage(error instanceof Error ? `Excel export failed: ${error.message}` : 'Excel export failed.');
    } finally {
      setBusy(null);
    }
  };

  const pdf = async () => {
    setBusy('pdf');
    setMessage('');
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'letter' });
      const margin = 44;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const contentWidth = pageWidth - margin * 2;
      let y = margin;
      const ensure = (height: number) => {
        if (y + height <= pageHeight - margin) return;
        doc.addPage();
        y = margin;
      };
      const line = (text: string, options: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number } = {}) => {
        const size = options.size ?? 10;
        doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
        doc.setFontSize(size);
        doc.setTextColor(...(options.color ?? [34, 48, 42]));
        const wrapped = doc.splitTextToSize(text, contentWidth) as string[];
        const height = wrapped.length * (size + 3);
        ensure(height + (options.gap ?? 5));
        doc.text(wrapped, margin, y);
        y += height + (options.gap ?? 5);
      };
      const heading = (text: string) => {
        ensure(28);
        y += 7;
        line(text, { size: 15, bold: true, color: [37, 105, 76], gap: 7 });
      };
      const row = (label: string, value: string) => line(`${label}: ${value}`, { size: 10, gap: 3 });

      line('PlotTwist Farm Report', { size: 23, bold: true, color: [23, 56, 43], gap: 8 });
      line(`Generated ${new Date().toLocaleString()}`, { size: 9, color: [91, 105, 97], gap: 12 });
      line('Land is treated as fully owned unless a rental arrangement was explicitly selected.', { size: 10, bold: true, gap: 10 });

      heading('Farm snapshot');
      row('Fields', String(farm.fields.length));
      row('Total acres', round(data.totalAcres).toLocaleString('en-US'));
      row('Fields with plans', String(new Set(farm.plans.map((plan) => plan.fieldId)).size));
      row('Planning horizon', `${finance.horizon} years`);

      heading('Fields and crop history');
      for (const field of farm.fields) {
        const acres = round(fieldAcres(field, finance));
        const ownership = finance.fields[field.id]?.tenure ?? 'own';
        line(`${field.name} - ${acres} acres - ${ownership}`, { bold: true, gap: 3 });
        const history = [field.crops.current, ...field.crops.history]
          .sort((a, b) => b.year - a.year)
          .map((season) => `${season.year} ${cropLabel(season.crop)}`)
          .join(' | ');
        line(history, { size: 9, color: [76, 91, 83], gap: 7 });
      }

      heading('Plans');
      if (!farm.plans.length) line('No plans have been saved.');
      for (const plan of farm.plans) {
        const field = farm.fields.find((item) => item.id === plan.fieldId);
        line(`${field?.name ?? 'Field'} - ${plan.name}`, { bold: true, gap: 3 });
        line(plan.seasons.map((season) => `${season.year}: ${cropLabel(season.crop)}${season.cover ? ` + ${season.cover.name}` : ''}`).join(' | '), { size: 9, gap: 7 });
      }

      heading('Financial projection');
      if (!data.complete || !analysis) {
        line(`Not calculated because crop data is incomplete: ${analysis?.unmodeled.join('; ') || 'financial analysis unavailable'}.`);
      } else {
        row('Most likely change in net return', `${dollars(analysis.headline.mid)} per acre per year`);
        row(`Whole-farm change over ${analysis.headline.horizon} years`, dollars(analysis.headline.wholeFarm));
        line('Year-by-year net return per acre', { bold: true, gap: 4 });
        analysis.years.forEach((year, index) => {
          const current = analysis.current[index];
          const proposed = analysis.proposed[index];
          line(`${year}: current ${dollars(current.acres ? current.net / current.acres : 0)} | PlotTwist ${dollars(proposed.acres ? proposed.net / proposed.acres : 0)}`, { size: 9, gap: 3 });
        });
      }

      heading('Notes');
      line('Values are planning estimates, not tax or accounting advice. Excel includes the detailed assumptions and source metadata used by the model.', { size: 9 });
      doc.save(`PlotTwist-farm-report-${fileDate()}.pdf`);
      setMessage('PDF report downloaded.');
    } catch (error) {
      setMessage(error instanceof Error ? `PDF export failed: ${error.message}` : 'PDF export failed.');
    } finally {
      setBusy(null);
    }
  };

  if (!farm.loaded) return <div className="p-6" role="status">Loading your farm...</div>;
  if (!farm.fields.length) return <div className="h-full overflow-y-auto p-6"><NoFieldsYet what="Export" text="Add a field before creating a farm export." /></div>;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 lg:py-8">
        <header>
          <h1 className="font-plate text-3xl">Export</h1>
          <p className="mt-1 max-w-3xl text-[16px] text-ink-soft">Download a portable copy of your fields, crop history, plans, public data and financial projections.</p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-[var(--radius-panel)] border border-line bg-panel p-5">
            <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-field">Detailed data</p>
            <h2 className="mt-1 font-plate text-2xl">Excel workbook</h2>
            <p className="mt-2 text-[15px] text-ink-soft">Seven organized sheets for analysis, sharing and keeping a full farm record.</p>
            <ul className="mt-3 space-y-1 text-[14.5px] text-ink-soft">
              <li>Overview and fields</li>
              <li>Crop history and plans</li>
              <li>Financial projections and assumptions</li>
              <li>NASA and other public field data</li>
            </ul>
            <button type="button" onClick={() => void excel()} disabled={busy !== null} className="mt-5 inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-field px-5 font-semibold text-white disabled:opacity-50">
              {busy === 'xlsx' ? 'Building workbook...' : 'Download Excel'}
            </button>
          </section>

          <section className="rounded-[var(--radius-panel)] border border-line bg-panel p-5">
            <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-sky-deep">Shareable report</p>
            <h2 className="mt-1 font-plate text-2xl">PDF summary</h2>
            <p className="mt-2 text-[15px] text-ink-soft">A clean report for a partner, advisor or lender without the spreadsheet detail.</p>
            <ul className="mt-3 space-y-1 text-[14.5px] text-ink-soft">
              <li>Farm acreage and ownership</li>
              <li>Field rotations and saved plans</li>
              <li>Financial summary and yearly returns</li>
              <li>Clear warning if required data is incomplete</li>
            </ul>
            <button type="button" onClick={() => void pdf()} disabled={busy !== null} className="mt-5 inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-sky px-5 font-semibold text-white disabled:opacity-50">
              {busy === 'pdf' ? 'Building report...' : 'Download PDF'}
            </button>
          </section>
        </div>

        <section className="rounded-[var(--radius-panel)] border border-line bg-paper p-4 text-[14.5px] text-ink-soft">
          <strong className="text-ink">Current export:</strong> {farm.fields.length} fields, {round(data.totalAcres).toLocaleString('en-US')} acres, {farm.plans.length} saved plans. Financial projection: {data.complete ? 'complete' : 'incomplete data will be clearly marked'}.
        </section>
        <p className="min-h-6 text-[14.5px] font-medium text-field" role="status" aria-live="polite">{message}</p>
      </div>
    </div>
  );
}
