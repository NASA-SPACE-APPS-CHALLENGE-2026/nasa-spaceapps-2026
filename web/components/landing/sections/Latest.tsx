import { site } from '@/content/site';
import { Media } from '../art';
import { ArrowCircle, Pill } from '../ui';
import { CONTAINER, H2 } from './Solutions';

export function Latest() {
  const l = site.latest;
  return (
    <section id="latest" aria-labelledby="latest-title" className="scroll-mt-20 bg-chalk pb-24 text-soil md:pb-32">
      <div className={CONTAINER}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Pill tone="light">{l.label}</Pill>
            <h2 id="latest-title" className={`${H2} mt-6`}>
              {l.headline}
            </h2>
          </div>
          <a href={l.seeAllHref} className="rounded-md text-[15px] font-medium underline decoration-soil/40 decoration-1 underline-offset-[6px] hover:decoration-soil">
            {l.seeAll}
          </a>
        </div>
        <article className="mt-10 grid overflow-hidden rounded-[28px] bg-husk md:grid-cols-2">
          <div className="relative aspect-[16/10] md:aspect-auto md:min-h-[340px]">
            <Media image={l.item.image} art={l.item.art} alt={l.item.alt} sizes="(min-width: 768px) 50vw, 100vw" />
          </div>
          <div className="flex flex-col p-6 md:p-10">
            <p className="font-label text-[13px] text-soil-soft">{l.item.date}</p>
            <h3 className="mt-4 max-w-[22ch] text-[clamp(1.5rem,2.6vw,2.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]">{l.item.title}</h3>
            <p className="mt-4 max-w-[48ch] text-[17px] leading-relaxed text-soil-soft">{l.item.body}</p>
            <ArrowCircle href={l.item.href} label={`${l.readLabel} ${l.item.title}`} tone="light" className="mt-8 md:mt-auto" />
          </div>
        </article>
      </div>
    </section>
  );
}
