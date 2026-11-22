'use client';
// The landing page's one entrance motion: children marked hs-in (fade up) or hs-pop (pop in) wait until this block scrolls into view, then
// play once. The same classes, timing and reduced-motion rule as the hero, the problem visual and the quote (app/globals.css).
import * as React from 'react';

export function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const box = React.useRef<HTMLDivElement>(null); const [wait, setWait] = React.useState(false);
  React.useEffect(() => {
    const el = box.current; if (!el || typeof IntersectionObserver === 'undefined') return;
    const r = el.getBoundingClientRect(); if (r.top < innerHeight * 0.8 && r.bottom > 0) return;   // already in view: play now
    setWait(true);
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setWait(false); io.disconnect(); } }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={box} className={`${className} ${wait ? 'hs-wait' : ''}`}>{children}</div>;
}
