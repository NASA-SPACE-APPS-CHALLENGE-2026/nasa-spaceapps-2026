'use client';

import { useId } from 'react';
import { ASSUMPTIONS, SOURCES, type Group } from '@/lib/domain/finance/assumptions';
import type { CropKey, Tenure } from '@/lib/domain/finance/budget';
import { fieldAcres } from '@/lib/domain/finance/farm';
import { NO_IMPORTS, type FieldFinance, type FinanceInputs, type ImportedFinance } from '@/lib/domain/finance/inputs';
import Link from 'next/link';
import { currentCycle } from '@/lib/domain/finance/plans';
import type { WeatherHistory } from '@/lib/domain/finance/weather';
import { seasonLabel } from '@/lib/domain/rotation/strategies';
import type { Field } from '@/lib/domain/types';
import { NumberField, Segmented } from './ui';

const SHORT_SOURCE = new Map<string, string>([
  [SOURCES.isu.name, 'ISU 2026 crop budgets'],
  [SOURCES.wasde.name, 'USDA WASDE, Nov 2026'],
  [SOURCES.rent.name, 'ISU cash rent survey 2026'],
  [SOURCES.eqip.name, 'Iowa NRCS EQIP FY2026'],
  [SOURCES.oatsPrice.name, 'USDA NASS (Wisconsin oats, May 2026)'],
  [SOURCES.fsa.name, 'USDA FSA'],
  [SOURCES.plottwist.name, 'PlotTwist estimate, please check'],
]);

const CROP_NAMES: Record<CropKey, string> = { corn: 'Corn', soybeans: 'Soybeans', oats: 'Oats', wheat: 'Wheat' };

function Group({ title, children, open = false, intro }: { title: string; children: React.ReactNode; open?: boolean; intro?: string }) {
  return (
    <details open={open} className="group rounded-[var(--radius-panel)] border border-line bg-panel">
      <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-2 px-4 font-plate text-lg [&::-webkit-details-marker]:hidden">
        {title}
        <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-ink-faint transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden>
          <path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </summary>
      <div className="border-t border-line px-4 pb-4 pt-3">
        {intro && <p className="mb-3 text-[14px] text-ink-soft">{intro}</p>}
        {children}
      </div>
    </details>
  );
}

const GRID = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';

/** "Your records: yield-2025.csv" → "yield-2025.csv". */
const fileOf = (imported: ImportedFinance, id: string) => imported.sources[id]?.name.replace(/^Your records: /, '') ?? 'your records';

export function FinanceInputsForm({ inputs, imported = NO_IMPORTS, fields, crops, weather, onChange }: { inputs: FinanceInputs; imported?: ImportedFinance; fields: Field[]; crops: CropKey[]; weather?: WeatherHistory; onChange: (next: FinanceInputs) => void }) {
  const hasImports = Object.keys(imported.overrides).length > 0 || imported.lastYear.totalRevenue !== undefined || imported.lastYear.totalCosts !== undefined;
  const setOverride = (id: string, v: number | undefined) => {
    const overrides = { ...inputs.overrides };
    if (v === undefined) delete overrides[id];
    else overrides[id] = v;
    onChange({ ...inputs, overrides });
  };
  const setField = (id: string, patch: Partial<FieldFinance>) => onChange({ ...inputs, fields: { ...inputs.fields, [id]: { ...inputs.fields[id], ...patch } } });
  const assumptions = (groups: Group[], filter?: (id: string) => boolean) => (
    <div className={GRID}>
      {ASSUMPTIONS.filter((a) => groups.includes(a.group) && (!filter || filter(a.id))).map((a) => (
        <NumberField
          key={a.id}
          label={a.label}
          unit={a.unit}
          value={inputs.overrides[a.id]}
          placeholder={imported.overrides[a.id] ?? a.value}
          min={0}
          onCommit={(v) => setOverride(a.id, v)}
          hint={
            imported.overrides[a.id] !== undefined
              ? `From your records (${fileOf(imported, a.id)}). Default ${a.value.toLocaleString('en-US')}.`
              : `Default ${a.value.toLocaleString('en-US')}: ${SHORT_SOURCE.get(a.source.name) ?? a.source.name}`
          }
          testId={`input-${a.id}`}
        />
      ))}
    </div>
  );
  const cropFilter = (id: string) => {
    const head = id.split('.')[0];
    return !['corn', 'soybeans', 'oats', 'wheat'].includes(head) || crops.includes(head as CropKey) || (head === 'oats' && crops.includes('wheat'));
  };

  return (
    <div className="space-y-3" data-testid="finance-inputs">
      <p className="text-[15px] text-ink-soft">Everything is filled in with Iowa defaults. Change only what you know; your numbers are marked and always win. Leave a box empty to use the default.</p>
      {hasImports && (
        <p className="rounded-[var(--radius-control)] border border-field/30 bg-field-tint px-3 py-2 text-[14.5px] text-field" data-testid="imports-note">
          Numbers from your imported records fill the empty boxes and are marked “From your records”. A number you type still wins. Manage or remove files on the{' '}
          <Link href="/imports" className="font-semibold underline underline-offset-2">
            Imports
          </Link>{' '}
          tab.
        </p>
      )}

      <Group title="Your farm" open>
        <div className="space-y-4">
          <div>
            <p className="text-[14.5px] font-semibold">Planning horizon</p>
            <div className="mt-1">
              <Segmented label="Planning horizon" value={inputs.horizon} onChange={(h) => onChange({ ...inputs, horizon: h })} options={[{ value: 3, label: '3 years' }, { value: 5, label: '5 years' }]} />
            </div>
          </div>
          <label className="flex items-start gap-3 text-[15px]">
            <input type="checkbox" checked={inputs.beginningFarmer} onChange={(e) => onChange({ ...inputs, beginningFarmer: e.target.checked })} className="mt-1 h-5 w-5 accent-[var(--color-sky)]" />
            <span>
              <strong>I am a beginning farmer</strong> (10 years or less). Uses the higher EQIP cost-share rate.
            </span>
          </label>
          <div className={GRID}>
            <NumberField label="Last year’s total revenue (optional)" unit="$" value={inputs.lastYear.totalRevenue} placeholder={imported.lastYear.totalRevenue} hint={imported.lastYear.totalRevenue !== undefined ? 'From your imported books.' : undefined} min={0} onCommit={(v) => onChange({ ...inputs, lastYear: { ...inputs.lastYear, totalRevenue: v } })} testId="input-lastYear.totalRevenue" />
            <NumberField label="Last year’s total costs (optional)" unit="$" value={inputs.lastYear.totalCosts} placeholder={imported.lastYear.totalCosts} hint={imported.lastYear.totalCosts !== undefined ? 'From your imported books.' : undefined} min={0} onCommit={(v) => onChange({ ...inputs, lastYear: { ...inputs.lastYear, totalCosts: v } })} testId="input-lastYear.totalCosts" />
          </div>
        </div>
      </Group>

      <Group title="Fields" open intro="Acres come from the boundary you drew. The rotation was read from the crops you entered.">
        <ul className="divide-y divide-line">
          {fields.map((f) => (
            <FieldRow key={f.id} field={f} acresDefault={fieldAcres(f, { ...inputs, fields: {} })} ff={inputs.fields[f.id] ?? {}} onPatch={(p) => setField(f.id, p)} />
          ))}
        </ul>
      </Group>

      <Group title="Last year">
        <div className="space-y-4">
          {crops.map((k) => (
            <div key={k} className={GRID}>
              <NumberField label={`${CROP_NAMES[k]}: last year’s yield`} unit="bu/ac" value={inputs.lastYear.crops[k]?.yield} min={0} hint="Also used as your expected yield unless you enter one below." onCommit={(v) => onChange({ ...inputs, lastYear: { ...inputs.lastYear, crops: { ...inputs.lastYear.crops, [k]: { ...inputs.lastYear.crops[k], yield: v } } } })} />
              <NumberField label={`${CROP_NAMES[k]}: last year’s price received`} unit="$/bu" value={inputs.lastYear.crops[k]?.price} min={0} onCommit={(v) => onChange({ ...inputs, lastYear: { ...inputs.lastYear, crops: { ...inputs.lastYear.crops, [k]: { ...inputs.lastYear.crops[k], price: v } } } })} />
            </div>
          ))}
        </div>
      </Group>

      <Group title="Market: yields, prices and contracts">
        {assumptions(['Yields and prices'], cropFilter)}
        <h3 className="mt-5 text-[15px] font-semibold">Forward contract prices (optional, first year only)</h3>
        <div className={`mt-2 ${GRID}`}>
          {crops.map((k) => (
            <NumberField
              key={k}
              label={`${CROP_NAMES[k]} contract price`}
              unit="$/bu"
              min={0}
              value={inputs.forward[k]}
              onCommit={(v) => {
                const forward = { ...inputs.forward };
                if (v === undefined) delete forward[k];
                else forward[k] = v;
                onChange({ ...inputs, forward });
              }}
            />
          ))}
        </div>
      </Group>

      <Group title="Costs" intro="Per acre, from the Iowa State 2026 budgets unless marked as a PlotTwist estimate.">
        <div className="space-y-5">
          {(['Fertilizer prices', 'Corn costs', 'Soybean costs', 'Small grain costs', 'Cover crops', 'Land and money'] as Group[])
            .filter((g) => (g === 'Corn costs' ? crops.includes('corn') : g === 'Soybean costs' ? crops.includes('soybeans') : g === 'Small grain costs' ? crops.includes('oats') || crops.includes('wheat') : true))
            .map((g) => (
              <div key={g}>
                <h3 className="mb-2 text-[15px] font-semibold">{g}</h3>
                {assumptions([g])}
              </div>
            ))}
        </div>
      </Group>

      <Group title="Suppliers (optional)">
        <div className={GRID}>
          <TextInput label="Seed supplier" value={inputs.suppliers.seedSupplier} onChange={(v) => onChange({ ...inputs, suppliers: { ...inputs.suppliers, seedSupplier: v } })} />
          <NumberField label="Quoted corn seed price" unit="$/bag (80,000 seeds)" min={0} value={inputs.suppliers.cornSeedPerBag} hint="Sets corn seed cost per acre at 30,000 seeds/acre." onCommit={(v) => onChange({ ...inputs, suppliers: { ...inputs.suppliers, cornSeedPerBag: v } })} />
          <TextInput label="Fertilizer supplier" value={inputs.suppliers.fertilizerSupplier} onChange={(v) => onChange({ ...inputs, suppliers: { ...inputs.suppliers, fertilizerSupplier: v } })} />
          <NumberField label="Anhydrous ammonia price" unit="$/ton" min={0} value={inputs.suppliers.anhydrousPerTon} hint="Sets the nitrogen price (82% N)." onCommit={(v) => onChange({ ...inputs, suppliers: { ...inputs.suppliers, anhydrousPerTon: v } })} />
          <TextInput label="Grain buyer or elevator" value={inputs.suppliers.grainBuyer} onChange={(v) => onChange({ ...inputs, suppliers: { ...inputs.suppliers, grainBuyer: v } })} />
        </div>
      </Group>

      <Group title="Programs and savings">{assumptions(['Programs'])}</Group>

      {Object.keys(imported.overrides).some((id) => id.startsWith('actual.')) && (
        <Group title="Your actual costs (from your books)" open intro="Each cost category in the budget is multiplied by what your imported books show you actually spent, compared with what PlotTwist modeled. 1 means the budget as is.">
          {assumptions(['Your records'], (id) => id in imported.overrides || id in inputs.overrides)}
        </Group>
      )}

      <Group title="Risk">
        {weather ? (
          <p className="mb-3 text-[14.5px]">
            NASA POWER weather for your farm, 1985–2024: corn had <strong>{weather.stressYears.corn.length}</strong> stress years, soybeans <strong>{weather.stressYears.soybeans.length}</strong>, small grains <strong>{weather.stressYears.oats.length}</strong> (of {weather.years.length}).
          </p>
        ) : (
          <p className="mb-3 text-[14.5px] text-ink-soft">NASA weather history loads when public data lookups are on.</p>
        )}
        {assumptions(['Risk'])}
      </Group>
    </div>
  );
}

function TextInput({ label, value, onChange }: { label: string; value?: string; onChange: (v: string | undefined) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[14.5px] font-semibold">
        {label}
      </label>
      <input id={id} defaultValue={value ?? ''} maxLength={120} onBlur={(e) => onChange(e.target.value.trim() || undefined)} className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-line-strong bg-panel px-3 text-[16px]" />
    </div>
  );
}

function FieldRow({ field, ff, acresDefault, onPatch }: { field: Field; ff: FieldFinance; acresDefault: number; onPatch: (p: Partial<FieldFinance>) => void }) {
  const tenureId = useId();
  const cycle = currentCycle(field);
  const tenure: Tenure = ff.tenure ?? 'cash';
  return (
    <li className="py-3" data-testid={`finance-field-${field.id}`}>
      <p className="text-[16px] font-semibold">{field.name}</p>
      <p className="text-[14px] text-ink-soft">Rotation: {cycle.length ? cycle.map(seasonLabel).join(' → ') : 'not known yet (enter past crops on the Fields tab)'}</p>
      {cycle.length > 0 && (
        <label className="mt-1 flex items-center gap-2 text-[14.5px]">
          <input type="checkbox" checked={!!ff.rotationConfirmed} onChange={(e) => onPatch({ rotationConfirmed: e.target.checked })} className="h-5 w-5 accent-[var(--color-sky)]" />
          This is my current rotation
        </label>
      )}
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField label="Acres" unit="ac" min={0} value={ff.acres} placeholder={acresDefault} onCommit={(v) => onPatch({ acres: v })} />
        <div>
          <label htmlFor={tenureId} className="block text-[14.5px] font-semibold">
            Own or rent
          </label>
          <select id={tenureId} value={tenure} onChange={(e) => onPatch({ tenure: e.target.value as Tenure })} className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-line-strong bg-panel px-3 text-[16px]">
            <option value="own">Own</option>
            <option value="cash">Cash rent</option>
            <option value="share">Crop-share rent</option>
          </select>
        </div>
        {tenure === 'cash' && <NumberField label="Rent" unit="$/ac" min={0} value={ff.rentPerAcre} placeholder={270} onCommit={(v) => onPatch({ rentPerAcre: v })} />}
        {tenure === 'share' && <NumberField label="Landlord’s share" unit="%" min={0} value={ff.sharePct} placeholder={50} onCommit={(v) => onPatch({ sharePct: v })} />}
        <label className="flex items-center gap-2 self-end pb-2 text-[15px]">
          <input type="checkbox" checked={!!ff.irrigated} onChange={(e) => onPatch({ irrigated: e.target.checked })} className="h-5 w-5 accent-[var(--color-sky)]" />
          Irrigated
        </label>
      </div>
    </li>
  );
}
