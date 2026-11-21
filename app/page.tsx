// The landing page.
import { Shell } from '@/components/landing/Shell.tsx';
import { LandingPage } from '@/components/landing/LandingPage.tsx';

const title = 'Avara | See what to fix before you launch';
const description = 'Scan your page on desktop and phone. Get a fix you can paste into Lovable, Bolt, v0 or Framer, then rescan to check it.';
export const metadata = { title, description, openGraph: { title, description }, twitter: { title, description } };

export default function Home() { return <Shell><LandingPage /></Shell>; }
