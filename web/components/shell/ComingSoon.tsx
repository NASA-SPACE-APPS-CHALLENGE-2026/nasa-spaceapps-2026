import Link from 'next/link';
import { WheatRow } from '../art/Logo';

export function ComingSoon({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <section className="mx-auto max-w-2xl px-4 py-12 lg:py-20">
        <WheatRow className="mb-6 h-20 w-40" />
        <h1 className="font-plate text-3xl">{title}</h1>
        <p className="mt-2 text-lg text-ink-soft">Coming in a later milestone.</p>
        <div className="mt-6 space-y-3 text-[17px] leading-relaxed text-ink">{children}</div>
        <Link href="/fields" className="mt-8 inline-flex min-h-12 items-center rounded-[var(--radius-control)] bg-sky px-5 font-semibold text-white hover:bg-sky-deep">
          Go to Fields
        </Link>
      </section>
    </div>
  );
}
