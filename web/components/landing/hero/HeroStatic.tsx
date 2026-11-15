'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useRef } from 'react';
import { site } from '@/content/site';
import { useReducedMotion } from '../hooks';
import { CtaPair, Pill } from '../ui';

const HeroCanvas = dynamic(() => import('./HeroCanvas'), { ssr: false });

/** A still frame of the scene: the slab lifted, close on the rows. */
const STILL_PROGRESS = 0.6;

/**
 * Reduced-motion hero: the same five ideas as stacked, ordinary sections. One still render of the slab,
 * no scrubbing, no drift. Shown only under prefers-reduced-motion (CSS), so it never causes a layout swap.
 */
export function HeroStatic() {
  const reduced = useReducedMotion();
  const progress = useRef(STILL_PROGRESS);
  const still = site.hero.assets.rows ?? site.hero.assets.field;
  return (
    <section aria-labelledby="hero-title-static" className="hidden motion-reduce:block">
      <div className="relative grid min-h-[100svh] place-items-center overflow-hidden px-4">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,#3a2f22_0%,#1a1510_62%)]" aria-hidden />
        {still ? (
          <Image src={still} alt={site.hero.alt} fill sizes="100vw" className="object-cover" />
        ) : (
          reduced && <HeroCanvas progress={progress} still label={site.hero.alt} />
        )}
        <div className="pointer-events-none absolute inset-0 bg-soil/45" aria-hidden />
        <h1 id="hero-title-static" className="relative text-center text-[clamp(4.5rem,17vw,16rem)] font-semibold leading-[0.85] tracking-[-0.055em] text-chalk">
          {site.name}
        </h1>
      </div>
      <div className="mx-auto flex max-w-5xl flex-col gap-24 px-4 py-24 text-center md:gap-32 md:py-32">
        <p className="mx-auto max-w-[14ch] text-[clamp(3rem,8vw,7rem)] font-semibold leading-[0.95] tracking-[-0.045em]">{site.hero.tagline}</p>
        <p className="mx-auto max-w-[38ch] text-[clamp(1.25rem,2.4vw,2.1rem)] font-medium leading-[1.25] tracking-[-0.02em]">{site.hero.description}</p>
        <div className="flex flex-col items-center gap-5">
          <Pill>{site.hero.missionLabel}</Pill>
          <p className="max-w-[24ch] text-[clamp(1.75rem,4vw,3.6rem)] font-semibold leading-[1.05] tracking-[-0.035em]">{site.hero.mission}</p>
        </div>
        <CtaPair />
      </div>
    </section>
  );
}
