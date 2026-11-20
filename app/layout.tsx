import type { Metadata } from 'next';
import { Instrument_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

// Self-hosted at build time by next/font (no requests to Google from visitors' browsers).
const display = Instrument_Sans({ subsets: ['latin'], style: ['normal', 'italic'], weight: ['400', '500', '600', '700'], variable: '--font-instrument', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex', display: 'swap' });

export const metadata: Metadata = { title: 'Sugam | AI accessibility review for modern websites', description: 'Find, see and fix accessibility issues on sites built with Lovable, Bolt.new, v0, Framer, Webflow and more.' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-white">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}
