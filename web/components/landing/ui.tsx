import Link from 'next/link';
import { site } from '@/content/site';

type Tone = 'dark' | 'light';

/** Small rounded label in the mono face. Sentence case, never all caps. */
export function Pill({ children, tone = 'dark', className = '' }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  const colours = tone === 'dark' ? 'border-sprout/50 text-sprout' : 'border-sprout-deep/40 text-sprout-deep';
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-label text-[13px] leading-5 ${colours} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone === 'dark' ? 'bg-sprout' : 'bg-sprout-deep'}`} aria-hidden />
      {children}
    </span>
  );
}

/** Bracketed mono label used on cards: [ Fields ] */
export function CardLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`font-label text-[13px] leading-5 ${className}`}>
      <span aria-hidden>[ </span>
      {children}
      <span aria-hidden> ]</span>
    </span>
  );
}

export function ArrowIcon({ direction = 'right', className = 'h-5 w-5' }: { direction?: 'right' | 'down' | 'up-right'; className?: string }) {
  const rotate = direction === 'down' ? 'rotate-90' : direction === 'up-right' ? '-rotate-45' : '';
  return (
    <svg viewBox="0 0 20 20" className={`${className} ${rotate}`} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10h12M11 5l5 5-5 5" />
    </svg>
  );
}

/** The two calls to action: start a new field, or go to the ones already saved. */
export function CtaPair({ tone = 'dark', align = 'center', size = 'lg' }: { tone?: Tone; align?: 'center' | 'start'; size?: 'lg' | 'md' }) {
  const primary =
    tone === 'dark'
      ? 'bg-sprout text-soil hover:bg-[#a3d05e]'
      : 'bg-soil text-chalk hover:bg-loam';
  const secondary = tone === 'dark' ? 'text-chalk decoration-chalk/40 hover:decoration-chalk' : 'text-soil decoration-soil/40 hover:decoration-soil';
  const pad = size === 'lg' ? 'h-14 pl-7 pr-2 text-lg' : 'h-12 pl-6 pr-1.5 text-base';
  return (
    <div className={`flex flex-col gap-4 ${align === 'center' ? 'items-center' : 'items-start'}`}>
      <Link href={site.cta.href} className={`group inline-flex items-center gap-4 rounded-full font-semibold tracking-[-0.01em] transition-colors ${pad} ${primary}`}>
        {site.cta.label}
        <span className={`grid place-items-center rounded-full transition-transform group-hover:translate-x-0.5 ${size === 'lg' ? 'h-10 w-10' : 'h-9 w-9'} ${tone === 'dark' ? 'bg-soil text-sprout' : 'bg-sprout text-soil'}`}>
          <ArrowIcon />
        </span>
      </Link>
      <Link href={site.cta.secondaryHref} className={`rounded-md px-1 text-[15px] font-medium underline decoration-1 underline-offset-[6px] transition-colors ${secondary}`}>
        {site.cta.secondaryLabel}
      </Link>
    </div>
  );
}

/** Round arrow button. Pass a label for screen readers. */
export function ArrowCircle({ href, label, tone = 'dark', direction = 'up-right', className = '' }: { href: string; label: string; tone?: Tone; direction?: 'right' | 'down' | 'up-right'; className?: string }) {
  const colours = tone === 'dark' ? 'border-chalk/30 text-chalk hover:bg-chalk hover:text-soil' : 'border-soil/25 text-soil hover:bg-soil hover:text-chalk';
  const cls = `grid h-12 w-12 shrink-0 place-items-center rounded-full border transition-colors ${colours} ${className}`;
  const icon = <ArrowIcon direction={direction} />;
  return href.startsWith('#') ? (
    <a href={href} aria-label={label} className={cls}>
      {icon}
    </a>
  ) : (
    <Link href={href} aria-label={label} className={cls}>
      {icon}
    </Link>
  );
}
