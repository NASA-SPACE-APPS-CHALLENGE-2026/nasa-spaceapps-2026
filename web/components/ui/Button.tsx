import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-sky text-white hover:bg-sky-deep disabled:bg-sky/40',
  secondary: 'border border-line-strong bg-panel text-ink hover:border-sky hover:text-sky-deep disabled:opacity-50',
  ghost: 'text-sky-deep hover:bg-sky-tint disabled:opacity-50',
  danger: 'bg-alert text-white hover:bg-[#8f3220]',
};

export function Button({ variant = 'primary', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    />
  );
}
