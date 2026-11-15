'use client';

import { useId, useState } from 'react';
import { DropZone, formatBytes } from './DropZone';

interface Props {
  title: string;
  description: string;
  accept: string[];
  acceptLabel: string;
  note?: React.ReactNode;
}

interface Received {
  name: string;
  size: number;
  at: string;
}

/**
 * Milestone 1: accepts files and lists them honestly as received but not processed.
 * Nothing is uploaded, parsed or analysed.
 */
export function StubImportCard({ title, description, accept, acceptLabel, note }: Props) {
  const [files, setFiles] = useState<Received[]>([]);
  const [error, setError] = useState<string | null>(null);
  const headingId = useId();
  return (
    // Five rows shared with the neighbouring card through CSS subgrid, so the drop box and the button line up across a row.
    <section className="row-span-5 grid grid-rows-subgrid gap-0 rounded-parcel border border-line bg-panel p-5 lg:p-6" aria-labelledby={headingId}>
      <div className="flex items-start justify-between gap-3">
        <h2 id={headingId} className="font-plate text-xl">
          {title}
        </h2>
        <span className="shrink-0 rounded-full border border-line bg-paper px-2.5 py-1 text-[12.5px] font-semibold text-ink-soft">Coming soon</span>
      </div>
      <div>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">{description}</p>
        {note && <div className="mt-2 text-[14px] leading-snug text-ink-soft">{note}</div>}
      </div>
      <div className="mt-4 flex">
        <DropZone
          className="flex-1"
          accept={accept}
          acceptLabel={acceptLabel}
          multiple
          onFiles={(fs) => {
            setError(null);
            setFiles((prev) => [...prev, ...fs.map((f) => ({ name: f.name, size: f.size, at: new Date().toISOString() }))]);
          }}
          onReject={setError}
        />
      </div>
      <div>
      {error && (
        <p className="mt-3 rounded-parcel bg-alert-tint px-3 py-2 text-[14.5px] text-[#7a2c1d]" role="alert">
          {error}
        </p>
      )}
      {files.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label={`${title} files`}>
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-parcel border border-line bg-paper px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{f.name}</p>
                <p className="text-[13.5px] text-ink-soft">{formatBytes(f.size)}. Received, not yet processed.</p>
              </div>
              <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="min-h-11 rounded-parcel px-2 text-[14px] font-semibold text-ink-soft hover:bg-panel" aria-label={`Remove ${f.name}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      </div>
      <div className="pt-4">
        <button type="button" disabled className="min-h-12 w-full cursor-not-allowed rounded-parcel border border-line bg-paper text-[15px] font-semibold text-ink-faint">
          Processing comes in a later milestone
        </button>
        <p className="mt-2 text-[13px] text-ink-faint">Files stay in this browser tab. They are not uploaded, read or analysed yet, and are cleared when you leave this page.</p>
      </div>
    </section>
  );
}
