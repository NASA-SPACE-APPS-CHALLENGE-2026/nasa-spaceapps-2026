import Link from 'next/link';
import { WheatRow } from '../art/Logo';

const LINK = 'inline-flex min-h-12 items-center rounded-parcel px-5 font-semibold';

/** Placeholder for tabs that are planned but not built yet. It says what exists today and links there. */
export function ComingSoon({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <section className="mx-auto max-w-2xl px-4 py-12 lg:py-20">
        <WheatRow className="mb-6 h-20 w-40" />
        <h1 className="font-plate text-3xl">{title}</h1>
        <p className="mt-2 text-lg text-ink-soft">Not built yet. It is planned for a later milestone.</p>
        <div className="mt-6 space-y-3 text-[17px] leading-relaxed text-ink">{children}</div>
        <div className="mt-8 rounded-parcel border border-line bg-panel p-4">
          <p className="text-[15px] font-semibold">What you can use today</p>
          <ul className="mt-2 space-y-1 text-[15px] text-ink-soft">
            <li>
              <strong className="text-ink">Fields</strong>: draw your fields and enter past crops. Weather, soil and terrain fill in automatically.
            </li>
            <li>
              <strong className="text-ink">Rotation Explorer</strong>: answer a few questions and compare three rotation strategies for a field.
            </li>
            <li>
              <strong className="text-ink">Planner</strong>: turn a strategy into an editable month-by-month schedule.
            </li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/fields" className={`${LINK} bg-field text-white hover:bg-field-deep`}>
              Go to Fields
            </Link>
            <Link href="/rotation" className={`${LINK} border border-line-strong bg-panel text-ink hover:border-field hover:text-field`}>
              Open Rotation Explorer
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
