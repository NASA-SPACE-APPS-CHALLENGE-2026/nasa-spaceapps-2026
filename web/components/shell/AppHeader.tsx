'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Logo } from '../art/Logo';

type Icon = 'overview' | 'fields' | 'rotation' | 'planner' | 'simulator' | 'finance' | 'imports' | 'more';

export const TABS = [
  { href: '/overview', label: 'Overview', short: 'Overview', icon: 'overview', blurb: 'Your whole farm at a glance' },
  { href: '/fields', label: 'Fields', short: 'Fields', icon: 'fields', blurb: '' },
  { href: '/rotation', label: 'Rotation Explorer', short: 'Rotation', icon: 'rotation', blurb: '' },
  { href: '/planner', label: 'Planner', short: 'Planner', icon: 'planner', blurb: '' },
  { href: '/simulator', label: 'Scenario Simulator', short: 'Simulator', icon: 'simulator', blurb: 'Try other crops, prices and weather' },
  { href: '/finance', label: 'Finance', short: 'Finance', icon: 'finance', blurb: '' },
  { href: '/imports', label: 'Imports', short: 'Imports', icon: 'imports', blurb: 'Bring in boundary files' },
] as const satisfies ReadonlyArray<{ href: string; label: string; short: string; icon: Icon; blurb: string }>;

/** On phones these four sit in the bottom bar; the rest live under More. */
const PRIMARY = ['/fields', '/rotation', '/planner', '/finance'];

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

function TabIcon({ icon, className = 'h-6 w-6' }: { icon: Icon; className?: string }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {icon === 'fields' && <path {...p} d="M3 4h7l-1 7H3zM10 4h11v6l-12 1zM3 11h6l1 9H3zM9 11l12-1v10H10z" />}
      {icon === 'rotation' && (
        <>
          <path {...p} d="M19 8a8 8 0 0 0-14 1M5 16a8 8 0 0 0 14-1" />
          <path {...p} d="M19 3.5V8h-4.5M5 20.5V16h4.5" />
        </>
      )}
      {icon === 'planner' && (
        <>
          <rect {...p} x="3.5" y="5" width="17" height="15" rx="1.5" />
          <path {...p} d="M3.5 10h17M8 3v4M16 3v4M7 14h5M7 17h8" />
        </>
      )}
      {icon === 'finance' && <path {...p} d="M4 20V13M10 20V8M16 20v-9M22 20H2M4 9l6-4 6 3 5-4" />}
      {icon === 'overview' && <path {...p} d="M3.5 3.5h7v7h-7zM13.5 3.5h7v4h-7zM13.5 10.5h7v10h-7zM3.5 13.5h7v7h-7z" />}
      {icon === 'simulator' && <path {...p} d="M5 4v16M12 4v16M19 4v16M3 8h4M10 15h4M17 10h4" />}
      {icon === 'imports' && <path {...p} d="M12 3v11m0 0-4-4m4 4 4-4M4 15v4.5h16V15" />}
      {icon === 'more' && (
        <>
          <circle cx="5" cy="12" r="1.6" fill="currentColor" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <circle cx="19" cy="12" r="1.6" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

/** Desktop: one dark soil bar with all tabs. Phones: a slim top bar (see BottomNav for the tabs). */
export function AppHeader() {
  const path = usePathname();
  const current = TABS.find((t) => isActive(path, t.href));
  return (
    <header className="on-dark z-[1100] shrink-0 bg-soil text-chalk">
      <div className="flex h-14 items-center gap-6 px-4 lg:px-5">
        <Link href="/overview" className="flex shrink-0 items-center gap-2.5 rounded-parcel" aria-label="PlotTwist home (Overview)">
          <Logo tone="dark" className="h-8 w-8" />
          <span className="font-plate text-[20px] tracking-[-0.02em]">PlotTwist</span>
        </Link>
        {current && (
          <span className="ml-auto truncate text-[15px] font-semibold text-chalk-soft lg:hidden" aria-hidden>
            {current.label}
          </span>
        )}
        <nav aria-label="Main" className="hidden h-full min-w-0 flex-1 lg:block">
          <ul className="flex h-full items-stretch gap-1">
            {TABS.map((t) => {
              const active = isActive(path, t.href);
              return (
                <li key={t.href} className="flex">
                  <Link
                    href={t.href}
                    aria-current={active ? 'page' : undefined}
                    className={`relative inline-flex items-center px-3 text-[15px] font-medium transition-colors ${active ? 'text-chalk' : 'text-chalk-soft hover:text-chalk'}`}
                  >
                    {t.label}
                    <span className={`absolute inset-x-3 bottom-0 h-[3px] bg-straw transition-transform duration-200 ${active ? 'scale-x-100' : 'scale-x-0'}`} aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}

/** Phones and tablets: four main tabs plus More, which opens a sheet with the rest. */
export function BottomNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const moreActive = !PRIMARY.some((h) => isActive(path, h));
  const sheet = useRef<HTMLDivElement>(null);
  const moreBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    sheet.current?.querySelector<HTMLElement>('a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        moreBtn.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const item = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11.5px] font-semibold transition-colors';
  return (
    <>
      <nav aria-label="Main" className="bottom-nav on-dark z-[1100] shrink-0 border-t border-loam-line bg-soil pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="flex">
          {TABS.filter((t) => PRIMARY.includes(t.href)).map((t) => {
            const active = isActive(path, t.href);
            return (
              <li key={t.href} className="flex flex-1">
                <Link href={t.href} aria-current={active ? 'page' : undefined} className={`${item} relative ${active ? 'text-chalk' : 'text-chalk-soft'}`}>
                  {active && <span className="absolute inset-x-5 top-0 h-[3px] bg-straw" aria-hidden />}
                  <TabIcon icon={t.icon} />
                  {t.short}
                </Link>
              </li>
            );
          })}
          <li className="flex flex-1">
            <button ref={moreBtn} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" className={`${item} relative ${moreActive || open ? 'text-chalk' : 'text-chalk-soft'}`}>
              {moreActive && <span className="absolute inset-x-5 top-0 h-[3px] bg-straw" aria-hidden />}
              <TabIcon icon="more" />
              More
            </button>
          </li>
        </ul>
      </nav>
      {open && (
        <div className="fixed inset-0 z-[1200] lg:hidden" role="presentation">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-soil/45" onClick={() => setOpen(false)} tabIndex={-1} />
          <div ref={sheet} role="dialog" aria-modal="true" aria-label="More screens" className="motion-sheet absolute inset-x-0 bottom-0 rounded-t-float bg-panel px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-float">
            <span className="mx-auto mb-3 block h-1.5 w-12 rounded-full bg-line-strong" aria-hidden />
            <ul className="divide-y divide-line">
              {TABS.filter((t) => !PRIMARY.includes(t.href)).map((t) => {
                const active = isActive(path, t.href);
                return (
                  <li key={t.href}>
                    <Link href={t.href} aria-current={active ? 'page' : undefined} className={`flex min-h-16 items-center gap-4 rounded-parcel px-2 ${active ? 'text-field' : 'text-ink'} hover:bg-field-tint`}>
                      <TabIcon icon={t.icon} className="h-6 w-6 shrink-0" />
                      <span>
                        <span className="block text-[16px] font-semibold">{t.label}</span>
                        <span className="block text-[14px] text-ink-soft">{t.blurb}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
