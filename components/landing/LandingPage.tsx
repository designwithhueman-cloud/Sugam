// The landing page: a two-column hero with a one-off intro animation (no loops, so no pause control), who
// it is for and where a fix goes, why it matters, how it works, pricing, FAQ.
import { CtaArt, FaqArt } from './Art.tsx';
import { FreeTools } from './FreeTools.tsx';
import { ExampleScan } from './ExampleScan.tsx';
import { ProblemVisual } from './ProblemVisual.tsx';
import { ScanBar } from './ScanBar.tsx';
import { Pillars } from './Pillars.tsx';
import { Platforms } from './Platforms.tsx';
import { HowItWorks } from './HowItWorks.tsx';
import { LandingFaq } from './Faq.tsx';
import { Who } from './Who.tsx';
import { Agencies } from './Agencies.tsx';
import { Plans, kicker, h2 } from './Sections.tsx';
import { SHOW_AGENCIES, SHOW_FAQ, SHOW_PERSON_NOTE, SHOW_TOOLS, SHOW_TRY, SHOW_WHO } from './flags.ts';
import { FAQ, FAQ_ICONS, section } from './faq-data.tsx';

export function LandingPage() {
  return (
        <main id="main">
          {/* 1. The promise, and the first scan */}
          <section aria-labelledby="hero-h" className="px-5 pb-20 pt-10 sm:px-10 sm:pt-14 sm:pb-24 lg:pb-32">
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-10">
              <div>
                <h1 id="hero-h" className="text-[2.75rem] font-semibold leading-[1.06] tracking-[-0.035em] text-ink sm:text-6xl lg:text-[clamp(2.4rem,3.6vw,3.4rem)]"><span className="block lg:whitespace-nowrap">See what to fix</span> <span className="block text-vio-deep lg:whitespace-nowrap">before you launch.</span></h1>
                <p className="mt-6 text-xl leading-relaxed text-ink sm:text-2xl sm:leading-relaxed lg:text-[clamp(1rem,1.4vw,1.3rem)] lg:leading-[1.6] lg:max-w-[38rem] text-balance">Scan your page on desktop and phone. Get <span className="font-semibold text-vio-deep">a fix you can paste into your AI builder</span>, then rescan to check it.</p>
                <div className="mt-8"><ScanBar idPrefix="hero" align="start" extras={false} where="top of page" /></div>
              </div>
              <ExampleScan />
            </div>
          </section>

          {/* What we check: four questions a visitor's experience depends on */}
          <section id="pillars" aria-labelledby="pillars-h" className="scroll-mt-6 px-5 pb-20 sm:px-10 lg:pb-36">
            <p className={kicker}>What we check</p>
            <h2 id="pillars-h" className={`mt-4 ${h2}`}>What else could <span className="text-vio-deep">get in their way</span>?</h2>
            <p className="mt-5 max-w-3xl text-xl leading-relaxed text-neutral-800">A covered button is one problem. Every scan checks all four, on desktop and phone.</p>
            <div className="mt-10 lg:mt-12"><Pillars /></div>
          </section>

          {/* Why it matters: the cost nobody tells you about, after what could get in the way */}
          <section id="problem" aria-labelledby="problem-h" className="px-5 pb-24 sm:px-10 lg:pb-36">
            <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16">
              <div className="lg:order-2">
                <p className={kicker}>Why it matters</p>
                <h2 id="problem-h" className={`mt-4 text-balance ${h2}`}>Visitors don’t report problems. <span className="text-vio-deep">They leave.</span></h2>
                <p className="mt-5 max-w-xl text-xl leading-relaxed text-neutral-800">Nobody emails you to say the button was hidden on their phone, the screen reader said only “button”, or the headline didn’t say what you sell. They close the tab. You find out later, from sign-ups that never came.</p>
              </div>
              <div className="lg:order-1"><ProblemVisual /></div>
            </div>
          </section>

          {/* How it works: scan, pins, fix: right after the problem */}
          <section id="how" aria-labelledby="how-h"><HowItWorks /></section>

          {/* Where a fix goes: the tools, after how it works: can I use this in my tool? */}
          <section id="works" aria-labelledby="platforms-h" className="pb-20 lg:pb-32"><Platforms /></section>

          {/* A reason to try it now, after the tools: paste a real page */}
          {SHOW_TRY && (
          <section id="try" aria-labelledby="try-h" className="px-3 pb-20 sm:px-8 lg:pb-32">
            <div className="grid items-center gap-8 rounded-[2.25rem] bg-[#e6f9b6] px-7 py-12 sm:px-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12 lg:py-14">
              <div>
                <h2 id="try-h" className="text-3xl font-semibold leading-[1.08] tracking-[-0.025em] text-ink sm:text-4xl">Check <span className="text-vio-deep">your own page</span> before launch</h2>
                <p className="mt-4 max-w-xl text-xl leading-relaxed text-ink">Paste your home page or sign-up page. You’ll see how many issues we found, the top ones and one fix to apply.</p>
              </div>
              <ScanBar idPrefix="mid" align="start" extras={false} terms={false} where="middle of page" />
            </div>
          </section>
          )}

          {SHOW_WHO && (
          <section id="who" aria-labelledby="who-h" className={section}>
            <p className={kicker}>Who it’s for</p>
            <h2 id="who-h" className={`mt-4 ${h2} lg:whitespace-nowrap lg:text-[clamp(1.75rem,3.35vw,3rem)]`}>Made for people who build with AI, <span className="text-vio-deep">not just code</span>.</h2>
            <div className="mt-12 lg:mt-14"><Who /></div>
          </section>
          )}

          {/* For agencies */}
          {SHOW_AGENCIES && <section id="agencies" aria-labelledby="agencies-h" className={section}><Agencies /></section>}

          {/* 6. What it costs */}
          <section id="pricing" aria-labelledby="pricing-h" className={section}>
            <div className="max-w-3xl"><p className={kicker}>Pricing</p><h2 id="pricing-h" className={`mt-4 ${h2}`}>Start with the page you’ll <span className="text-vio-deep">share first</span></h2>
              <p className="mt-5 text-xl leading-relaxed text-neutral-800">Start with one page for free. Whole-site scanning and client workspaces are planned: join a waiting list to hear when they open.</p></div>
            <div className="mt-12 lg:mt-14"><Plans /></div>
          </section>

          {/* Free tools and guides */}
          {SHOW_TOOLS && (
          <section id="tools" aria-labelledby="tools-h" className={section}>
            <p className={kicker}>Free tools</p>
            <h2 id="tools-h" className={`mt-4 ${h2}`}>Free tools for people <span className="text-vio-deep">building with AI</span></h2>
            <p className="mt-5 max-w-3xl text-xl leading-relaxed text-neutral-800">Use them without an account, whether or not you ever scan a page.</p>
            <div className="mt-12 lg:mt-14"><FreeTools /></div>
          </section>
          )}

          {/* 7. Questions */}
          {SHOW_FAQ && <LandingFaq items={FAQ} icons={FAQ_ICONS} art={<FaqArt className="w-full max-w-xs" />} title={<>Before you <span className="text-vio-deep">scan</span></>} lede="Short answers about what you get, what it checks and what happens next." />}

          {/* 8. Start */}
          <section aria-labelledby="cta-h" className="px-3 pb-20 sm:px-8 lg:pb-32">
            <div className="grid items-center gap-8 rounded-[2.25rem] bg-[#e6f9b6] px-7 py-14 sm:px-14 sm:py-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div>
                <h2 id="cta-h" className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.025em] text-ink sm:text-5xl">Ready to send that link? <span className="text-vio-deep">Find the snags first.</span></h2>
                <p className="mt-5 max-w-2xl text-xl leading-relaxed text-ink">Paste a link. No account, no setup. See what could block your visitors, with your first fix included.</p>
                <div className="mt-8"><ScanBar idPrefix="end" align="start" extras={false} where="bottom of page" /></div>
              </div>
              <CtaArt className="mx-auto hidden w-full max-w-sm lg:block" />
            </div>
          </section>
        </main>
  );
}
