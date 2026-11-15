'use client';

import Link from 'next/link';
import { formatAcres } from '@/lib/domain/acreage';
import type { Field } from '@/lib/domain/types';
import { buttonClass } from './Button';
import { EmptyState } from './EmptyState';
import { FieldShape } from './FieldShape';
import { RotationStrip } from './RotationStrip';
import { Select } from './Select';

/** Field switcher used by Rotation Explorer and Planner: the field's shape, a picker, and its rotation so far. */
export function FieldPicker({ fields, field, onSelect }: { fields: Field[]; field: Field; onSelect: (id: string) => void }) {
  return (
    <div className="grid gap-x-6 gap-y-4 border-y border-line py-4 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:items-end">
      <div className="flex items-end gap-3">
        <FieldShape geometry={field.feature.geometry} crop={field.crops.current.crop} pinOnly={field.boundary === 'approximate'} size={48} />
        <Select label="Field" value={field.id} onChange={(e) => onSelect(e.target.value)} className="min-w-0 flex-1" selectClassName="font-semibold">
          {fields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({formatAcres(f.areaM2)})
            </option>
          ))}
        </Select>
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[14px] font-semibold text-ink-soft">Rotation so far</p>
          <Link href="/fields" className="text-[14px] font-semibold text-field underline-offset-2 hover:underline">
            Edit crops on Fields
          </Link>
        </div>
        <RotationStrip crops={field.crops} size="md" className="mt-1.5" />
      </div>
    </div>
  );
}

/** Shown when the farm has no fields yet. */
export function NoFieldsYet({ what, text }: { what: string; text?: string }) {
  return (
    <EmptyState title="Add a field first" action={<Link href="/fields" className={buttonClass('primary')}>Go to Fields</Link>}>
      {text ?? `${what} works one field at a time. Draw a field and enter its crops, then come back here.`}
    </EmptyState>
  );
}
