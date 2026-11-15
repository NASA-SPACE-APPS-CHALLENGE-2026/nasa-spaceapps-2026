'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode, useId } from 'react';
import { ERROR, HINT, INPUT, LABEL } from './styles';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: ReactNode;
  /** Visually hide the label but keep it as the input's accessible name. */
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  inputClassName?: string;
}

/**
 * Input with a real <label for> association (unique id per instance), plus hint and error text wired
 * through aria-describedby. Placeholders are examples only, never the accessible name.
 */
export const TextField = forwardRef<HTMLInputElement, Props>(function TextField(
  { label, hideLabel, hint, error, className = '', inputClassName = '', ...input },
  ref,
) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : LABEL}>
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        aria-invalid={error ? true : undefined}
        {...input}
        className={`${hideLabel ? '' : 'mt-1'} ${INPUT} ${inputClassName}`}
      />
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
});
