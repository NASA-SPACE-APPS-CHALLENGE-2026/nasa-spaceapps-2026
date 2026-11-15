import { site } from '@/content/site';
import { Media } from '../art';
import { Pill } from '../ui';
import { CONTAINER } from './Solutions';

export function Stories() {
  const s = site.stories;
  return (
    <section id="stories" aria-labelledby="stories-title" className="scroll-mt-20 bg-chalk pb-24 text-soil md:pb-32">
      <div className={CONTAINER}>
        <h2 id="stories-title">
          <Pill tone="light">{s.label}</Pill>
        </h2>
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {s.items.map((story) => (
            <li key={story.title}>
              <article className="flex h-full flex-col overflow-hidden rounded-[28px] bg-husk">
                <div className="relative aspect-[16/10]">
                  <Media image={story.image} art={story.art} alt={story.alt} sizes="(min-width: 768px) 50vw, 100vw" />
                </div>
                <div className="flex flex-1 flex-col p-6 md:p-8">
                  <Pill tone="light" className="self-start">
                    {s.pill}
                  </Pill>
                  <h3 className="mt-5 max-w-[24ch] text-[clamp(1.5rem,2.6vw,2.25rem)] font-semibold leading-[1.08] tracking-[-0.03em]">{story.title}</h3>
                  <p className="mt-auto pt-8 font-label text-[13px] leading-6 text-soil-soft">
                    <span className="block text-soil">{story.name}</span>
                    {story.role}
                  </p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
