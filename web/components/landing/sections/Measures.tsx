import { site } from '@/content/site';
import { SensorArt } from '../art';
import { ArrowCircle, Pill } from '../ui';
import { CONTAINER } from './Solutions';

/** Example topsoil moisture (%) over 30 days: a slow dry-down broken by two rains. Illustrative only. */
const MOISTURE = Array.from({ length: 30 }, (_, d) => {
  let v = 31 - d * 0.42;
  if (d >= 11) v += 7 * Math.exp(-(d - 11) / 5);
  if (d >= 22) v += 5 * Math.exp(-(d - 22) / 4);
  return Math.round(v * 10) / 10;
});

function MoistureChart() {
  const w = 560;
  const h = 180;
  const lo = 15;
  const hi = 35;
  const x = (i: number) => (i / (MOISTURE.length - 1)) * w;
  const y = (v: number) => h - ((v - lo) / (hi - lo)) * h;
  const line = MOISTURE.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = MOISTURE[MOISTURE.length - 1];
  // Labels are HTML (not SVG text) so they stay readable when the chart shrinks on phones.
  return (
    <figure className="mt-4">
      <div className="relative">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block h-40 w-full md:h-48" role="img" aria-label={`${site.measures.report.chartLabel}: from ${MOISTURE[0]}% down to ${last}%, with two rains.`}>
          {[20, 25, 30].map((g) => (
            <path key={g} d={`M0 ${y(g)} H${w}`} stroke="#3d3329" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={`${line} L${w} ${h} L0 ${h}Z`} fill="#8fbf4a" opacity="0.14" />
          <path d={line} fill="none" stroke="#8fbf4a" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {[20, 25, 30].map((g) => (
          <span key={g} className="absolute left-0 -translate-y-full pb-0.5 font-label text-[11px] text-chalk-soft" style={{ top: `${(y(g) / h) * 100}%` }} aria-hidden>
            {g}%
          </span>
        ))}
        <span className="absolute right-0 h-2.5 w-2.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-sprout" style={{ top: `${(y(last) / h) * 100}%` }} aria-hidden />
      </div>
      <figcaption className="mt-2 flex justify-between font-label text-[12px] text-chalk-soft" aria-hidden>
        <span>{site.measures.report.chartStart}</span>
        <span>{site.measures.report.chartEnd}</span>
      </figcaption>
    </figure>
  );
}

function Callout({ title, source, side, className = '' }: { title: string; source: string; side: 'left' | 'right'; className?: string }) {
  return (
    <div className={`flex items-center gap-4 ${side === 'left' ? 'md:flex-row-reverse md:text-right' : ''} ${className}`}>
      <span className="hidden h-px flex-1 border-t border-dashed border-chalk/35 md:block" aria-hidden />
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-sprout" aria-hidden />
      <div>
        <p className="text-xl font-semibold tracking-[-0.02em] md:text-2xl">{title}</p>
        <p className="mt-0.5 font-label text-[13px] text-chalk-soft">{source}</p>
      </div>
    </div>
  );
}

export function Measures() {
  const m = site.measures;
  const [soil, rain, temp] = m.callouts;
  return (
    <section id="measures" aria-labelledby="measures-title" className="scroll-mt-20 bg-black py-24 text-chalk md:py-36">
      <div className={`${CONTAINER} flex flex-col items-center text-center`}>
        <Pill>{m.label}</Pill>
        <h2 id="measures-title" className="mt-6 text-balance text-[clamp(1.85rem,5vw,4.5rem)] font-semibold leading-[1.04] tracking-[-0.04em]">
          {m.headline.map((l) => (
            <span key={l} className="block">
              {l}
            </span>
          ))}
        </h2>
        <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-chalk-soft">{m.subline}</p>
        <ArrowCircle href="#measures-detail" label={m.skipLabel} direction="down" className="mt-10" />
      </div>

      <div id="measures-detail" className={`${CONTAINER} mt-20 scroll-mt-24 md:mt-28`}>
        <div className="grid items-center gap-x-6 gap-y-6 md:grid-cols-[1fr_auto_1fr] md:grid-rows-2">
          <SensorArt label={m.sensorAlt} className="mx-auto h-[300px] w-auto md:col-start-2 md:row-span-2 md:row-start-1 md:h-[440px]" />
          <Callout {...soil} side="left" className="md:col-start-1 md:row-start-2 md:self-start" />
          <Callout {...rain} side="left" className="md:col-start-1 md:row-start-1 md:self-end" />
          <Callout {...temp} side="right" className="md:col-start-3 md:row-span-2 md:row-start-1" />
        </div>

        <article aria-labelledby="report-title" className="mx-auto mt-20 max-w-4xl rounded-[28px] bg-loam p-5 md:mt-28 md:p-8">
          <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h3 id="report-title" className="text-2xl font-semibold tracking-[-0.025em]">
              {m.report.title}
            </h3>
            <span className="rounded-full border border-chalk/20 px-3 py-0.5 font-label text-[13px] text-chalk">{m.report.field}</span>
            <span className="ml-auto font-label text-[13px] text-chalk-soft">{m.report.note}</span>
          </header>
          <div className="mt-6 grid gap-4 md:grid-cols-[1fr_240px]">
            <div className="rounded-2xl bg-soil p-5">
              <p className="font-label text-[13px] text-chalk-soft">{m.report.chartLabel}</p>
              <MoistureChart />
            </div>
            <div className="flex flex-col justify-between rounded-2xl bg-sprout p-5 text-soil">
              <p className="font-label text-[13px]">{m.report.statLabel}</p>
              <p className="mt-8 flex items-baseline gap-2">
                <span className="text-[clamp(4rem,9vw,6.5rem)] font-semibold leading-none tracking-[-0.05em]">{m.report.statValue}</span>
                <span className="text-2xl font-semibold">{m.report.statUnit}</span>
              </p>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
