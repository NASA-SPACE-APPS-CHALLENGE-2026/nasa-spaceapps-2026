import type { ReactNode } from 'react';
import { ParcelArt } from '../art/ParcelArt';

/** What to do next when there is nothing to show yet: illustration, plain heading, one sentence, one action. */
export function EmptyState({ title, children, action, secondary, art = true, className = '', testId, headingLevel = 2 }: { title: string; children?: ReactNode; action?: ReactNode; secondary?: ReactNode; art?: boolean; className?: string; testId?: string; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className={`flex flex-col gap-5 border-y border-line py-8 sm:flex-row sm:items-center sm:gap-8 ${className}`} data-testid={testId}>
      {art && <ParcelArt className="h-[72px] w-[120px] shrink-0 rounded-parcel" />}
      <div className="min-w-0 max-w-xl">
        <H className="font-plate text-h2">{title}</H>
        {children && <div className="mt-2 text-[16px] leading-relaxed text-ink-soft">{children}</div>}
        {(action || secondary) && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {action}
            {secondary}
          </div>
        )}
      </div>
    </div>
  );
}
