'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  return (
    <header className="z-[1100] border-b border-line bg-panel">
      <div className="flex items-center gap-3 px-4 pt-2 lg:gap-6 lg:py-0">
        <Link href="/fields" className="flex shrink-0 items-center gap-2 rounded-lg py-1 lg:py-3" aria-label="FieldShift home">
          <Logo className="h-8 w-8" />
          <span className="font-plate text-xl">FieldShift</span>
        </Link>
        <nav aria-label="Main" className="hidden min-w-0 flex-1 lg:block">
          <TabList path={path} />
        </nav>
      </div>
      <nav aria-label="Main" className="overflow-x-auto px-2 lg:hidden [scrollbar-width:none]">
        <TabList path={path} />
      </nav>
    </header>
  );
}

function TabList({ path }: { path: string }) {
  return (
    <ul className="flex gap-1 whitespace-nowrap">
      {TABS.map((t) => {
        const active = path === t.href || path.startsWith(`${t.href}/`);
        return (
          <li key={t.href}>
            <Link
              href={t.href}
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
