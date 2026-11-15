import type { Metadata } from 'next';
import { PlotScreen } from '@/components/landing/plot/PlotScreen';
import { site } from '@/content/site';
import { StoreProvider } from '@/lib/client/StoreProvider';

export const metadata: Metadata = { title: `${site.plot.title} · ${site.name}` };

export default function PlotPage() {
  return (
    <StoreProvider>
      <PlotScreen />
    </StoreProvider>
  );
}
