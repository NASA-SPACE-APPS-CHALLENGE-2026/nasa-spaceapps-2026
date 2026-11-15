'use client';

import Link from 'next/link';
import { useId } from 'react';
import { formatAcres } from '@/lib/domain/acreage';
import type { Field } from '@/lib/domain/types';
import { RotationStrip } from '../fields/RotationStrip';

/** Field switcher used by Rotation Explorer and Planner, with the field's rotation strip. */
export function FieldPicker({ fields, field, onSelect }: { fields: Field[]; field: Field; onSelect: (id: string) => void }) {
  const id = useId();
  return (
    <div className="rounded-[var(--radius-panel)] border border-line bg-panel p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="block text-[14px] font-semibold text-ink-soft">
            Field
          </label>
          <select
            id={id}
            value={field.id}
            onChange={(e) => onSelect(e.target.value)}
            className="mt-1 block min-h-12 w-full max-w-md rounded-[var(--radius-control)] border border-line-strong bg-panel px-3 text-[16px] font-semibold"
          >
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({formatAcres(f.areaM2)})
              </option>
            ))}
          </select>
        </div>
        <Link href={`/fields`} className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-2 text-[15px] font-semibold text-sky-deep hover:bg-sky-tint">
          Edit crops on Fields
        </Link>
      </div>
      <div className="mt-3">
        <RotationStrip crops={field.crops} size="md" />
        <p className="mt-1 flex justify-between text-[12.5px] text-ink-faint">
          <span>{field.crops.history[field.crops.history.length - 1]?.year ?? field.crops.current.year}</span>
          <span>{field.crops.current.year}</span>
        </p>
      </div>
    </div>
  );
}

/** Shown when the farm has no fields yet. */
export function NoFieldsYet({ what, text }: { what: string; text?: string }) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-line bg-panel p-6">
      <h2 className="font-plate text-xl">Add a field first</h2>
      <p className="mt-2 text-[16px] text-ink-soft">{text ?? `${what} works one field at a time. Draw a field and enter its crops, then come back here.`}</p>
      <Link href="/fields" className="mt-4 inline-flex min-h-12 items-center rounded-[var(--radius-control)] bg-sky px-5 font-semibold text-white hover:bg-sky-deep">
        Go to Fields
      </Link>
    </div>
  );
}
