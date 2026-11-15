import type { HTMLAttributes, ReactNode } from 'react';
import { PANEL } from './styles';

/** A raised parcel. Use for the few things that deserve a surface; separate everything else with whitespace and <Divider>. */
export function Panel({ className = '', padded = true, ...rest }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return <div {...rest} className={`${PANEL} ${padded ? 'p-4 lg:p-6' : ''} ${className}`} />;
}

/** Thin field-edge rule. */
export function Divider({ className = '' }: { className?: string }) {
  return <hr className={`border-0 border-t border-line ${className}`} />;
}

/**
 * A page section: heading row (title, optional controls and badge), then content, separated from the next
 * section by a field-edge rule rather than a box.
 */
export function Section({ id, title, aside, children, className = '', testId }: { id: string; title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section aria-labelledby={`${id}-h`} className={`border-t border-line pt-6 ${className}`} data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id={`${id}-h`} className="font-plate text-h2">
          {title}
        </h2>
        {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
