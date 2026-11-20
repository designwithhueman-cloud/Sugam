// The landing page: a two-column hero with a one-off intro animation (no loops, so no pause control), who
// it is for and where a fix goes, why it matters, how it works, pricing, FAQ.
import { CtaArt, FaqArt } from './Art.tsx';
import { FreeTools } from './FreeTools.tsx';
import { QuoteBand } from './QuoteBand.tsx';
import { HeroArt } from './HeroArt.tsx';
import { ProblemVisual } from './ProblemVisual.tsx';
import { ScanBar } from './ScanBar.tsx';
import { Pillars } from './Pillars.tsx';
import { Platforms } from './Platforms.tsx';
import { HowItWorks } from './HowItWorks.tsx';
import { LandingFaq } from './Faq.tsx';
import { Who } from './Who.tsx';
import { Agencies } from './Agencies.tsx';
import { Plans, kicker, h2 } from './Sections.tsx';
import { SHOW_AGENCIES, SHOW_FAQ, SHOW_PERSON_NOTE, SHOW_TRY, SHOW_WHO } from './flags.ts';
import { FAQ, FAQ_ICONS, section } from './faq-data.tsx';

export function LandingPage() {
  return (
        <main id="main">
          {/* 1. The promise, and the first scan */}
          <section aria-labelledby="hero-h" className="px-5 pb-8 pt-10 sm:px-10 sm:pt-14 sm:pb-12 lg:pb-[6rem]">
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-10">
              <div>
                <h1 id="hero-h" className="text-[2.75rem] font-semibold leading-[1.06] tracking-[-0.035em] text-ink sm:text-6xl lg:text-[clamp(2.4rem,3.6vw,3.4rem)]"><span className="block lg:whitespace-nowrap">Build with AI.</span> <span className="block text-vio-deep lg:whitespace-nowrap">Launch with confidence.</span></h1>
                <p className="mt-6 text-xl leading-relaxed text-ink sm:text-2xl sm:leading-relaxed lg:text-[clamp(1rem,1.4vw,1.3rem)] lg:leading-[1.6] lg:max-w-[36rem] text-balance">Scan a page to see what could block real visitors before you launch. Get <span className="font-semibold text-vio-deep">plain-language fixes you can apply right away</span>.</p>
                <div className="mt-8"><ScanBar idPrefix="hero" align="start" extras={false} where="top of page" /></div>
              </div>
              <HeroArt />
            </div>
          </section>

          {/* The problem, said once and large, between the promise and the fix */}
          <section id="problem" aria-labelledby="problem-h" className="px-5 pb-24 sm:px-10 lg:pb-36">
            <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16">
              <div className="lg:order-2">
                <p className={kicker}>The problem</p>
                <h2 id="problem-h" className={`mt-4 text-balance ${h2}`}>AI can make a page look <span className="text-vio-deep">finished before it’s ready</span>.</h2>
                <p className="mt-5 max-w-xl text-xl leading-relaxed text-neutral-800">Launch without checking and the problems show up as lost visitors: people who can’t use it with a screen reader, a button out of reach on a phone, a pitch nobody understands. You hear about it after they’ve gone.</p>
              </div>
              <div className="lg:order-1"><ProblemVisual /></div>
            </div>
          </section>

          {/* How it works: scan, pins, fix: right after the problem */}
          <section id="how" aria-labelledby="how-h"><HowItWorks /></section>

          {/* What we check: the answer to the problem, one group of people at a time */}
          <section id="pillars" aria-labelledby="pillars-h" className={section}>
            <p className={kicker}>What we check</p>
            <h2 id="pillars-h" className={`mt-4 ${h2}`}>Where visitors <span className="text-vio-deep">get stuck</span> on your site</h2>
            <p className="mt-5 max-w-3xl text-xl leading-relaxed text-neutral-800">{SHOW_PERSON_NOTE ? 'Every scan covers accessibility, usability, mobile layout, clarity and trust, on desktop and at phone width, then writes the fix. It flags what still needs a person.' : 'Every scan covers accessibility, usability, mobile layout, clarity and trust, on desktop and at phone width, then writes the fix.'}</p>
            <div className="mt-10 lg:mt-12"><Pillars /></div>
          </section>

          {/* One real customer: it happened, and they fixed it themselves */}
          <QuoteBand />

          {/* Where a fix goes: the tools, after how it works: can I use this in my tool? */}
          <section id="works" aria-labelledby="platforms-h" className="pb-20 lg:pb-32"><Platforms /></section>

          {/* A reason to try it now, after the tools: paste a real page */}
          {SHOW_TRY && (
          <section id="try" aria-labelledby="try-h" className="px-3 pb-20 sm:px-8 lg:pb-32">
            <div className="grid items-center gap-8 rounded-[2.25rem] bg-[#e6f9b6] px-7 py-12 sm:px-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12 lg:py-14">
              <div>
                <h2 id="try-h" className="text-3xl font-semibold leading-[1.08] tracking-[-0.025em] text-ink sm:text-4xl">Check <span className="text-vio-deep">your own page</span> before launch</h2>
                <p className="mt-4 max-w-xl text-xl leading-relaxed text-ink">Paste your home page or sign-up page. You’ll get your score, the top issues and one fix to apply.</p>
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
            <div className="max-w-3xl"><p className={kicker}>Pricing</p><h2 id="pricing-h" className={`mt-4 ${h2}`}>Simple <span className="text-vio-deep">per-site</span> pricing</h2>
              <p className="mt-5 text-xl leading-relaxed text-neutral-800">Start with one page for free. Whole-site scanning and client workspaces are planned: join a waiting list to hear when they open.</p></div>
            <div className="mt-12 lg:mt-14"><Plans /></div>
          </section>

          {/* Free tools and guides */}
          <section id="tools" aria-labelledby="tools-h" className={section}>
            <p className={kicker}>Free tools</p>
            <h2 id="tools-h" className={`mt-4 ${h2}`}>Free tools for people <span className="text-vio-deep">building with AI</span></h2>
            <p className="mt-5 max-w-3xl text-xl leading-relaxed text-neutral-800">Use them without an account, whether or not you ever scan a page.</p>
            <div className="mt-12 lg:mt-14"><FreeTools /></div>
          </section>

          {/* 7. Questions */}
          {SHOW_FAQ && <LandingFaq items={FAQ} icons={FAQ_ICONS} art={<FaqArt className="w-full max-w-xs" />} title={<>Before you <span className="text-vio-deep">scan</span></>} lede="Short answers about what you get, what it checks and what happens next." />}

          {/* 8. Start */}
          <section aria-labelledby="cta-h" className="px-3 pb-20 sm:px-8 lg:pb-32">
            <div className="grid items-center gap-8 rounded-[2.25rem] bg-[#e6f9b6] px-7 py-14 sm:px-14 sm:py-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div>
                <h2 id="cta-h" className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.025em] text-ink sm:text-5xl">Build with AI. <span className="text-vio-deep">Launch with confidence.</span></h2>
                <p className="mt-5 max-w-2xl text-xl leading-relaxed text-ink">Paste a link. No account, no setup. See what could block your visitors, with your first fix included.</p>
                <div className="mt-8"><ScanBar idPrefix="end" align="start" extras={false} where="bottom of page" /></div>
              </div>
              <CtaArt className="mx-auto hidden w-full max-w-sm lg:block" />
            </div>
          </section>
        </main>
  );
}
