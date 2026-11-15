import type { Metadata, Viewport } from 'next';
import { Archivo } from 'next/font/google';
import './globals.css';
import { GoogleTranslate } from '@/components/ui/GoogleTranslate';

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

/** Only the document shell. The app screens and the marketing site each bring their own layout (route groups). */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body>{children}<GoogleTranslate /></body>
    </html>
  );
}
