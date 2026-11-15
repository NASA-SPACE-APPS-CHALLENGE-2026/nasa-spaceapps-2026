import Image from 'next/image';
import Link from 'next/link';
import { site } from '@/content/site';
import { AerialArt } from '../art';
import { CONTAINER } from './Solutions';

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  const cls = 'rounded-sm text-[15px] text-chalk/85 transition-colors hover:text-chalk';
  return href.startsWith('http') ? (
    <a href={href} className={cls} target="_blank" rel="noreferrer">
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

/** Dark field photo behind a giant sprout wordmark, with locations, link columns and legal links. */
export function SiteFooter() {
  const f = site.footer;
  return (
    <footer className="relative overflow-hidden bg-soil text-chalk">
      <div className="absolute inset-0" aria-hidden>
        {f.image ? <Image src={f.image} alt="" fill sizes="100vw" className="object-cover" /> : <AerialArt kind="rows" className="h-full w-full" />}
        <div className="absolute inset-0 bg-soil/80" />
        <div className="absolute inset-0 bg-gradient-to-b from-soil via-soil/40 to-soil/70" />
      </div>

      <div className={`${CONTAINER} relative pt-20 md:pt-28`}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-[1.2fr_repeat(3,1fr)]">
          <div className="col-span-2 md:col-span-1">
            <p className="font-label text-[13px] text-chalk-soft">{f.locationsLabel}</p>
            <ul className="mt-3 flex flex-col gap-1">
              {f.locations.map((l) => (
                <li key={l} className="text-2xl font-semibold tracking-[-0.025em]">
                  {l}
                </li>
              ))}
            </ul>
          </div>
          {f.columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="font-label text-[13px] text-chalk-soft">{col.title}</p>
              <ul className="mt-3 flex flex-col gap-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <FooterLink href={l.href}>{l.label}</FooterLink>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <p className="mt-20 select-none text-center text-[clamp(4rem,19vw,21rem)] font-semibold leading-[0.8] tracking-[-0.065em] text-sprout md:mt-28" aria-hidden>
          {site.name}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-chalk/15 py-6 font-label text-[13px] text-chalk-soft">
          <span>{f.copyright}</span>
          <ul className="flex gap-6">
            {f.legal.map((l) => (
              <li key={l.label}>
                <a href={l.href} className="rounded-sm hover:text-chalk">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
