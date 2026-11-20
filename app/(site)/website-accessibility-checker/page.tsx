import Link from 'next/link';
import { Link2, FileSearch, Wrench, Scale, Landmark, Globe2, Leaf } from 'lucide-react';
import { ScanBar } from '@/components/landing/ScanBar.tsx';
import { LandingFaq } from '@/components/landing/Faq.tsx';
import { kicker, h2 } from '@/components/landing/Sections.tsx';

export const metadata = { title: 'Free Website Accessibility Checker | Sugam', description: 'Check any public page against WCAG 2.2 AA, ADA Title II, EN 301 549 or AODA. See what is wrong and get a fix you can paste into your builder.' };

const STANDARDS = [
  { icon: Globe2, title: 'WCAG 2.2 Level AA', text: 'The current W3C standard and Sugam’s default target. It adds criteria such as Focus Not Obscured and Target Size. Parsing (4.1.1) is retired in 2.2 and is never reported.' },
  { icon: Landmark, title: 'ADA Title II', text: 'US state and local government websites must meet WCAG 2.1 Level AA under the Title II rule. Sugam checks the 2.1 AA set when you pick this target.' },
  { icon: Scale, title: 'European Accessibility Act (EN 301 549)', text: 'The EAA applies to many products and services sold in the EU. EN 301 549 maps web content to WCAG 2.1 Level AA.' },
  { icon: Leaf, title: 'Ontario AODA', text: 'Covered Ontario organisations follow WCAG 2.0 Level AA, excluding live captions and pre-recorded audio description. Sugam leaves out newer criteria for this target.' },
];
const STEPS = [
  [Link2, 'Enter your URL', 'One public page. Pick the standard you need to meet under Scan settings.'],
  [FileSearch, 'Get your result', 'Your score, severity counts, top issues and one fully unlocked fix straight away. A free account lists every issue type; a paid plan pins each one on screenshots.'],
  [Wrench, 'Fix and rescan', 'Copy the repair for your builder or code, then rescan to confirm it worked.'],
] as const;
const FAQ: [string, string][] = [
  ['What does the free checker test?', 'One public page, loaded in a real browser at desktop and 320px mobile width. It runs axe-core rules for your chosen standard, Sugam’s checks for patterns common in AI-built sites, and a 25-step keyboard trace.'],
  ['Will a clean scan make my site compliant?', 'No tool can promise that. Automated checks find a share of accessibility barriers, and real screen-reader testing is still needed. Sugam never claims legal compliance.'],
  ['Do I need to install anything?', 'No. There is no script, plugin or integration. Paste the address and scan.'],
];
const section = 'px-5 pb-16 sm:px-10 lg:pb-24';

export default async function Checker({ searchParams }: { searchParams: Promise<{ standard?: string }> }) {
  const { standard } = await searchParams;
  return (
    <main id="main">
      <section aria-labelledby="chk-h" className="px-5 pb-14 pt-12 text-center sm:px-10 sm:pt-16 lg:pb-20">
        <p className={kicker}>Free website accessibility checker</p>
        <h1 id="chk-h" className="mx-auto mt-5 max-w-4xl text-4xl font-semibold leading-[1.04] tracking-[-0.03em] text-ink sm:text-6xl">Uncover the accessibility issues on <span className="text-vio-deep">your website</span></h1>
        <p className="mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-neutral-800">Check a page against WCAG 2.2, ADA Title II, EN 301 549 or AODA, and get a fix you can paste.</p>
        <div className="mt-10"><ScanBar idPrefix="hero" sampleHref="/#repair" sampleLabel="See a repair" where="top of page" defaultStandard={standard} autoFocus={!!standard} /></div>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-neutral-700">Built on axe-core, the open-source engine used by many accessibility tools. We scan one public page and add nothing to your site. <Link href="/privacy" className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4">How we handle your data</Link></p>
      </section>

      <section id="standards" aria-labelledby="std-h" className={`${section} scroll-mt-6`}>
        <h2 id="std-h" className={h2}>Check against the standard that <span className="text-vio-deep">applies to you</span></h2>
        <ul className="mt-10 grid gap-5 sm:grid-cols-2">
          {STANDARDS.map((c) => <li key={c.title} className="rounded-[1.75rem] border border-black/10 bg-white p-7"><span className="grid size-12 place-items-center rounded-full bg-[#d9f56e] text-ink"><c.icon aria-hidden className="size-6" /></span><h3 className="mt-5 text-2xl font-semibold tracking-tight text-ink">{c.title}</h3><p className="mt-2 text-lg leading-relaxed text-neutral-800">{c.text}</p></li>)}
        </ul>
        <p className="mt-5 text-base text-neutral-700">Summaries for orientation only, not legal advice. Check the rules that apply to your organisation.</p>
      </section>

      <section aria-labelledby="hiw-h" className={section}>
        <h2 id="hiw-h" className={h2}>How it <span className="text-vio-deep">works</span></h2>
        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {STEPS.map(([Icon, t, d], i) => <li key={t} className="rounded-[1.75rem] border border-black/10 bg-white p-7"><span className="grid size-12 place-items-center rounded-full bg-[#d9f56e] text-ink"><Icon aria-hidden className="size-6" /></span><h3 className="mt-5 text-2xl font-semibold tracking-tight text-ink"><span className="tabular-nums">{i + 1}.</span> {t}</h3><p className="mt-2 text-lg leading-relaxed text-neutral-800">{d}</p></li>)}
        </ol>
      </section>

      <LandingFaq items={FAQ} />

      <section aria-labelledby="chk-cta-h" className="px-3 pb-6 sm:px-8 lg:pb-10">
        <div className="rounded-[2.25rem] bg-[#e6f9b6] px-5 py-14 text-center sm:px-14">
          <h2 id="chk-cta-h" className="mx-auto max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.025em] text-ink sm:text-5xl">How accessible is <span className="text-vio-deep">your site</span>?</h2>
          <div className="mt-8"><ScanBar idPrefix="end" sampleLabel="See a repair" sampleHref="/#repair" where="bottom of page" /></div>
        </div>
      </section>
    </main>
  );
}
