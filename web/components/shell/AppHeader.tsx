'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useFarm } from '@/lib/client/StoreProvider';
import { useLastFieldId } from '@/lib/client/session';
import { Logo } from '../art/Logo';

export const TABS = [
  { href: '/overview', label: 'Overview' },
  { href: '/fields', label: 'Fields' },
  { href: '/rotation', label: 'Rotation Explorer' },
  { href: '/planner', label: 'Planner' },
  { href: '/simulator', label: 'Scenario Simulator' },
  { href: '/finance', label: 'Finance' },
  { href: '/imports', label: 'Imports' },
] as const;

export function AppHeader() {
  const path = usePathname();
  const lastFieldId = useLastFieldId();
  const { fields } = useFarm();
  // Carry the last field the farmer looked at into the Rotation Explorer link (only if it still exists).
  const rotationField = lastFieldId && fields.some((f) => f.id === lastFieldId) ? lastFieldId : undefined;
  const hrefFor = (href: string) => (href === '/rotation' && rotationField ? `/rotation?field=${encodeURIComponent(rotationField)}` : href);

  return (
    <header className="z-[1100] border-b border-line bg-panel">
      <div className="flex items-center gap-3 px-4 pt-2 lg:gap-6 lg:py-0">
        <Link href="/overview" className="flex shrink-0 items-center gap-2 rounded-lg py-1 lg:py-3" aria-label="FieldShift overview">
          <Logo className="h-8 w-8" />
          <span className="font-plate text-xl">FieldShift</span>
        </Link>
        <nav aria-label="Main" className="hidden min-w-0 flex-1 lg:block">
          <TabList path={path} hrefFor={hrefFor} />
        </nav>
      </div>
      <nav aria-label="Main" className="overflow-x-auto px-2 lg:hidden [scrollbar-width:none]">
        <TabList path={path} hrefFor={hrefFor} scrollActive />
      </nav>
    </header>
  );
}

function TabList({ path, hrefFor, scrollActive }: { path: string; hrefFor: (href: string) => string; scrollActive?: boolean }) {
  const activeRef = useRef<HTMLAnchorElement>(null);
  // On phones the tab row scrolls sideways; keep the current tab in view.
  useEffect(() => {
    if (scrollActive) activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [path, scrollActive]);
  return (
    <ul className="flex gap-1 whitespace-nowrap">
      {TABS.map((t) => {
        const active = path === t.href || path.startsWith(`${t.href}/`);
        return (
          <li key={t.href}>
            <Link
              ref={active ? activeRef : undefined}
              href={hrefFor(t.href)}
              aria-current={active ? 'page' : undefined}
              className={`relative inline-flex min-h-12 items-center rounded-t-lg px-3 text-[15px] font-medium transition-colors ${
                active ? 'text-sky-deep' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {t.label}
              {active && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-sky" aria-hidden />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
