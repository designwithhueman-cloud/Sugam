import * as React from 'react';
import { Plus, type LucideIcon } from 'lucide-react';

export function LandingFaq({ items, title, lede, icons, art }: { items: [string, React.ReactNode][]; title?: React.ReactNode; lede?: string; icons?: LucideIcon[]; art?: React.ReactNode }) {
  return (
    <section id="faq" aria-labelledby="faq-h" className="scroll-mt-6 grid grid-cols-[minmax(0,1fr)] gap-10 px-5 pb-20 sm:px-10 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)] lg:gap-14 lg:pb-32">
      <div><h2 id="faq-h" className="text-4xl font-semibold leading-[1.05] tracking-[-0.025em] text-ink sm:text-5xl">{title ?? <>Frequently asked <span className="text-vio-deep">questions</span></>}</h2>
      <p className="mt-5 text-xl leading-snug text-neutral-800">{lede ?? 'Straight answers about what automated testing can and cannot do.'}</p>{art && <div className="mt-8 hidden lg:block">{art}</div>}</div>
      <div className="divide-y divide-black/10 rounded-[1.75rem] border border-black/10 bg-white">
        {items.map(([q, a], n) => { const Icon = icons?.[n]; return (
          <details key={q} className="group">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-[1.75rem] px-5 py-3 text-xl font-semibold text-ink marker:hidden"><span className="flex items-center gap-3.5">{Icon && <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e6f9b6] text-ink"><Icon className="size-5" /></span>}<span>{q}</span></span><Plus aria-hidden className="size-5 shrink-0 transition-transform group-open:rotate-45" /></summary>
            <div className="px-5 pb-5 text-lg leading-snug text-neutral-800">{a}</div>
          </details>
        ); })}
      </div>
    </section>
  );
}
