// The landing page.
import { Shell } from '@/components/landing/Shell.tsx';
import { LandingPage } from '@/components/landing/LandingPage.tsx';

export const metadata = { title: 'Sugam | Find the accessibility barriers on your website', description: 'Check a public webpage for accessibility issues, see who an issue could affect, and get a fix you can apply in your AI builder, visual editor, or codebase.' };

export default function Home() { return <Shell><LandingPage /></Shell>; }
