'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cropColor } from '@/lib/domain/cropColors';
import { CROP_CATALOG, catalogCrop, cropLabel, DOUBLE_CROP_OPTIONS } from '@/lib/domain/crops';
import type { CropRef } from '@/lib/domain/types';

interface Option {
  key: string;
  label: string;
  group: string;
  ref: CropRef;
  search: string;
}

const OPTIONS: Option[] = [
  ...CROP_CATALOG.map((c) => ({
    key: c.id,
    label: c.name,
    group: c.group,
    ref: { kind: 'catalog', id: c.id } as CropRef,
    search: [c.name, ...(c.aliases ?? [])].join(' ').toLowerCase(),
  })),
  ...DOUBLE_CROP_OPTIONS.map((d) => {
    const ref: CropRef = { kind: 'double', first: d.first, second: d.second };
    return {
      key: `${d.first}>${d.second}`,
      label: cropLabel(ref),
      group: 'Double crops',
      ref,
      search: `${catalogCrop(d.first)?.name} ${catalogCrop(d.second)?.name} double`.toLowerCase(),
    };
  }),
];

export function CropPicker({ value, onChange, label }: { value: CropRef | null; onChange: (v: CropRef | null) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => (q ? OPTIONS.filter((o) => o.search.includes(q)) : OPTIONS.filter((o) => o.group !== 'Double crops')), [q]);
  const showOther = q.length > 1 && !matches.some((m) => m.label.toLowerCase() === q);
  const total = matches.length + (showOther ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open]);

  useEffect(() => setActive(0), [q]);

  const choose = (ref: CropRef | null) => {
    onChange(ref);
    setOpen(false);
    setQuery('');
  };

  const pickActive = () => {
    if (active < matches.length) choose(matches[active].ref);
    else if (showOther) choose({ kind: 'other', text: query.trim().slice(0, 60) });
  };

  let lastGroup = '';
  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${value ? cropLabel(value) : 'not entered'}`}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-panel px-3 text-left text-[15px] hover:border-sky"
      >
        {value && <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: cropColor(value) }} aria-hidden />}
        <span className={`min-w-0 flex-1 truncate ${value ? 'font-medium' : 'text-ink-faint'}`}>{value ? cropLabel(value) : 'Choose crop'}</span>
        <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden>
          <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 min-w-[260px] overflow-hidden rounded-[var(--radius-panel)] border border-line-strong bg-panel shadow-[0_12px_32px_-12px_rgba(29,43,34,0.35)]">
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={total ? `${listId}-${active}` : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(total - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                pickActive();
              } else if (e.key === 'Escape') {
                setOpen(false);
              }
            }}
            placeholder="Search crops, or type your own"
            className="min-h-12 w-full border-b border-line px-3 text-[15px] outline-none"
          />
          <ul id={listId} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto py-1">
            {matches.map((o, i) => {
              const header = o.group !== lastGroup ? o.group : null;
              lastGroup = o.group;
              return (
                <li key={o.key} role="presentation">
                  {header && <div className="px-3 pb-1 pt-3 text-[13px] font-semibold text-ink-faint">{header}</div>}
                  <div
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onPointerEnter={() => setActive(i)}
                    onClick={() => choose(o.ref)}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 text-[15px] ${i === active ? 'bg-sky-tint' : ''}`}
                  >
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: cropColor(o.ref) }} aria-hidden />
                    {o.label}
                  </div>
                </li>
              );
            })}
            {showOther && (
              <li role="presentation">
                <div
                  id={`${listId}-${matches.length}`}
                  role="option"
                  aria-selected={active === matches.length}
                  onPointerEnter={() => setActive(matches.length)}
                  onClick={() => choose({ kind: 'other', text: query.trim().slice(0, 60) })}
                  className={`flex min-h-11 cursor-pointer items-center px-3 text-[15px] ${active === matches.length ? 'bg-sky-tint' : ''}`}
                >
                  Use &ldquo;{query.trim()}&rdquo; (other crop)
                </div>
              </li>
            )}
            {total === 0 && <li className="px-3 py-3 text-[15px] text-ink-faint">No match. Keep typing to enter it as another crop.</li>}
          </ul>
          {value && (
            <button type="button" onClick={() => choose(null)} className="min-h-11 w-full border-t border-line px-3 text-left text-[15px] text-alert hover:bg-alert-tint">
              Clear this season
            </button>
          )}
        </div>
      )}
    </div>
  );
}
