'use client';

import { type ReactNode, type SelectHTMLAttributes, useId } from 'react';
import { ERROR, HINT, INPUT, LABEL } from './styles';

interface Props extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: ReactNode;
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  selectClassName?: string;
}

/** Native select with a real label, a custom chevron and the shared input states. */
export function Select({ label, hideLabel, hint, error, className = '', selectClassName = '', children, ...rest }: Props) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : LABEL}>
        {label}
      </label>
      <div className={`relative ${hideLabel ? '' : 'mt-1'}`}>
        <select
          id={id}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          aria-invalid={error ? true : undefined}
          {...rest}
          className={`${INPUT} cursor-pointer appearance-none pr-10 ${selectClassName}`}
        >
          {children}
        </select>
        <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden>
          <path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {hint && (
        <p id={hintId} className={HINT}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={ERROR} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
