import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-parcel font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 ' +
  'disabled:cursor-not-allowed aria-disabled:cursor-not-allowed';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-field text-white hover:bg-field-deep active:bg-field-deep disabled:bg-field/45 aria-disabled:bg-field/45',
  secondary:
    'border border-line-strong bg-panel text-ink hover:border-field hover:text-field active:bg-field-tint disabled:border-line disabled:text-ink-faint aria-disabled:text-ink-faint',
  ghost: 'text-field hover:bg-field-tint active:bg-field-tint disabled:text-ink-faint disabled:hover:bg-transparent',
  danger: 'bg-alert text-white hover:bg-[#8a3220] active:bg-[#8a3220] disabled:bg-alert/45',
};

const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-12 px-4 text-[15px]',
  sm: 'min-h-10 px-3 text-[14px]',
};

/** Class string for anything that should look like a button (e.g. a Next <Link>). */
export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra = ''): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean };

/** Primary, secondary, ghost and danger buttons. `loading` keeps the label, adds a spinner and blocks clicks. */
export function Button({ variant = 'primary', size = 'md', loading = false, className = '', children, disabled, ...rest }: Props) {
  return (
    <button type="button" {...rest} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass(variant, size, className)}>
      {loading && <span className={`spinner ${variant === 'primary' || variant === 'danger' ? 'spinner-on-dark' : ''}`} aria-hidden />}
      {children}
    </button>
  );
}
