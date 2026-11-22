// The free checker page. Built around one decision ("is it worth pasting my URL?"): the scan box and a live example first, the facts that make it
// trustworthy, then what a scan checks (one question at a time, from the rule library), how results are labelled, the standards, the steps, the FAQ.
import Link from 'next/link';
import { Link2, Zap, Wrench, Scale, Landmark, Globe2, Leaf, CheckCircle2, Eye, CircleSlash, Monitor, Smartphone, Gift, ShieldCheck } from 'lucide-react';
import { ScanBar } from '@/components/landing/ScanBar.tsx';
import { LandingFaq } from '@/components/landing/Faq.tsx';
import { kicker, h2 } from '@/components/landing/Sections.tsx';
import { ExampleScan } from '@/components/landing/ExampleScan.tsx';
import { CheckExplorer } from '@/components/landing/CheckExplorer.tsx';
import { checkCatalog } from '@/lib/check-catalog.ts';

export const metadata = { title: 'Free Website Accessibility Checker | Avara', description: 'Check any public page against WCAG 2.2 AA, ADA Title II, EN 301 549 or AODA, plus clarity, mobile, speed and design. See what is wrong and get a fix you can paste into your builder.' };

const STANDARDS = [
  { icon: Globe2, title: 'WCAG 2.2 Level AA', tag: 'Default', text: 'The current W3C standard. Adds Focus Not Obscured and Target Size. Parsing (4.1.1) is retired in 2.2 and never reported.' },
  { icon: Landmark, title: 'ADA Title II', tag: 'US public sector', text: 'State and local government sites must meet WCAG 2.1 AA. Avara checks the 2.1 AA set for this target.' },
  { icon: Scale, title: 'EN 301 549 (EAA)', tag: 'European Union', text: 'The European Accessibility Act covers many products and services sold in the EU, mapped to WCAG 2.1 AA.' },
  { icon: Leaf, title: 'Ontario AODA', tag: 'Ontario, Canada', text: 'Covered organisations follow WCAG 2.0 AA without live captions or pre-recorded audio description.' },
];
const STEPS = [
  { icon: Link2, when: 'Now', title: 'Paste your URL', text: 'One public page. Pick a standard under Scan settings if you need one other than WCAG 2.2 AA.' },
  { icon: Zap, when: 'In seconds', title: 'See what blocks visitors first', text: 'A main button covered on a phone shows up while the scan runs. The full report follows with severity, where it is and one fix unlocked.' },
  { icon: Wrench, when: 'When you are ready', title: 'Fix and rescan', text: 'Paste the fix into Lovable, Bolt, v0, Cursor, Framer or Webflow, then rescan. The report says Fixed only when the new scan proves it.' },
];
const LABELS = [
  { icon: CheckCircle2, tone: 'bg-[#fde7e1] text-[#9e2a12]', title: 'Confirmed', text: 'Measured in a real browser, with the element and the evidence. These are the fixes to make.' },
  { icon: Eye, tone: 'bg-[#efe9ff] text-vio-deep', title: 'Worth a look', text: 'Judged by AI or a heuristic. A person decides; it is never counted as a confirmed failure.' },
  { icon: CircleSlash, tone: 'bg-[#f4f2ec] text-neutral-800', title: 'Didn’t run', text: 'Listed with the reason and what would let it run, so a quiet result is never mistaken for a clean one.' },
];
const FAQ: [string, string][] = [
  ['What does the free checker test?', 'One public page, loaded in a real browser at desktop and 320px mobile width. It runs axe-core rules for your chosen standard, Avara’s checks for clarity, trust, mobile, speed and design, and a 25-step keyboard trace.'],
  ['Will a clean scan make my site compliant?', 'No tool can promise that. Automated checks find a share of accessibility barriers, and real screen-reader testing is still needed. Avara never claims legal compliance.'],
  ['Do I need to install anything?', 'No. There is no script, plugin or integration. Paste the address and scan.'],
  ['Why do some checks say “worth a look” or “didn’t run”?', 'Some questions need judgement (is the offer clear?) and some need a person (does it work with a screen reader?). Avara labels those honestly instead of guessing, and says what would let each one run.'],
];
const section = 'px-5 pb-20 sm:px-10 lg:pb-28';

export default async function Checker({ searchParams }: { searchParams: Promise<{ standard?: string }> }) {
  const { standard } = await searchParams;
  const catalog = checkCatalog();
  const FACTS = [
    { icon: ShieldCheck, big: `${catalog.total}`, small: `checks across ${catalog.areas} areas, ${catalog.measured} measured in a real browser` },
    { icon: Monitor, big: '2 screens', small: 'Desktop at 1280px and a phone at 320px, on every scan' },
    { icon: Smartphone, big: 'Seconds', small: 'A main button covered on a phone shows up while the scan is still running' },
    { icon: Gift, big: '1 fix free', small: 'Ready to paste into your builder, no account needed' },
  ];
  return (
    <main id="main">
      {/* 1. Hero: the scan box, and a real example of what comes back */}
      <section aria-labelledby="chk-h" className="px-5 pb-16 pt-10 sm:px-10 sm:pt-14 lg:pb-24">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div>
            <p className={kicker}>Free website accessibility checker</p>
            <h1 id="chk-h" className="mt-5 text-balance text-4xl font-semibold leading-[1.04] tracking-[-0.03em] text-ink sm:text-6xl">Uncover the accessibility issues on <span className="text-vio-deep">your website</span></h1>
            <p className="mt-5 max-w-xl text-xl leading-relaxed text-neutral-800">And everything else that stops a visitor: an unclear offer, a covered button on a phone, a slow first screen. Each one comes with a fix you can paste.</p>
            <div className="mt-8"><ScanBar idPrefix="hero" align="start" sampleHref="/#repair" sampleLabel="See a repair" where="top of page" defaultStandard={standard} autoFocus={!!standard} /></div>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-neutral-700">Built on axe-core, the open-source engine used by many accessibility tools. We scan one public page and add nothing to your site. <Link href="/privacy" className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4">How we handle your data</Link></p>
          </div>
          <div className="lg:pl-4"><ExampleScan /></div>
        </div>
      </section>

      {/* 2. The facts, scannable in two seconds */}
      <section aria-label="At a glance" className="px-5 pb-20 sm:px-10 lg:pb-28">
        <ul className="grid gap-3 rounded-[2rem] bg-ink p-3 text-white sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map((f) => (
            <li key={f.big} className="rounded-[1.5rem] bg-white/[0.06] p-5">
              <f.icon aria-hidden className="size-6 text-[#d9f56e]" />
              <p className="mt-4 text-3xl font-semibold tracking-tight">{f.big}</p>
              <p className="mt-1 text-base leading-snug text-neutral-300">{f.small}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* 3. What every scan checks, one question at a time */}
      <section id="what-we-check" aria-labelledby="wwc-h" className={`${section} scroll-mt-6`}>
        <div className="max-w-3xl">
          <p className={kicker}>What we check</p>
          <h2 id="wwc-h" className={`mt-4 ${h2}`}>Four questions <span className="text-vio-deep">every scan answers</span></h2>
          <p className="mt-5 text-xl leading-relaxed text-neutral-800">Accessibility is one of {catalog.areas} areas. Pick a question to see what is included and how each check is answered.</p>
        </div>
        <div className="mt-10"><CheckExplorer catalog={catalog} /></div>
      </section>

      {/* 4. How results are labelled: the honesty that sets Avara apart */}
      <section aria-labelledby="lbl-h" className={section}>
        <div className="max-w-3xl">
          <p className={kicker}>Reading your report</p>
          <h2 id="lbl-h" className={`mt-4 ${h2}`}>Every result says <span className="text-vio-deep">how sure it is</span></h2>
        </div>
        <ul className="mt-10 grid gap-5 md:grid-cols-3">
          {LABELS.map((l) => (
            <li key={l.title} className="rounded-[1.75rem] border border-black/10 bg-white p-7">
              <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-base font-semibold ${l.tone}`}><l.icon aria-hidden className="size-5" />{l.title}</span>
              <p className="mt-4 text-lg leading-relaxed text-neutral-800">{l.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* 5. Standards, compact */}
      <section id="standards" aria-labelledby="std-h" className={`${section} scroll-mt-6`}>
        <div className="max-w-3xl">
          <p className={kicker}>Standards</p>
          <h2 id="std-h" className={`mt-4 ${h2}`}>Check against the standard that <span className="text-vio-deep">applies to you</span></h2>
        </div>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {STANDARDS.map((c) => (
            <li key={c.title} className="flex flex-col rounded-[1.75rem] border border-black/10 bg-white p-6">
              <div className="flex items-center justify-between gap-3"><span className="grid size-11 place-items-center rounded-full bg-[#d9f56e] text-ink"><c.icon aria-hidden className="size-5" /></span><span className="rounded-full bg-[#f4f2ec] px-2.5 py-0.5 text-sm font-semibold text-neutral-700">{c.tag}</span></div>
              <h3 className="mt-4 text-xl font-semibold text-ink">{c.title}</h3>
              <p className="mt-2 text-base leading-relaxed text-neutral-800">{c.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-base text-neutral-700">Summaries for orientation only, not legal advice. Pick your target under Scan settings; check the rules that apply to your organisation.</p>
      </section>

      {/* 6. How it works, as a timeline */}
      <section aria-labelledby="hiw-h" className={section}>
        <div className="max-w-3xl">
          <p className={kicker}>How it works</p>
          <h2 id="hiw-h" className={`mt-4 ${h2}`}>From URL to fix in <span className="text-vio-deep">three steps</span></h2>
        </div>
        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-[1.75rem] border border-black/10 bg-white p-6">
              <span className="relative grid size-12 place-items-center rounded-full bg-ink text-white"><s.icon aria-hidden className="size-6" /><span className="sr-only">Step {i + 1}</span></span>
              <p className="mt-5 text-sm font-semibold uppercase tracking-[0.12em] text-vio-deep">{s.when}</p>
              <h3 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{s.title}</h3>
              <p className="mt-2 text-lg leading-relaxed text-neutral-800">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <LandingFaq items={FAQ} />

      <section aria-labelledby="chk-cta-h" className="px-3 pb-6 sm:px-8 lg:pb-10">
        <div className="rounded-[2.25rem] bg-[#e6f9b6] px-5 py-14 text-center sm:px-14">
          <h2 id="chk-cta-h" className="mx-auto max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.025em] text-ink sm:text-5xl">How ready is <span className="text-vio-deep">your page</span>?</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-neutral-800">One page, both screens, about a minute. The first fix is free.</p>
          <div className="mt-8"><ScanBar idPrefix="end" sampleLabel="See a repair" sampleHref="/#repair" where="bottom of page" /></div>
        </div>
      </section>
    </main>
  );
}
