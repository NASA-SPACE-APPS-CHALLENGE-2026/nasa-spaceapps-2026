import type { Metadata, Viewport } from 'next';
import { Archivo } from 'next/font/google';
import { AppHeader } from '@/components/shell/AppHeader';
import { StoreProvider } from '@/lib/client/StoreProvider';
import './globals.css';

const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-archivo', display: 'swap' });

export const metadata: Metadata = {
  title: 'PlotTwist',
  description: 'Plan crop rotations for your fields with NASA and USDA data.',
  icons: { icon: '/fieldshift.svg' },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f6f9f7',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="flex h-dvh flex-col overflow-hidden">
        <StoreProvider>
          <AppHeader />
          <main className="relative min-h-0 flex-1">{children}</main>
        </StoreProvider>
      </body>
    </html>
  );
}
