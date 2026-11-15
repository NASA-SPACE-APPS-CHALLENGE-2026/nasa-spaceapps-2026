import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, JetBrains_Mono } from 'next/font/google';
import { site } from '@/content/site';

const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: site.meta.title,
  description: site.meta.description,
};

export const viewport: Viewport = { themeColor: '#1a1510' };

/** Marketing pages: native page scroll, their own type and palette. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${bricolage.variable} ${jetbrains.variable} site min-h-dvh bg-soil font-grotesk text-chalk`}>{children}</div>
  );
}
