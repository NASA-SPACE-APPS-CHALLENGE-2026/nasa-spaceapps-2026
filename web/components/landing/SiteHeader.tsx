'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { site } from '@/content/site';

/**
 * Wordmark left, menu pill right, floating over the page. Over the hero both sit bare; once the page
 * scrolls past it they get a soil backing so they stay readable on light sections.
 * The menu is a native <dialog> (focus trap, Escape to close, focus returns to the pill).
 */
export function SiteHeader() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const visibleHero = [...document.querySelectorAll<HTMLElement>('section[aria-labelledby^="hero-title"]')].find((el) => el.offsetHeight > 0);
      const end = visibleHero ? visibleHero.offsetTop + visibleHero.offsetHeight - 80 : 0;
      setSolid(window.scrollY > end);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const show = () => {
    dialog.current?.showModal();
    setOpen(true);
  };
  const hide = () => dialog.current?.close();

  const chip = solid ? 'bg-soil/85 backdrop-blur-md' : 'bg-transparent';
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <div className="flex items-center justify-between gap-4 px-4 pt-4 md:px-8 md:pt-6">
        <Link href="/" className={`pointer-events-auto rounded-full px-3 py-1.5 text-xl font-semibold tracking-[-0.04em] text-chalk transition-colors md:text-2xl ${chip}`}>
          {site.name}
        </Link>
        <button
          type="button"
          onClick={show}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="pointer-events-auto inline-flex h-11 items-center gap-3 rounded-full border border-chalk/25 bg-soil/70 pl-5 pr-4 font-label text-[14px] text-chalk backdrop-blur-md transition-colors hover:border-chalk/60"
        >
          {site.header.menuLabel}
          <span className="flex flex-col gap-[5px]" aria-hidden>
            <span className="block h-[1.5px] w-4 bg-current" />
            <span className="block h-[1.5px] w-4 bg-current" />
          </span>
        </button>
      </div>

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && hide()}
        aria-label={site.header.menuLabel}
        className="pointer-events-auto m-0 h-dvh max-h-none w-full max-w-none bg-soil p-0 text-chalk backdrop:bg-soil/60"
      >
        <div className="flex h-full flex-col px-4 pb-10 pt-4 md:px-8 md:pt-6">
          <div className="flex items-center justify-between">
            <span className="px-3 py-1.5 text-xl font-semibold tracking-[-0.04em] md:text-2xl">{site.name}</span>
            <button type="button" onClick={hide} className="inline-flex h-11 items-center rounded-full border border-chalk/25 px-5 font-label text-[14px] hover:border-chalk/60">
              {site.header.menuCloseLabel}
            </button>
          </div>
          <nav aria-label="Site" className="mt-auto">
            <ul className="flex flex-col gap-1">
              {site.header.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={hide}
                    className="inline-block rounded-lg py-1 text-[clamp(2.25rem,7vw,5rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-chalk transition-colors hover:text-sprout"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </dialog>
    </header>
  );
}
