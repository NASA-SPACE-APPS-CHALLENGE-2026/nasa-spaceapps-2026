'use client';

import { useRef } from 'react';

/**
 * Radio group drawn as joined parcels. Arrow keys move the selection (roving tabindex), like native radios.
 * `variant="float"` is for controls that sit on the map.
 */
export function SegmentedControl<T extends string | number>({
  label,
  value,
  options,
  onChange,
  size = 'md',
  variant = 'plain',
  className = '',
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  size?: 'md' | 'sm';
  variant?: 'plain' | 'float';
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const move = (to: number) => {
    const n = (to + options.length) % options.length;
    onChange(options[n].value);
    refs.current[n]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex max-w-full rounded-parcel border p-0.5 ${variant === 'float' ? 'rounded-float border-line/70 bg-panel/95 shadow-float backdrop-blur-md' : 'border-line-strong bg-paper'} ${className}`}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(idx + 1); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(idx - 1); }
      }}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`${size === 'md' ? 'min-h-10 px-3.5 text-[14.5px]' : 'min-h-9 px-3 text-[13.5px]'} ${variant === 'float' ? 'rounded-[11px]' : 'rounded-[3px]'} font-semibold whitespace-nowrap transition-colors ${
              on ? 'bg-field text-white' : 'text-ink-soft hover:bg-field-tint hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
