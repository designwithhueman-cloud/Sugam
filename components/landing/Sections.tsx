// Server-rendered sections: how it works, audiences, pricing, footer. Spacing is generous on
// purpose: large gaps between sections and between the elements inside them.
import Link from 'next/link';
import { Check, CircleCheck, ArrowRight, Building2, Crown, Info, ListChecks, RefreshCw, Rocket, Wrench, Zap } from 'lucide-react';
import { PLANS } from '@/lib/plans.ts';
import { Wordmark } from './Header.tsx';
import { NAV, type NavLinks } from './nav.ts';
import { SHOW_FAQ, SHOW_TOOLS } from './flags.ts';

export const kicker = 'text-sm font-semibold uppercase tracking-[0.14em] text-vio-deep';
export const h2 = 'text-4xl font-semibold leading-[1.05] tracking-[-0.025em] text-ink sm:text-5xl';

const CTA = { free: ['Scan my page free', '/website-accessibility-checker', ''], site: ['Join the waiting list', '/upgrade?plan=site', ''], agency: ['Join the waiting list', '/upgrade?plan=agency', ''] } as const;

export function Plans() {
  return (
    <div>
      <ul className="grid gap-6 lg:grid-cols-3 lg:gap-8">
        {PLANS.map((p) => {
          const free = p.id === 'free';
          return (
            <li key={p.id} className={`flex flex-col rounded-[2rem] border p-8 ${free ? 'border-[#cfe98a] bg-[#f3fbd9]' : 'border-black/10 bg-white'}`}>
              <p className={`mb-4 inline-flex self-start rounded-lg px-3 py-1 text-sm font-semibold ${free ? 'bg-[#d9f56e] text-ink' : 'bg-[#f1f0ec] text-ink'}`}>{free ? 'Available now' : 'Coming soon'}</p>
              <h3 className="flex items-center gap-3 text-2xl font-semibold tracking-tight text-ink"><span aria-hidden className={`grid size-11 shrink-0 place-items-center rounded-full ${free ? 'bg-[#d9f56e]' : p.id === 'site' ? 'bg-[#d9f56e]' : 'bg-ink text-[#d9f56e]'}`}>{free ? <Zap className="size-5" /> : p.id === 'site' ? <Rocket className="size-5" /> : <Building2 className="size-5" />}</span>{p.name}</h3>
              <p className="mt-5"><span className="text-5xl font-semibold tracking-tight text-ink">{p.price}</span> <span className="text-lg text-neutral-700">{p.period}</span></p>
              <p className="mt-3 text-lg font-medium text-ink">{p.summary}</p>

              {free ? (
                /* Free: the route from the first fix to the next one, as a short ladder */
                <div className="mt-6 flex-1">
                  <p className="text-xl font-semibold text-ink">Fix one issue at a time.</p>
                  <ol aria-label="How the free plan works" className="mt-5">
                    {[[ListChecks, 'Start with the top issue on your page.', 'bg-white'], [Wrench, 'Apply the fix and scan again.', 'bg-[#e6dcff]'], [CircleCheck, 'Once it\u2019s resolved, get the next fix.', 'bg-[#d9f56e]']].map(([I, t, bg], k, all) => {
                      const Icon = I as typeof Wrench;
                      return (
                        <li key={t as string} className={`relative pl-16 ${k < all.length - 1 ? 'min-h-[4.75rem]' : ''}`}>
                          <span aria-hidden className={`absolute left-0 top-0 grid size-11 place-items-center rounded-full text-ink ring-1 ring-black/10 ${bg as string}`}><Icon className="size-5" /></span>
                          {k < all.length - 1 && <span aria-hidden className="absolute bottom-0 left-[1.35rem] top-12 w-px border-l-2 border-dashed border-[#9fcf3a]" />}
                          <span className="block pt-2 text-lg font-medium leading-snug text-ink">{t as string}</span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ) : (
                <>
                  <p className="mt-6 inline-flex items-center gap-2 self-start rounded-lg bg-[#d9f56e] px-3.5 py-1.5 text-base font-semibold text-ink"><Crown aria-hidden className="size-4" />Paid plan</p>
                  <ul className="mt-4 flex-1 space-y-3.5">{(p.id === 'site' ? ['Planned: whole-site scanning. Scan your public pages together.', 'Planned: see where issues appear across your public pages in one report.', 'After your next release, rescan the page to see what changed.'] : p.features).map((f) => <li key={f} className="flex gap-3 text-lg leading-snug text-neutral-800"><Check aria-hidden className="mt-1 size-5 shrink-0 text-[#2d6a00]" />{f}</li>)}</ul>
                </>
              )}
              <Link href={CTA[p.id][1]} aria-describedby={CTA[p.id][2] ? `cta-note-${p.id}` : undefined} className={`mt-8 inline-flex min-h-14 items-center justify-center gap-2 rounded-xl px-6 text-lg font-semibold ${p.id === 'free' ? 'border border-ink text-ink hover:bg-black/5' : 'bg-ink text-white hover:bg-neutral-800'}`}>{CTA[p.id][0]}{p.id !== 'free' && <span className="sr-only"> for {p.name}</span>}<ArrowRight aria-hidden className="size-5" /></Link>
              {CTA[p.id][2] ? <p id={`cta-note-${p.id}`} className="mt-3 text-base leading-snug text-neutral-700">{CTA[p.id][2]}</p> : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-8 flex items-start gap-2.5 text-lg leading-relaxed text-neutral-800"><RefreshCw aria-hidden className="mt-1.5 size-4 shrink-0 text-vio-deep" /><span><b className="text-ink">Why Creator is monthly:</b> {PLANS.find((x) => x.id === 'site')?.ongoing}</span></p>
    </div>
  );
}

export function LandingFooter({ nav = NAV }: { nav?: NavLinks }) {
  const col = (title: string, links: [string, string][]) => (
    <div><h2 className="text-base font-semibold text-ink">{title}</h2><ul className="mt-3">{links.map(([l, h]) => <li key={l}><Link href={h} className="inline-flex min-h-11 items-center text-lg text-neutral-800 hover:text-ink hover:underline">{l}</Link></li>)}</ul></div>
  );
  return (
    <footer className="border-t border-black/10 px-5 pb-10 pt-16 sm:px-10">
      <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Wordmark className="text-2xl" />
          <p className="mt-4 text-xl font-semibold tracking-tight text-ink" data-testid="brand-tag">Build with AI. Launch with confidence.</p>
          <p className="mt-3 max-w-sm text-lg leading-relaxed text-neutral-800">Website review for sites built with AI builders, no-code tools and code. Fixes go into your own source, not an overlay.</p>
        </div>
        {col('Product', [...nav, ...(SHOW_TOOLS ? [['Free tools', '/#tools'] as [string, string]] : []), ['Dashboard', '/app']])}
        {/* The four questions every scan answers, as on the page. Accessibility standards (WCAG 2.2 AA, ADA Title II, EN 301 549, AODA) stay on the accessibility checker page. */}
        {col('What we check', [['Clarity and trust', '/#pillars'], ['Action and conversion', '/#pillars'], ['Mobile and accessibility', '/#pillars'], ['Speed and design', '/#pillars']])}
        {col('Account', [['Create account', '/signup'], ['Log in', '/login'], ...(SHOW_FAQ ? [['FAQ', '/#faq'] as [string, string]] : []), ['Learn', '/learn'], ['Privacy', '/privacy'], ['Terms', '/terms']])}
      </div>
      <div className="mt-14 flex flex-wrap items-center justify-between gap-x-10 gap-y-3 border-t border-black/10 pt-6 text-base text-neutral-700">
        <p>© {new Date().getFullYear()} Avara</p>
        <p className="flex items-center gap-2.5"><Info aria-hidden className="size-4 shrink-0 text-vio-deep" /><span>Automated testing finds a share of issues. Avara does not certify legal or accessibility compliance.</span></p>
      </div>
    </footer>
  );
}
