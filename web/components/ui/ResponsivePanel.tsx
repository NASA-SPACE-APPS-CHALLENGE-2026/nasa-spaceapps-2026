'use client';

import { useRef, useState, useSyncExternalStore } from 'react';

export type Snap = 'peek' | 'half' | 'full';

const DESKTOP_QUERY = '(min-width: 1024px)';

/** Read synchronously on the client so phones never flash the desktop layout. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(DESKTOP_QUERY);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

/** Pixels of map hidden behind the bottom sheet at a given snap (0 on desktop). */
export function sheetInset(desktop: boolean, snap: Snap): number {
  if (desktop || typeof window === 'undefined') return 0;
  if (snap === 'peek') return 132;
  if (snap === 'half') return Math.round(window.innerHeight * 0.52);
  return 0; // full: the map is hidden anyway
}

const SNAP_HEIGHT: Record<Snap, string> = { peek: '132px', half: '52dvh', full: 'calc(100% - 8px)' };

/**
 * Desktop: a fixed-width side panel next to the map.
 * Phone: a bottom sheet over the map with three snap heights; drag or tap the handle.
 */
export function ResponsivePanel({ snap, onSnap, children, label }: { snap: Snap; onSnap: (s: Snap) => void; children: React.ReactNode; label: string }) {
  const desktop = useIsDesktop();
  const drag = useRef<{ y: number; h: number } | null>(null);
  const [dragH, setDragH] = useState<number | null>(null);
  const sheet = useRef<HTMLDivElement>(null);

  if (desktop) {
    return (
      <aside aria-label={label} className="relative z-[1001] h-full w-[420px] shrink-0 overflow-y-auto border-r border-line bg-paper">
        {children}
      </aside>
    );
  }

  const onDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, h: sheet.current?.getBoundingClientRect().height ?? 0 };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setDragH(Math.max(96, Math.min((sheet.current?.parentElement?.clientHeight ?? window.innerHeight) - 8, drag.current.h + (drag.current.y - e.clientY))));
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const moved = Math.abs(e.clientY - drag.current.y);
    const h = dragH ?? drag.current.h;
    drag.current = null;
    setDragH(null);
    if (moved < 6) {
      onSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek');
      return;
    }
    const vh = window.innerHeight;
    onSnap(h < vh * 0.3 ? 'peek' : h < vh * 0.7 ? 'half' : 'full');
  };

  return (
    <aside
      ref={sheet}
      aria-label={label}
      className="absolute inset-x-0 bottom-0 z-[1001] flex flex-col rounded-t-float border-t border-line bg-paper shadow-[0_-10px_30px_-12px_rgb(26_21_16/0.35)]"
      style={{ height: dragH !== null ? `${dragH}px` : SNAP_HEIGHT[snap], transition: dragH !== null ? 'none' : 'height 220ms ease' }}
    >
      <button
        type="button"
        aria-label={snap === 'full' ? 'Collapse panel' : 'Expand panel'}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        className="flex h-7 w-full shrink-0 touch-none items-center justify-center"
      >
        <span className="h-1.5 w-12 rounded-full bg-line-strong" />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </aside>
  );
}
