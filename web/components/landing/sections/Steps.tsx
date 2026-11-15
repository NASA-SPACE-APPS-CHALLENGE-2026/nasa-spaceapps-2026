import { site } from '@/content/site';
import { Pill } from '../ui';
import { CONTAINER, H2 } from './Solutions';

/** A real sequence (draw → details → results → plan), so the rows are numbered. */
export function Steps() {
  const s = site.steps;
  return (
    <section id="how-it-works" aria-labelledby="steps-title" className="scroll-mt-20 bg-chalk py-24 text-soil md:py-32">
      <div className={CONTAINER}>
        <Pill tone="light">{s.label}</Pill>
        <h2 id="steps-title" className={`${H2} mt-6 max-w-[18ch]`}>
          {s.headline}
        </h2>
        <ol className="mt-12 flex flex-col gap-3 md:mt-16">
          {s.items.map((item, i) => (
            <li key={item.title} className="grid grid-cols-[auto_1fr] items-start gap-x-5 gap-y-2 rounded-[24px] bg-husk p-5 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.15fr)] md:items-center md:gap-x-8 md:p-7">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-sprout-deep text-lg font-semibold text-chalk md:h-14 md:w-14 md:text-xl" aria-hidden>
                {i + 1}
              </span>
              <h3 className="self-center text-[clamp(1.35rem,2.4vw,2rem)] font-semibold leading-tight tracking-[-0.03em]">
                <span className="sr-only">{s.stepPrefix} {i + 1}: </span>
                {item.title}
              </h3>
              <p className="col-span-2 max-w-[56ch] text-[17px] leading-relaxed text-soil-soft md:col-span-1">{item.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
