// Shared layout for the free tools and guides: a wide, readable column under the same header and footer as every page.
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function Resource({ kicker, title, lede, children, wide, cta }: { kicker: string; title: string; lede: string; children: React.ReactNode; wide?: boolean; cta?: { title: string; text: string } }) {
  return (
    <main id="main" className="px-5 pb-24 pt-12 sm:px-10 sm:pt-16">
      <div className={`mx-auto ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-vio-deep">{kicker}</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-6xl">{title}</h1>
        <p className="mt-5 max-w-3xl text-xl leading-relaxed text-neutral-800">{lede}</p>
        <div className="mt-12">{children}</div>
        <div className="mt-16 rounded-[2rem] bg-[#e6f9b6] p-8">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">{cta?.title ?? 'Check your own page'}</h2>
          <p className="mt-2 text-lg leading-relaxed text-ink">{cta?.text ?? 'Scan a public page and get the findings with a fix for each one.'}</p>
          <Link href="/website-accessibility-checker" className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-ink px-6 text-lg font-semibold text-white hover:bg-neutral-800">Scan my page free<ArrowRight aria-hidden className="size-5" /></Link>
        </div>
      </div>
    </main>
  );
}
