import type { ReactNode } from 'react';

/** Every screen opens the same way: title, one plain sentence, and at most one primary action on the right. */
export function PageHeader({ title, description, action, className = '' }: { title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <header className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-3 ${className}`}>
      <div className="min-w-0 max-w-3xl">
        <h1 className="font-plate text-[clamp(1.75rem,4vw,2rem)]">{title}</h1>
        {description && <p className="mt-2 text-[16px] leading-relaxed text-ink-soft">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
