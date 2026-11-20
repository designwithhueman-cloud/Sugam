// Hero illustration, built in HTML so its parts can move: a page that "looks fine" inside a browser frame, with six
// assistive-technology bubbles around it (hearing, zoom, eye, captions, voice, keyboard), a violet accessibility badge and a
// Resolved tag. One short intro, about 3 seconds, played once on load and never repeated, so it needs no pause control
// (WCAG 2.2.2). The base styles are the finished picture, so with reduced motion, or before styles load, everything is shown at
// once. Decorative: one image role with a text alternative; nothing inside is read separately. Server-rendered.
import { Accessibility, Captions, Check, Ear, Eye, Keyboard, Menu, Mic, ZoomIn, type LucideIcon } from 'lucide-react';

const at = (s: number) => ({ animationDelay: `${s}s` });
// Positions are percentages of the 916 x 816 drawing.
const BUBBLES: { Icon: LucideIcon; left: number; top: number; t: number }[] = [
  { Icon: Ear, left: 61.7, top: 10.4, t: 0.7 },
  { Icon: ZoomIn, left: 78.4, top: 26.7, t: 1.0 },
  { Icon: Eye, left: 81.7, top: 47.5, t: 1.3 },
  { Icon: Captions, left: 68.2, top: 65.5, t: 1.6 },
  { Icon: Mic, left: 16.9, top: 70.1, t: 1.9 },
  { Icon: Keyboard, left: 7.6, top: 50.8, t: 2.2 },
];

export function HeroArt() {
  return (
    <div role="img" aria-label="A website with accessibility tools around it: keyboard, voice, zoom, captions, hearing and a screen reader, and a Resolved badge." className="relative mx-auto aspect-[916/816] w-full max-w-[34rem]">
      <span aria-hidden className="hs-in absolute left-[10%] top-[11.5%] h-[67%] w-[80%] rounded-full bg-[#e6f9b6]" style={at(0)} />
      {/* The browser */}
      <div aria-hidden className="hs-in absolute left-[15%] top-[17.8%] h-[53.3%] w-[66.3%] overflow-hidden rounded-[1.4rem] border border-black/10 bg-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.3)]" style={at(0.1)}>
        <div className="flex h-[12%] items-center gap-1.5 bg-[#f1f0ec] px-4"><span className="size-2 rounded-full bg-[#e08f84]" /><span className="size-2 rounded-full bg-[#e3c273]" /><span className="size-2 rounded-full bg-[#8fcf9a]" /><span className="ml-2 h-2 flex-1 rounded-full bg-white" /></div>
        <div className="flex h-[16%] items-center justify-between bg-[#111] px-[5%]">
          <span className="h-2 w-[22%] rounded-full bg-white/45" />
          <span className="hs-ring grid size-[1.9rem] place-items-center rounded-lg border-2 border-vio bg-[#111] text-white ring-4 ring-vio/30" style={at(1.9)}><Menu className="size-4" /></span>
        </div>
        <div className="grid h-[72%] grid-cols-[1.1fr_1fr] gap-[5%] p-[5%]">
          <span className="hs-in relative h-full overflow-hidden rounded-xl bg-gradient-to-br from-[#e1f58a] to-[#c9efd2]" style={at(0.3)}>
            <span className="absolute right-[12%] top-[14%] size-[16%] rounded-full bg-white/70" />
            <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-[62%] w-full"><path d="M0 60 L0 38 L26 8 L46 30 L66 14 L100 44 L100 60 Z" fill="#7c7aa8" opacity="0.85" /></svg>
          </span>
          <span className="grid content-center gap-2">
            <span className="hs-in h-2.5 w-[78%] rounded-full bg-[#111]" style={at(0.45)} />
            <span className="hs-in h-1.5 w-full rounded-full bg-[#d9d9d4]" style={at(0.55)} /><span className="hs-in h-1.5 w-[85%] rounded-full bg-[#dededa]" style={at(0.62)} /><span className="hs-in h-1.5 w-[65%] rounded-full bg-[#e2e2de]" style={at(0.69)} />
            <span className="hs-in mt-1 h-6 w-[55%] rounded-full bg-[#111]" style={at(0.8)} />
          </span>
        </div>
      </div>
      {/* Accessibility badge */}
      <span aria-hidden className="hs-pop absolute left-[7.4%] top-[25.1%] grid h-[12.6%] w-[14.1%] place-items-center rounded-full bg-vio text-white shadow-[0_10px_24px_-10px_rgba(91,47,208,0.7)]" style={at(0.4)}><Accessibility className="size-[48%]" /></span>
      {/* Assistive-technology bubbles */}
      {BUBBLES.map(({ Icon, left, top, t }) => (
        <span key={left} aria-hidden className="hs-pop absolute grid aspect-square w-[10.4%] place-items-center rounded-full border border-black/5 bg-white text-vio-deep shadow-[0_8px_22px_-10px_rgba(0,0,0,0.35)]" style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${t}s` }}><Icon className="size-[46%]" strokeWidth={1.8} /></span>
      ))}
      {/* Resolved */}
      <span aria-hidden className="hs-pop absolute left-[37%] top-[73.5%] inline-flex items-center gap-2 rounded-full bg-[#2d5a1e] px-[3.2%] py-[1.6%] text-base font-semibold text-white shadow-sm" style={at(2.6)}><Check className="size-4" strokeWidth={2.6} />Resolved</span>
    </div>
  );
}
