import { site } from '@/content/site';
import { Hero } from '@/components/landing/hero/Hero';
import { HeroStatic } from '@/components/landing/hero/HeroStatic';
import { Closing } from '@/components/landing/sections/Closing';
import { Collage } from '@/components/landing/sections/Collage';
import { Latest } from '@/components/landing/sections/Latest';
import { Measures } from '@/components/landing/sections/Measures';
import { SiteFooter } from '@/components/landing/sections/SiteFooter';
import { Solutions } from '@/components/landing/sections/Solutions';
import { Steps } from '@/components/landing/sections/Steps';
import { Stories } from '@/components/landing/sections/Stories';
import { SiteHeader } from '@/components/landing/SiteHeader';

export default function LandingPage() {
  return (
    <>
      <a href="#solutions" className="sr-only z-[60] rounded-full bg-sprout px-4 py-2 font-medium text-soil focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        {site.header.skipLabel}
      </a>
      <SiteHeader />
      <main>
        <Hero />
        <HeroStatic />
        <Solutions />
        <Measures />
        <Collage />
        <Steps />
        <Stories />
        <Latest />
        <Closing />
      </main>
      <SiteFooter />
    </>
  );
}
