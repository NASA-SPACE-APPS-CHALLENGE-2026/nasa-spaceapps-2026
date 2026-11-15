import { AppHeader } from '@/components/shell/AppHeader';
import { StoreProvider } from '@/lib/client/StoreProvider';

/** The planning app: fixed-height shell with the tab header; each screen scrolls inside <main>. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <StoreProvider>
        <AppHeader />
        <main className="relative min-h-0 flex-1">{children}</main>
      </StoreProvider>
    </div>
  );
}
