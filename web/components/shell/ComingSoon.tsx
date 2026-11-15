import Link from 'next/link';
import { WheatRow } from '../art/Logo';

export interface PageAction {
  href: string;
  label: string;
}

const DEFAULT_ACTIONS: PageAction[] = [{ href: '/fields', label: 'Go to Fields' }];

export function ComingSoon({ title, children, actions = DEFAULT_ACTIONS }: { title: string; children: React.ReactNode; actions?: PageAction[] }) {
  return (
    <div className="h-full overflow-y-auto">
      <section className="mx-auto max-w-2xl px-4 py-12 lg:py-20">
        <WheatRow className="mb-6 h-20 w-40" />
        <h1 className="font-plate text-3xl">{title}</h1>
        <p className="mt-2 text-lg text-ink-soft">Coming in a later milestone.</p>
        <div className="mt-6 space-y-3 text-[17px] leading-relaxed text-ink">{children}</div>
        <div className="mt-8 flex flex-wrap gap-2">
          {actions.map((a, i) => (
            <Link
              key={a.href}
              href={a.href}
              className={`inline-flex min-h-12 items-center rounded-[var(--radius-control)] px-5 font-semibold ${
                i === 0 ? 'bg-sky text-white hover:bg-sky-deep' : 'border border-line-strong bg-panel text-sky-deep hover:border-sky'
              }`}
            >
              {a.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
