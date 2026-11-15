import { AppHeader, BottomNav } from '@/components/shell/AppHeader';
import { StoreProvider } from '@/lib/client/StoreProvider';

/** The planning app: fixed-height shell; each screen scrolls inside <main>. Phones get a bottom tab bar. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <StoreProvider>
        <AppHeader />
        <main className="relative min-h-0 flex-1">{children}</main>
        <BottomNav />
      </StoreProvider>
    </div>
  );
}
