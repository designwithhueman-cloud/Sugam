'use client';
// A full-width dark band with one approved customer quote, built to stop a scroller: a small lime label above the
// quote in large italic type on a plain dark background, the phrase that says what changed marked with a lime highlighter stroke that sweeps across once as the band
// scrolls into view, and the person named on one line. Renders nothing without an approved quote (lib/testimonial.ts), so there
// is never a made-up endorsement. With reduced motion the highlight is simply shown. Light text on #1e1e1e is above 7:1; the marked
// phrase is dark on lime. Stars show only if the customer gave a rating.
import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Star } from 'lucide-react';
import { TESTIMONIAL, type Testimonial } from '@/lib/testimonial.ts';

function Quote({ t }: { t: Testimonial }) {
  const i = t.quote.indexOf(t.highlight);
  const parts = i < 0 || !t.highlight ? [t.quote, '', ''] : [t.quote.slice(0, i), t.highlight, t.quote.slice(i + t.highlight.length)];
  return <>{parts[0]}{parts[1] && <mark className="hs-mark rounded-md bg-transparent px-1.5 py-0.5 font-semibold text-ink">{parts[1]}</mark>}{parts[2]}</>;
}

export function QuoteBand({ t = TESTIMONIAL }: { t?: Testimonial | null }) {
  const box = React.useRef<HTMLElement>(null);
  const [wait, setWait] = React.useState(false);
  React.useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.6 && r.bottom > 0) return;
    setWait(true);
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setWait(false); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  if (!t || !t.approved) return null;
  return (
    <section ref={box} id="quote" aria-labelledby="quote-h" className={`on-dark relative mb-20 overflow-hidden bg-[#1e1e1e] px-5 py-14 text-center text-white sm:px-10 lg:mb-32 lg:py-20 ${wait ? 'hs-wait' : ''}`}>
      <figure className="relative mx-auto max-w-none">
        <h2 id="quote-h" className="sr-only">What a customer says</h2>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#d9f56e]">What a customer found</p>
        {t.rating ? <div role="img" aria-label={`${t.rating} out of 5 stars`} className="mt-5 flex justify-center gap-1.5">{Array.from({ length: 5 }, (_, k) => <Star key={k} aria-hidden className={`size-6 ${k < t.rating! ? 'fill-[#d9f56e] text-[#d9f56e]' : 'text-white/30'}`} />)}</div> : null}
        <blockquote className="mx-auto mt-5 max-w-[88rem] text-balance text-xl font-medium italic leading-[1.6] tracking-[-0.015em] sm:text-2xl sm:leading-[1.6] lg:text-[clamp(1.15rem,1.75vw,1.75rem)] lg:leading-[1.65]">{t.quote.length ? <Quote t={t} /> : null}</blockquote>
        <figcaption className="mt-6 flex flex-col items-center gap-2">
          {t.photo ? <img src={t.photo} alt="" width={64} height={64} className="size-16 rounded-full object-cover ring-4 ring-[#d9f56e]/60" /> : null}
          <p className="text-lg"><span className="qn font-semibold">{t.name}</span><span className="qr text-neutral-300">, {t.role}, {t.company}{t.builder ? ` · built with ${t.builder}` : ''}</span></p>
          {t.href ? <Link href={t.href} className="inline-flex min-h-11 items-center gap-2 text-lg font-semibold text-[#d9f56e] underline underline-offset-4 hover:no-underline">See the fix<ArrowRight aria-hidden className="size-4" /></Link> : null}
        </figcaption>
      </figure>
    </section>
  );
}
