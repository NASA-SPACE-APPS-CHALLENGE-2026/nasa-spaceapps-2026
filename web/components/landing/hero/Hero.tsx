'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect, useRef, useState } from 'react';
import { site } from '@/content/site';
import { useReducedMotion } from '../hooks';
import { CtaPair, Pill } from '../ui';
import { stillsAt, TEXT_STEPS, textState, type TextStep } from './timeline';

const HeroCanvas = dynamic(() => import('./HeroCanvas'), { ssr: false });

type StillKey = keyof typeof site.hero.assets;
const STILLS = (Object.keys(site.hero.assets) as StillKey[]).filter((k) => site.hero.assets[k]);
const ALL_STILLS = STILLS.length === 4;

/**
 * The pinned hero. A 500vh (350vh on phones) track with a sticky full-screen stage; scroll position
 * through the track (native scroll, read by ScrollTrigger) drives the text and the 3D zoom.
 * Hidden under prefers-reduced-motion, where HeroStatic takes its place.
 */
export function Hero() {
  const track = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const steps = useRef<Partial<Record<TextStep['id'], HTMLDivElement | null>>>({});
  const stills = useRef<Partial<Record<StillKey, HTMLDivElement | null>>>({});
  const hint = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!track.current) return;
    gsap.registerPlugin(ScrollTrigger);
    const apply = (p: number) => {
      progress.current = p;
      for (const s of TEXT_STEPS) {
        const el = steps.current[s.id];
        if (!el) continue;
        const { opacity, y } = textState(s, p);
        el.style.opacity = String(opacity);
        el.style.transform = `translate3d(0, ${y}px, 0)`;
        // Hidden steps leave the tab order and the accessibility tree's focus path.
        el.style.visibility = opacity < 0.02 ? 'hidden' : 'visible';
      }
      const so = stillsAt(p);
      for (const k of STILLS) {
        const el = stills.current[k];
        if (el) el.style.opacity = String(so[k]);
      }
      if (hint.current) hint.current.style.opacity = String(textState(TEXT_STEPS[0], p).opacity);
    };
    const st = ScrollTrigger.create({
      trigger: track.current,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => apply(self.progress),
      onRefresh: (self) => apply(self.progress),
    });
    apply(st.progress);
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: '100px' });
    io.observe(track.current);
    return () => {
      st.kill();
      io.disconnect();
    };
  }, []);

  return (
    <section ref={track} aria-labelledby="hero-title" className="relative h-[350vh] md:h-[500vh] motion-reduce:hidden">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        {/* Poster: same size as the canvas, shown until the first frame so nothing shifts. */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,#3a2f22_0%,#1a1510_62%)]" aria-hidden />

        {reduced === false && !ALL_STILLS && (
          <HeroCanvas progress={progress} paused={!inView} satelliteImage={site.hero.assets.satellite} label={site.hero.alt} />
        )}

        {STILLS.map((k) => (
          <div key={k} ref={(el) => void (stills.current[k] = el)} className="absolute inset-0 opacity-0" aria-hidden>
            <Image src={site.hero.assets[k]!} alt="" fill sizes="100vw" className="object-cover" priority={k === 'satellite'} />
          </div>
        ))}

        {/* Edge vignette and a floor scrim so text stays readable over any frame. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(26,21,16,0.75)_100%)]" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-soil/90 via-soil/40 to-transparent" aria-hidden />

        <div className="absolute inset-0 px-4">
          <div ref={(el) => void (steps.current.name = el)} className="absolute inset-0 grid place-items-center px-4">
            <h1 id="hero-title" className="text-center text-[clamp(4.5rem,17vw,16rem)] font-semibold leading-[0.85] tracking-[-0.055em] text-chalk">
              {site.name}
            </h1>
          </div>

          <div ref={(el) => void (steps.current.tagline = el)} className="absolute inset-0 grid place-items-center px-4" style={{ opacity: 0, visibility: 'hidden' }}>
            <p className="max-w-[14ch] text-center text-[clamp(3rem,8.5vw,8rem)] font-semibold leading-[0.95] tracking-[-0.045em] text-chalk">{site.hero.tagline}</p>
          </div>

          <div ref={(el) => void (steps.current.description = el)} className="absolute inset-x-4 bottom-[9svh] flex justify-center md:bottom-[11svh]" style={{ opacity: 0, visibility: 'hidden' }}>
            <p className="max-w-[38ch] text-center text-[clamp(1.25rem,2.4vw,2.1rem)] font-medium leading-[1.25] tracking-[-0.02em] text-chalk">{site.hero.description}</p>
          </div>

          <div ref={(el) => void (steps.current.mission = el)} className="absolute inset-x-4 bottom-[9svh] flex flex-col items-center gap-5 md:bottom-[11svh]" style={{ opacity: 0, visibility: 'hidden' }}>
            <Pill>{site.hero.missionLabel}</Pill>
            <p className="max-w-[24ch] text-center text-[clamp(1.75rem,4vw,3.6rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-chalk">{site.hero.mission}</p>
          </div>

          <div ref={(el) => void (steps.current.cta = el)} className="absolute inset-x-4 bottom-[9svh] flex justify-center md:bottom-[11svh]" style={{ opacity: 0, visibility: 'hidden' }}>
            <CtaPair />
          </div>
        </div>

        <div ref={hint} className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-2 font-label text-[13px] text-chalk-soft" aria-hidden>
          {site.hero.scrollHint}
          <span className="h-8 w-px bg-gradient-to-b from-chalk-soft to-transparent" />
        </div>
      </div>
    </section>
  );
}
