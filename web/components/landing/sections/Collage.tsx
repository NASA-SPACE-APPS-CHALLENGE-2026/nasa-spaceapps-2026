'use client';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect, useRef } from 'react';
import { site } from '@/content/site';
import { AerialArt, SensorArt } from '../art';

type Tile = {
  key: string;
  /** Position and size; tiles marked desktop-only are hidden on phones to keep the statement clear. */
  className: string;
  /** Parallax speed: positive drifts up faster than the page, negative lags. */
  speed: number;
  node: React.ReactNode;
};

function StatCard({ label, value, tone = 'light' }: { label: string; value: string; tone?: 'light' | 'dark' | 'sprout' }) {
  const colours = tone === 'dark' ? 'bg-soil text-chalk' : tone === 'sprout' ? 'bg-sprout text-soil' : 'bg-white text-soil shadow-[0_18px_40px_-24px_rgba(26,21,16,0.45)]';
  const sub = tone === 'dark' ? 'text-chalk-soft' : tone === 'sprout' ? 'text-soil/80' : 'text-soil-soft';
  return (
    <div className={`rounded-[20px] p-4 md:p-5 ${colours}`}>
      <p className={`font-label text-[12px] md:text-[13px] ${sub}`}>{label}</p>
      <p className="mt-3 text-lg font-semibold leading-tight tracking-[-0.02em] md:text-2xl">{value}</p>
    </div>
  );
}

function Photo({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div role="img" aria-label={label} className="overflow-hidden rounded-[20px] shadow-[0_18px_40px_-24px_rgba(26,21,16,0.5)]">
      {children}
    </div>
  );
}

/** Light section: a loose collage of tiles drifting at different speeds around one statement. */
export function Collage() {
  const root = useRef<HTMLElement>(null);
  const c = site.collage;

  useEffect(() => {
    if (!root.current) return;
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      root.current!.querySelectorAll<HTMLElement>('[data-speed]').forEach((el) => {
        const speed = Number(el.dataset.speed);
        gsap.fromTo(
          el,
          { y: speed * 90 },
          { y: speed * -90, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top bottom', end: 'bottom top', scrub: true } },
        );
      });
    });
    return () => mm.revert();
  }, []);

  const tiles: Tile[] = [
    { key: 'pivots', className: 'left-[3%] top-[4%] w-[38%] md:left-[5%] md:top-[6%] md:w-[20%]', speed: 1.2, node: <Photo label={c.tiles.pivotsAlt}><AerialArt kind="pivots" className="block aspect-[4/5] w-full" /></Photo> },
    { key: 'yield', className: 'right-[4%] top-[8%] w-[46%] md:right-[8%] md:top-[10%] md:w-[19%]', speed: 0.5, node: <StatCard label={c.yieldLabel} value={c.yieldValue} /> },
    { key: 'water', className: 'hidden md:block md:left-[33%] md:top-[2%] md:w-[16%]', speed: -0.4, node: <StatCard label={c.waterLabel} value={c.waterValue} tone="dark" /> },
    { key: 'sensor', className: 'left-[5%] bottom-[6%] w-[34%] md:left-[10%] md:bottom-[8%] md:w-[15%]', speed: -0.8, node: <Photo label={c.tiles.sensorAlt}><div className="bg-[#d3cbb8] px-4 pt-6"><SensorArt className="mx-auto block h-auto w-full" /></div></Photo> },
    { key: 'fit', className: 'right-[5%] bottom-[10%] w-[50%] md:right-auto md:left-[36%] md:bottom-[4%] md:w-[20%]', speed: 0.9, node: <StatCard label={c.fitLabel} value={c.fitValue} tone="sprout" /> },
    { key: 'drainage', className: 'hidden md:block md:right-[5%] md:bottom-[10%] md:w-[22%]', speed: -0.5, node: <Photo label={c.tiles.drainageAlt}><AerialArt kind="drainage" className="block aspect-[5/4] w-full" /></Photo> },
    { key: 'rows', className: 'hidden md:block md:right-[30%] md:top-[18%] md:w-[11%]', speed: 1.6, node: <Photo label={c.tiles.rowsAlt}><AerialArt kind="rows" className="block aspect-square w-full" /></Photo> },
  ];

  return (
    <section ref={root} aria-labelledby="collage-statement" className="relative min-h-[760px] overflow-hidden bg-chalk text-soil md:min-h-[125vh]">
      {tiles.map((t) => (
        <div key={t.key} data-speed={t.speed} className={`absolute ${t.className}`}>
          {t.node}
        </div>
      ))}
      <div className="pointer-events-none absolute inset-0 grid place-items-center px-6">
        <p id="collage-statement" className="max-w-[18ch] text-center text-[clamp(1.9rem,4.6vw,4.25rem)] font-semibold leading-[1.04] tracking-[-0.04em]">{c.statement}</p>
      </div>
    </section>
  );
}
