'use client';
// Problem section visual: a polished page that "looks fine" (browser frame, dark nav with a menu icon, soft text, a Sign up
// button) with three callouts pinned to it, each saying who the page fails. Same language as the hero art: lime backdrop,
// white card, black pill, violet accents. The drawing is decorative (aria-hidden, no text in it); the callouts are real
// text in a list. Played once when it scrolls into view; with reduced motion it is shown finished. No statistics.
import * as React from 'react';
import { Check, Menu, X } from 'lucide-react';

const at = (s: number) => ({ animationDelay: `${s}s` });
const CALLOUTS = [
  { text: 'A screen reader announces only “button”.', pos: 'md:right-[-1rem] md:top-[-1.6rem]', t: 1.2 },
  { text: 'People with low vision cannot read it.', pos: 'md:left-[-1.5rem] md:top-[11.5rem]', t: 2.0 },
  { text: 'Keyboard users cannot reach it.', pos: 'md:bottom-[2.2rem] md:right-[-0.5rem]', t: 2.8 },
] as const;

export function ProblemVisual() {
  const box = React.useRef<HTMLDivElement>(null);
  const [wait, setWait] = React.useState(false);
  React.useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.7 && r.bottom > 0) return;
    setWait(true);
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setWait(false); io.disconnect(); } }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={box} className={`relative mx-auto w-full max-w-[34rem] ${wait ? 'hs-wait' : ''}`}>
      <span aria-hidden className="absolute inset-x-6 -inset-y-4 rounded-[3rem] bg-[#e6f9b6]" />
      <div className="relative px-2 py-6 sm:px-6">
        <div aria-hidden className="relative overflow-hidden rounded-[1.5rem] border border-black/10 bg-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.3)]">
          <div className="flex items-center gap-1.5 bg-[#f1f0ec] px-4 py-3"><span className="size-2.5 rounded-full bg-[#e08f84]" /><span className="size-2.5 rounded-full bg-[#e3c273]" /><span className="size-2.5 rounded-full bg-[#8fcf9a]" /><span className="ml-3 h-3 flex-1 rounded-full bg-white" /></div>
          <div className="flex items-center justify-between bg-[#111] px-5 py-3.5"><span className="h-2.5 w-24 rounded-full bg-white/50" /><span className="grid size-9 place-items-center rounded-lg border border-white/70 text-white"><Menu className="size-5" /></span></div>
          <div className="grid gap-6 p-6 sm:grid-cols-[1.1fr_1fr]">
            <span className="h-32 rounded-2xl bg-gradient-to-br from-[#e1f58a] to-[#c9efd2]" />
            <span className="grid content-center gap-3">
              <span className="h-3.5 w-4/5 rounded-full bg-[#111]" />
              <span className="h-3 w-full rounded-full bg-[#d9d9d4]" /><span className="h-3 w-5/6 rounded-full bg-[#dededa]" />
              <span className="mt-2 h-10 w-32 rounded-full bg-[#111]" />
            </span>
          </div>
        </div>
        <span aria-hidden className="hs-pop absolute left-5 top-0 inline-flex items-center gap-1.5 rounded-full bg-[#d9f56e] px-3.5 py-1.5 text-sm font-semibold text-ink shadow-sm" style={at(0.3)}><Check className="size-4" strokeWidth={3} />Looks fine</span>
        <ul aria-label="Why it still fails" className="mt-5 grid gap-3 md:mt-0 md:block">
          {CALLOUTS.map((c) => (
            <li key={c.text} className={`hs-pop flex max-w-[17rem] items-start gap-2.5 rounded-2xl border border-black/10 bg-white p-3.5 text-base font-medium leading-snug text-ink shadow-[0_10px_24px_-14px_rgba(0,0,0,0.4)] md:absolute ${c.pos}`} style={at(c.t)}>
              <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[#b3261e] text-white"><X className="size-4" strokeWidth={3} /></span>{c.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
