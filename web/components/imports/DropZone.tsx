'use client';

import { useId, useRef, useState } from 'react';

interface Props {
  accept: string[];
  acceptLabel: string;
  multiple?: boolean;
  busy?: boolean;
  disabled?: boolean;
  maxBytes?: number;
  onFiles: (files: File[]) => void;
  onReject?: (message: string) => void;
  testId?: string;
  className?: string;
}

function extOf(name: string) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Drag-and-drop file box with a real file input underneath (keyboard and screen-reader friendly). */
export function DropZone({ accept, acceptLabel, multiple, busy, disabled, maxBytes = 50 * 1024 * 1024, onFiles, onReject, testId, className = '' }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (list: FileList | null) => {
    if (!list || !list.length) return;
    const files = [...list];
    const bad = files.find((f) => !accept.includes(extOf(f.name)));
    if (bad) {
      onReject?.(`"${bad.name}" is not an accepted file type. This box takes ${acceptLabel}.`);
      return;
    }
    const big = files.find((f) => f.size > maxBytes);
    if (big) {
      onReject?.(`"${big.name}" is ${formatBytes(big.size)}. The limit is ${formatBytes(maxBytes)}.`);
      return;
    }
    if (files.some((f) => f.size === 0)) {
      onReject?.('That file is empty.');
      return;
    }
    onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled && !busy) take(e.dataTransfer.files);
      }}
      className={`relative flex min-h-[220px] flex-col items-center justify-center rounded-parcel border-2 border-dashed px-4 py-6 text-center transition-colors ${className} ${
        over ? 'border-field bg-field-tint' : 'border-line-strong bg-paper'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <svg viewBox="0 0 48 48" className="h-10 w-10 text-field" aria-hidden>
        <path d="M24 31V11m0 0-8 8m8-8 8 8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 30v6a3 3 0 0 0 3 3h24a3 3 0 0 0 3-3v-6" fill="none" stroke="#2f6b3a" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <p className="mt-2 text-[15.5px] font-semibold">{busy ? 'Reading file…' : over ? 'Drop to add' : 'Drag a file here'}</p>
      <p className="text-[14px] text-ink-soft">or</p>
      <label
        htmlFor={id}
        className={`mt-1 inline-flex min-h-12 cursor-pointer items-center rounded-parcel border border-line-strong bg-panel px-4 text-[15px] font-semibold text-field hover:border-field ${busy || disabled ? 'pointer-events-none' : ''}`}
      >
        Choose file{multiple ? 's' : ''}
      </label>
      <input
        ref={input}
        id={id}
        type="file"
        data-testid={testId}
        accept={accept.join(',')}
        multiple={multiple}
        disabled={disabled || busy}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
        className="sr-only"
      />
      <p className="mt-3 max-w-[40ch] text-[13.5px] text-ink-faint">Accepts {acceptLabel}</p>
    </div>
  );
}
