import { site } from '@/content/site';
import { Media } from '../art';
import { ArrowCircle, CardLabel, Pill } from '../ui';

export const CONTAINER = 'mx-auto w-full max-w-[1360px] px-4 md:px-8';
export const H2 = 'text-[clamp(2.25rem,5vw,4.5rem)] font-semibold leading-[1] tracking-[-0.04em]';

export function Solutions() {
  const s = site.solutions;
  return (
    <>
      {/* Dark-to-light: the soil of the hero gives way to the page. */}
      <div aria-hidden className="h-[22vh] bg-gradient-to-b from-soil to-chalk md:h-[30vh]" />
      <section id="solutions" aria-labelledby="solutions-title" className="scroll-mt-20 bg-chalk pb-24 text-soil md:pb-32">
        <div className={CONTAINER}>
          <Pill tone="light">{s.label}</Pill>
          <h2 id="solutions-title" className={`${H2} mt-6 max-w-[20ch]`}>
            {s.headline}
          </h2>
          <ul className="mt-12 grid gap-4 md:mt-16 md:grid-cols-3">
            {s.cards.map((c) => (
              <li key={c.title}>
                <article className="relative aspect-[5/6] overflow-hidden rounded-[28px] bg-loam md:aspect-[4/5]">
                  <Media image={c.image} art={c.art} alt={c.alt} sizes="(min-width: 768px) 33vw, 100vw" />
                  <div className="absolute inset-0 bg-gradient-to-t from-soil/90 via-soil/30 to-transparent" aria-hidden />
                  <CardLabel className="absolute left-4 top-4 rounded-full bg-soil/65 px-3 py-1 text-chalk backdrop-blur-sm">{c.tag}</CardLabel>
                  <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 p-5 md:p-6">
                    <div className="min-w-0 flex-1 text-chalk">
                      <h3 className="text-[clamp(1.4rem,2vw,1.75rem)] font-semibold leading-[1.1] tracking-[-0.025em]">{c.title}</h3>
                      <p className="mt-2 max-w-[38ch] text-[15px] leading-snug text-chalk/85">{c.body}</p>
                    </div>
                    <ArrowCircle href={c.href} label={`${s.cardLinkLabel} ${c.title}`} className="bg-soil/40 backdrop-blur-sm" />
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
