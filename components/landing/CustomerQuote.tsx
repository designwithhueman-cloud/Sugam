'use client';
// The customer's answer to "could I do this myself?": a full-width dark band placed directly under the fix example in How
// it works. His words are about the same problem (a booking button hidden behind a bar), so the label says so. Shows the whole
// approved quote, word for word, with its highlight phrase marked, and his name, role and company on one line. Renders nothing without
// an approved quote (lib/testimonial.ts), so there is never a made-up endorsement. Light text on #1e1e1e is above 7:1; the
// marked line is dark on lime, drawn once with a marker stroke when the band scrolls into view (shown at once with reduced motion).
import * as React from 'react';
import { TESTIMONIAL, type Testimonial } from '@/lib/testimonial.ts';

const hasQuote = (t: Testimonial | null) => !!t && t.approved && !!t.highlight && t.quote.includes(t.highlight);

export function CustomerQuote({ t = TESTIMONIAL }: { t?: Testimonial | null }) {
  const box = React.useRef<HTMLElement>(null);
  const [wait, setWait] = React.useState(false);
  React.useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.7 && r.bottom > 0) return;
    setWait(true);
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setWait(false); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  if (!t || !hasQuote(t)) return null;
  const i = t.quote.indexOf(t.highlight), before = t.quote.slice(0, i), after = t.quote.slice(i + t.highlight.length);
  return (
    <figure ref={box} id="quote" className={`on-dark mb-20 bg-[#1e1e1e] px-5 py-10 text-center text-white sm:px-10 lg:mb-32 lg:py-12 ${wait ? 'hs-wait' : ''}`}>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#d9f56e]">A customer with the same problem</p>
      <blockquote className="mx-auto mt-5 max-w-[88rem] text-balance text-xl font-medium italic leading-[1.6] tracking-[-0.015em] sm:text-2xl sm:leading-[1.6] lg:text-[clamp(1.15rem,1.75vw,1.75rem)] lg:leading-[1.65]">{before}<mark className="hs-mark rounded-md bg-transparent px-1.5 py-0.5 font-semibold text-ink">{t.highlight}</mark>{after}</blockquote>
      <figcaption className="mt-6"><p className="text-lg"><span className="qn font-semibold">{t.name}</span><span className="qr text-neutral-300">, {t.role}, {t.company}</span></p></figcaption>
    </figure>
  );
}
