import { site } from '@/content/site';
import { CtaPair } from '../ui';

export function Closing() {
  const c = site.closing;
  return (
    <section aria-labelledby="closing-title" className="bg-chalk px-4 pb-4 md:px-8 md:pb-8">
      <div className="flex flex-col items-center rounded-[36px] bg-soil px-6 py-20 text-center text-chalk md:rounded-[48px] md:py-32">
        <h2 id="closing-title" className="max-w-[16ch] text-[clamp(2.5rem,6vw,5.5rem)] font-semibold leading-[0.98] tracking-[-0.045em]">
          {c.headline}
        </h2>
        <p className="mt-6 max-w-[44ch] text-lg leading-relaxed text-chalk-soft">{c.subline}</p>
        <div className="mt-10">
          <CtaPair />
        </div>
      </div>
    </section>
  );
}
