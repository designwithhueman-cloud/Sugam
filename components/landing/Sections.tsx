// Server-rendered sections: how it works, audiences, pricing, footer. Spacing is generous on
// purpose: large gaps between sections and between the elements inside them.
import Link from 'next/link';
import { Check, Minus, ArrowRight, Building2, Info, Rocket, Zap, Sparkles } from 'lucide-react';
import { PLANS, PLAN_ROWS } from '@/lib/plans.ts';
import { Wordmark } from './Header.tsx';
import { Reveal } from './Reveal.tsx';
import { NAV, type NavLinks } from './nav.ts';
import { SHOW_FAQ, SHOW_TOOLS } from './flags.ts';

export const kicker = 'text-sm font-semibold uppercase tracking-[0.14em] text-vio-deep';
export const h2 = 'text-4xl font-semibold leading-[1.05] tracking-[-0.025em] text-ink sm:text-5xl';

const CTA = { free: ['Scan my page free', '/website-accessibility-checker', ''], site: ['Join Creator waitlist', '/upgrade?plan=site', ''], agency: ['Join Agency waitlist', '/upgrade?plan=agency', ''] } as const;

/** Pricing: three short cards of equal height. Each says who it is for, the price, the same three comparison rows (so plans compare
 *  line by line), and one button. Paid plans are on a waitlist until checkout opens. */
export function Plans() {
  return (
    <Reveal><ul className="grid gap-5 lg:grid-cols-3 lg:gap-6">
      {PLANS.map((p, i) => {
        const free = p.id === 'free'; const pick = p.id === 'site';
        return (
          <li key={p.id} style={{ animationDelay: `${i * 90}ms` }} className={`hs-in flex flex-col rounded-[1.75rem] border p-6 sm:p-7 ${free ? 'border-[#cfe98a] bg-[#f3fbd9]' : pick ? 'border-[#5b2fd0] bg-white shadow-[0_24px_50px_-40px_rgba(67,32,153,.6)]' : 'border-black/10 bg-white'}`} data-testid={`plan-${p.id}`}>
            <span className={`self-start rounded-full px-2.5 py-0.5 text-sm font-semibold ${free ? 'bg-[#d9f56e] text-ink' : 'bg-[#efe9ff] text-[#432099]'}`}>{free ? 'Available now' : 'Waitlist'}</span>
            <h3 className="mt-3 flex items-center gap-2.5 text-xl font-semibold tracking-tight text-ink"><span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-full ${p.id === 'agency' ? 'bg-ink text-[#d9f56e]' : 'bg-[#d9f56e] text-ink'}`}>{free ? <Zap className="size-4" /> : p.id === 'site' ? <Rocket className="size-4" /> : <Building2 className="size-4" />}</span>{p.name}</h3>
            <p className="mt-4"><span className="text-4xl font-semibold tracking-tight text-ink">{p.price}</span> <span className="text-base text-neutral-700">{p.period}</span></p>
            <p className="mt-2 text-lg leading-snug text-ink">{p.tagline}</p>
            <dl className="mt-5 flex-1 space-y-3 border-t border-black/10 pt-5" data-testid={`plan-rows-${p.id}`}>
              {PLAN_ROWS.map((row) => { const v = row.values[p.id]; const no = v === 'Not included'; const [head, ...rest] = v.split(' · '); return (
                <div key={row.label} className="flex gap-3" data-testid={`plan-row-${row.label === 'AI-assisted checks' ? 'ai' : row.label === 'Automated checks' ? 'auto' : 'scores'}`}>
                  {no ? <Minus aria-hidden className="mt-1 size-5 shrink-0 text-neutral-400" /> : <Check aria-hidden className="mt-1 size-5 shrink-0 text-[#3b7a00]" />}
                  <div className="min-w-0">
                    <dt className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-[0.1em] text-[#432099]">{row.label === 'AI-assisted checks' && <Sparkles aria-hidden className="size-3.5" />}{row.label}</dt>
                    <dd className={`text-base leading-snug ${no ? 'text-neutral-600' : 'text-ink'}`}>{head}{rest.length ? <span className="text-neutral-700"> · {rest.join(' · ')}</span> : null}</dd>
                  </div>
                </div>); })}
            </dl>
            <Link href={CTA[p.id][1]} className={`mt-6 inline-flex min-h-14 items-center justify-center gap-2 rounded-xl px-6 text-lg font-semibold ${free ? 'border border-ink text-ink hover:bg-black/5' : 'bg-ink text-white hover:bg-neutral-800'}`}>{CTA[p.id][0]}{!free && <span className="sr-only"> for {p.name}</span>}<ArrowRight aria-hidden className="size-5" /></Link>
          </li>
        );
      })}
    </ul></Reveal>
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
